import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveExecutionLimits } from "@/lib/execution-limits";
import { RequestRateLimiter } from "@/lib/request-rate-limiter";
import { GOOGLE_TEXT_SEARCH_COST, PROVIDER_SLUGS } from "@/lib/providers/constants";
import { searchPlaceCandidatesNew } from "@/lib/providers/google";
import { getProviderBySlug, getProviderSecret, ProviderRequestError } from "@/lib/providers/request";

export const runtime = "nodejs";

const matchBodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  limits: z
    .object({
      scope: z.enum(["master", "search", "phone"]).optional(),
      maxLeads: z.coerce.number().int().min(1).max(500).optional(),
      maxGoogleCalls: z.coerce.number().int().positive().optional(),
      maxCostUsd: z.coerce.number().positive().optional(),
      rateLimitRps: z.coerce.number().int().min(1).max(10).optional(),
    })
    .optional(),
  retryNoMatch: z.boolean().optional(),
});

const GOOGLE_NOT_CONFIGURED = {
  code: "PROVIDER_NOT_CONFIGURED",
  provider: PROVIDER_SLUGS.GOOGLE,
  message: "Google Places provider is not configured in API Hub.",
} as const;

type MatchResult = {
  id: string;
  status: "matched" | "no_match" | "failed";
  confidence?: number;
  reason?: string;
};

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCandidateCity(formattedAddress: string | null): string | null {
  if (!formattedAddress) return null;
  const parts = formattedAddress.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  return parts[parts.length - 2] ?? null;
}

function candidateIsCt(formattedAddress: string | null, parsedState?: string | null): boolean {
  if ((parsedState ?? "").toUpperCase() === "CT") return true;
  return /\bCT\b/.test(formattedAddress ?? "");
}

function addressMatches(leadAddress: string | null, candidateAddress: string | null): boolean {
  const lead = normalizeText(leadAddress);
  const candidate = normalizeText(candidateAddress);
  if (!lead || !candidate) return false;

  const number = lead.match(/\b\d{1,6}\b/)?.[0];
  const street = lead
    .replace(/\b\d{1,6}\b/g, " ")
    .split(" ")
    .filter((token) => token.length >= 3)
    .slice(0, 3)
    .join(" ");

  const numberMatches = number ? candidate.includes(number) : false;
  const streetMatches = street ? candidate.includes(street) : false;

  return numberMatches || streetMatches;
}

function scoreCandidate(lead: { city: string | null; address1: string | null }, candidate: { city: string | null; state: string | null; formattedAddress: string | null }): number {
  let score = 0;
  const leadCity = normalizeText(lead.city);
  const candidateCity = normalizeText(candidate.city ?? parseCandidateCity(candidate.formattedAddress));

  if (leadCity && candidateCity && leadCity === candidateCity) {
    score += 60;
  }

  if (candidateIsCt(candidate.formattedAddress, candidate.state)) {
    score += 20;
  }

  if (addressMatches(lead.address1, candidate.formattedAddress)) {
    score += 20;
  }

  return Math.min(100, Math.max(0, score));
}

function truncateError(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 2000);
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await request.json().catch(() => ({}));
  const parsed = matchBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const ids = Array.from(new Set(parsed.data.ids.map((id) => id.trim()).filter(Boolean)));
  const retryNoMatch = Boolean(parsed.data.retryNoMatch);
  const limits = resolveExecutionLimits(parsed.data.limits, "search");

  let providerEnabled = false;
  let apiKey: string | null = null;
  let hasSearchEndpoint = false;

  try {
    const provider = await getProviderBySlug(PROVIDER_SLUGS.GOOGLE);
    apiKey = (await getProviderSecret(PROVIDER_SLUGS.GOOGLE))?.trim() ?? null;
    providerEnabled = Boolean(provider.enabled);
    const endpoints = (provider.endpoints ?? {}) as Record<string, unknown>;
    hasSearchEndpoint = typeof endpoints.text_search_new === "string" && Boolean(endpoints.text_search_new.trim());
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      return NextResponse.json(GOOGLE_NOT_CONFIGURED, { status: error.statusCode });
    }
    return NextResponse.json({ error: "Failed to load Google provider settings." }, { status: 500 });
  }

  const keyPresent = Boolean(apiKey);

  console.info(
    `[api/leads/match-google] requestedIds=${ids.length} providerEnabled=${providerEnabled} keyPresent=${keyPresent} maxLeads=${limits.maxLeads} rateLimitRps=${limits.rateLimitRps}`,
  );

  if (!providerEnabled || !keyPresent) {
    return NextResponse.json(GOOGLE_NOT_CONFIGURED, { status: 500 });
  }
  if (!hasSearchEndpoint) {
    return NextResponse.json(GOOGLE_NOT_CONFIGURED, { status: 500 });
  }
  const googleApiKey = apiKey ?? "";

  const eligible = await db.lead.findMany({
    where: {
      id: { in: ids },
      externalId: null,
      phone: null,
      OR: retryNoMatch
        ? [{ matchStatus: null }, { matchStatus: "FAILED" }, { matchStatus: "NO_MATCH" }]
        : [{ matchStatus: null }, { matchStatus: "FAILED" }],
    },
    orderBy: { createdAt: "desc" },
  });

  let attempted = 0;
  let matched = 0;
  let noMatch = 0;
  let failed = 0;
  let googleCallsUsed = 0;
  let stoppedEarly = false;
  let stopReason: string | undefined;
  let hasUpstreamError = false;

  const limiter = new RequestRateLimiter(limits.rateLimitRps);
  const results: MatchResult[] = [];

  for (const lead of eligible) {
    if (attempted >= limits.maxLeads) {
      stoppedEarly = true;
      stopReason = `maxLeads_reached_${limits.maxLeads}`;
      break;
    }

    if (typeof limits.maxGoogleCalls === "number" && googleCallsUsed >= limits.maxGoogleCalls) {
      stoppedEarly = true;
      stopReason = `maxGoogleCalls_reached_${limits.maxGoogleCalls}`;
      break;
    }

    if (typeof limits.maxCostUsd === "number" && (googleCallsUsed + 1) * GOOGLE_TEXT_SEARCH_COST > limits.maxCostUsd) {
      stoppedEarly = true;
      stopReason = `maxCostUsd_reached_${limits.maxCostUsd}`;
      break;
    }

    attempted += 1;
    try {
      const query = [lead.name, lead.address1, lead.city, "CT"].filter(Boolean).join(" ");
      googleCallsUsed += 1;

      const candidates = await searchPlaceCandidatesNew({
        query,
        apiKey: googleApiKey,
        limiter,
        leadId: lead.id,
      });

      if (!candidates.length) {
        noMatch += 1;
        await db.lead.update({
          where: { id: lead.id },
          data: {
            matchStatus: "NO_MATCH",
            matchAttemptedAt: new Date(),
            matchConfidence: 0,
            matchError: null,
          },
        });
        results.push({ id: lead.id, status: "no_match", confidence: 0, reason: "no_candidates" });
        continue;
      }

      const scored = candidates.map((candidate) => ({
        candidate,
        confidence: scoreCandidate(
          { city: lead.city, address1: lead.address1 },
          {
            city: candidate.city,
            state: candidate.state,
            formattedAddress: candidate.formattedAddress,
          },
        ),
      }));
      scored.sort((a, b) => b.confidence - a.confidence);
      const best = scored[0];

      if (best.confidence >= 80) {
        matched += 1;
        await db.lead.update({
          where: { id: lead.id },
          data: {
            externalId: best.candidate.placeId,
            matchStatus: "MATCHED",
            matchAttemptedAt: new Date(),
            matchConfidence: best.confidence,
            matchError: null,
          },
        });
        results.push({ id: lead.id, status: "matched", confidence: best.confidence });
      } else {
        noMatch += 1;
        await db.lead.update({
          where: { id: lead.id },
          data: {
            matchStatus: "NO_MATCH",
            matchAttemptedAt: new Date(),
            matchConfidence: best.confidence,
            matchError: null,
          },
        });
        results.push({ id: lead.id, status: "no_match", confidence: best.confidence, reason: "low_confidence" });
      }
    } catch (error) {
      failed += 1;
      if (error instanceof ProviderRequestError && error.code === "PROVIDER_REQUEST_FAILED") {
        hasUpstreamError = true;
      }

      const reason =
        error instanceof ProviderRequestError && error.upstreamStatus === 429 ? "rate_limited" : "google_request_failed";

      await db.lead.update({
        where: { id: lead.id },
        data: {
          matchStatus: "FAILED",
          matchAttemptedAt: new Date(),
          matchError: truncateError(error instanceof Error ? error.message : reason),
        },
      });

      results.push({ id: lead.id, status: "failed", reason });
    }
  }

  console.info(
    `[api/leads/match-google] attempted=${attempted} matched=${matched} no_match=${noMatch} failed=${failed} googleCallsUsed=${googleCallsUsed} stoppedEarly=${stoppedEarly}`,
  );

  return NextResponse.json(
    {
      attempted,
      matched,
      no_match: noMatch,
      failed,
      googleCallsUsed,
      stoppedEarly,
      stopReason,
      results,
    },
    { status: hasUpstreamError ? 502 : 200 },
  );
}
