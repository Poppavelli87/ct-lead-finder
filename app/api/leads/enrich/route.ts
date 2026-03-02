import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveExecutionLimits } from "@/lib/execution-limits";
import { RequestRateLimiter } from "@/lib/request-rate-limiter";
import { computeQualificationScore, isQualifiedLead } from "@/lib/qualification";
import { GOOGLE_DETAILS_COST, PROVIDER_SLUGS } from "@/lib/providers/constants";
import { fetchPhoneFromPlaceId } from "@/lib/providers/google";
import { getProviderBySlug, getProviderSecret, ProviderRequestError } from "@/lib/providers/request";
import { domainFromWebsite } from "@/lib/utils";

export const runtime = "nodejs";

const enrichBodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  mode: z.enum(["PHONE_ONLY"]).optional(),
  retryNoPhone: z.boolean().optional(),
  limits: z
    .object({
      scope: z.enum(["master", "search", "phone"]).optional(),
      maxLeads: z.coerce.number().int().min(1).max(500).optional(),
      maxGoogleCalls: z.coerce.number().int().positive().optional(),
      maxCostUsd: z.coerce.number().positive().optional(),
      rateLimitRps: z.coerce.number().int().min(1).max(10).optional(),
    })
    .optional(),
});

const GOOGLE_NOT_CONFIGURED = {
  code: "PROVIDER_NOT_CONFIGURED",
  provider: PROVIDER_SLUGS.GOOGLE,
  message: "Google Places provider is not configured in API Hub.",
} as const;

type EnrichResult = {
  id: string;
  status: "updated" | "skipped" | "no_phone" | "failed";
  reason?: string;
};

function truncateError(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 2000);
}

function resolvePlaceId(lead: { externalId: string | null }): string | null {
  const value = String(lead.externalId ?? "").trim();
  return value || null;
}

async function updatePhoneFromExistingLead(leadId: string, phone: string, reason: string): Promise<EnrichResult> {
  const existing = await db.lead.findUnique({ where: { id: leadId } });
  if (!existing) {
    return { id: leadId, status: "failed", reason: "lead_not_found" };
  }

  const nextLead = { ...existing, phone };
  await db.lead.update({
    where: { id: leadId },
    data: {
      phone,
      phoneStatus: "FOUND",
      phoneAttemptedAt: new Date(),
      phoneError: null,
      qualificationScore: computeQualificationScore(nextLead),
      qualified: isQualifiedLead(nextLead),
      lastEnrichedAt: new Date(),
    },
  });

  return { id: leadId, status: "updated", reason };
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await request.json().catch(() => ({}));
  const parsed = enrichBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const mode = parsed.data.mode ?? "PHONE_ONLY";
  const ids = Array.from(new Set(parsed.data.ids.map((id) => id.trim()).filter(Boolean)));
  const retryNoPhone = Boolean(parsed.data.retryNoPhone);
  const limits = resolveExecutionLimits(parsed.data.limits, "phone");

  let providerEnabled = false;
  let apiKey: string | null = null;
  let hasPhoneEndpoint = false;

  try {
    const provider = await getProviderBySlug(PROVIDER_SLUGS.GOOGLE);
    apiKey = (await getProviderSecret(PROVIDER_SLUGS.GOOGLE))?.trim() ?? null;
    providerEnabled = Boolean(provider.enabled);
    const endpoints = (provider.endpoints ?? {}) as Record<string, unknown>;
    hasPhoneEndpoint =
      typeof endpoints.place_phone_details === "string" && Boolean(endpoints.place_phone_details.trim());
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      return NextResponse.json(GOOGLE_NOT_CONFIGURED, { status: error.statusCode });
    }
    return NextResponse.json({ error: "Failed to load Google provider settings." }, { status: 500 });
  }

  const keyPresent = Boolean(apiKey);

  console.info(
    `[api/leads/enrich] mode=${mode} requestedIds=${ids.length} providerEnabled=${providerEnabled} keyPresent=${keyPresent} maxLeads=${limits.maxLeads} rateLimitRps=${limits.rateLimitRps}`,
  );

  if (!providerEnabled || !keyPresent) {
    return NextResponse.json(GOOGLE_NOT_CONFIGURED, { status: 500 });
  }
  if (!hasPhoneEndpoint) {
    return NextResponse.json(GOOGLE_NOT_CONFIGURED, { status: 500 });
  }
  const googleApiKey = apiKey ?? "";

  const leads = await db.lead.findMany({
    where: { id: { in: ids } },
  });
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));

  const limiter = new RequestRateLimiter(limits.rateLimitRps);
  const results: EnrichResult[] = [];

  let attempted = 0;
  let updated = 0;
  let noPhone = 0;
  let skipped = 0;
  let failed = 0;
  let googleCallsUsed = 0;
  let stoppedEarly = false;
  let stopReason: string | undefined;
  let hasUpstreamError = false;

  for (const id of ids) {
    const lead = leadById.get(id);
    if (!lead) {
      failed += 1;
      results.push({ id, status: "failed", reason: "lead_not_found" });
      continue;
    }

    if ((lead.phone ?? "").trim()) {
      skipped += 1;
      results.push({ id, status: "skipped", reason: "already_has_phone" });
      continue;
    }

    if (lead.phoneStatus === "NO_PHONE" && !retryNoPhone) {
      skipped += 1;
      results.push({ id, status: "skipped", reason: "no_phone_already_attempted" });
      continue;
    }

    const placeId = resolvePlaceId(lead);
    if (!placeId) {
      skipped += 1;
      results.push({ id, status: "skipped", reason: "missing_place_id" });
      continue;
    }

    if (attempted >= limits.maxLeads) {
      stoppedEarly = true;
      stopReason = `maxLeads_reached_${limits.maxLeads}`;
      skipped += 1;
      results.push({ id, status: "skipped", reason: stopReason });
      continue;
    }

    attempted += 1;

    const existingPlacePhone = await db.lead.findFirst({
      where: {
        id: { not: lead.id },
        externalId: placeId,
        phone: { not: null },
      },
      select: { phone: true },
    });

    if ((existingPlacePhone?.phone ?? "").trim()) {
      const updateResult = await updatePhoneFromExistingLead(lead.id, existingPlacePhone!.phone!, "copied_from_place_id");
      results.push(updateResult);
      updated += updateResult.status === "updated" ? 1 : 0;
      continue;
    }

    const domain = lead.domain || domainFromWebsite(lead.website);
    if (domain && lead.city) {
      const domainCityPhone = await db.lead.findFirst({
        where: {
          id: { not: lead.id },
          domain,
          city: { equals: lead.city, mode: "insensitive" },
          phone: { not: null },
        },
        select: { phone: true },
        orderBy: { updatedAt: "desc" },
      });

      if ((domainCityPhone?.phone ?? "").trim()) {
        const updateResult = await updatePhoneFromExistingLead(lead.id, domainCityPhone!.phone!, "copied_from_domain_city");
        results.push(updateResult);
        updated += updateResult.status === "updated" ? 1 : 0;
        continue;
      }
    }

    if (domain) {
      const masterPhone = await db.masterRecord.findFirst({
        where: {
          website: { equals: domain, mode: "insensitive" },
          phone: { not: null },
        },
        select: { phone: true },
        orderBy: { createdAt: "desc" },
      });

      if ((masterPhone?.phone ?? "").trim()) {
        const updateResult = await updatePhoneFromExistingLead(lead.id, masterPhone!.phone!, "copied_from_master_domain");
        results.push(updateResult);
        updated += updateResult.status === "updated" ? 1 : 0;
        continue;
      }
    }

    if (typeof limits.maxGoogleCalls === "number" && googleCallsUsed >= limits.maxGoogleCalls) {
      stoppedEarly = true;
      stopReason = `maxGoogleCalls_reached_${limits.maxGoogleCalls}`;
      skipped += 1;
      results.push({ id, status: "skipped", reason: stopReason });
      continue;
    }

    if (typeof limits.maxCostUsd === "number" && (googleCallsUsed + 1) * GOOGLE_DETAILS_COST > limits.maxCostUsd) {
      stoppedEarly = true;
      stopReason = `maxCostUsd_reached_${limits.maxCostUsd}`;
      skipped += 1;
      results.push({ id, status: "skipped", reason: stopReason });
      continue;
    }

    try {
      googleCallsUsed += 1;
      const phoneResponse = await fetchPhoneFromPlaceId(placeId, googleApiKey, {
        limiter,
        leadId: lead.id,
      });

      const phone = phoneResponse.phone?.trim() ?? "";
      if (phone) {
        const nextLead = { ...lead, phone };
        await db.lead.update({
          where: { id: lead.id },
          data: {
            phone,
            phoneStatus: "FOUND",
            phoneAttemptedAt: new Date(),
            phoneError: null,
            qualificationScore: computeQualificationScore(nextLead),
            qualified: isQualifiedLead(nextLead),
            lastEnrichedAt: new Date(),
          },
        });
        updated += 1;
        results.push({ id: lead.id, status: "updated" });
      } else {
        await db.lead.update({
          where: { id: lead.id },
          data: {
            phoneStatus: "NO_PHONE",
            phoneAttemptedAt: new Date(),
            phoneError: null,
          },
        });
        noPhone += 1;
        results.push({ id: lead.id, status: "no_phone", reason: "phone_not_found" });
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
          phoneStatus: "FAILED",
          phoneAttemptedAt: new Date(),
          phoneError: truncateError(error instanceof Error ? error.message : reason),
        },
      });

      results.push({ id: lead.id, status: "failed", reason });
    }
  }

  console.info(
    `[api/leads/enrich] mode=${mode} attempted=${attempted} updated=${updated} no_phone=${noPhone} skipped=${skipped} failed=${failed} googleCallsUsed=${googleCallsUsed} stoppedEarly=${stoppedEarly} providerEnabled=${providerEnabled} keyPresent=${keyPresent}`,
  );

  return NextResponse.json(
    {
      attempted,
      updated,
      no_phone: noPhone,
      skipped,
      failed,
      googleCallsUsed,
      stoppedEarly,
      stopReason,
      results,
    },
    { status: hasUpstreamError ? 502 : 200 },
  );
}
