import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveExecutionLimits } from "@/lib/execution-limits";
import { isMasterDuplicate } from "@/lib/master-dedupe";
import { computeQualificationScore, isQualifiedLead } from "@/lib/qualification";
import { PROVIDER_SLUGS } from "@/lib/providers/constants";
import { getProviderBySlug, getProviderSecret, ProviderRequestError, providerRequest } from "@/lib/providers/request";

export const runtime = "nodejs";

const importBodySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(5000).optional(),
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

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function normalizeKeyPart(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function parseMailingAddress(raw: string | null): {
  address1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
} {
  if (!raw) {
    return { address1: null, city: null, state: "CT", zip: null };
  }

  const compact = raw.replace(/\s+/g, " ").trim();
  const match = compact.match(/^(.*?),\s*([^,]+),\s*([A-Z]{2})\s*(\d{5})?/i);
  if (match) {
    return {
      address1: match[1]?.trim() || null,
      city: match[2]?.trim() || null,
      state: (match[3]?.trim().toUpperCase() || "CT"),
      zip: match[4]?.trim() || null,
    };
  }

  const parts = compact.split(",").map((part) => part.trim()).filter(Boolean);
  const address1 = parts[0] ?? null;
  const city = parts[1] ?? null;
  const stateZip = parts[2] ?? "";
  const stateMatch = stateZip.match(/\b([A-Z]{2})\b/i);
  const zipMatch = stateZip.match(/\b(\d{5})\b/);

  return {
    address1,
    city,
    state: stateMatch ? stateMatch[1].toUpperCase() : "CT",
    zip: zipMatch ? zipMatch[1] : null,
  };
}

function valueFromRow(row: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function datasetEndpoint(endpoints: Record<string, unknown>, datasetId: string): string {
  const template = typeof endpoints.query === "string" ? endpoints.query : "/resource/{datasetId}.json";
  if (template.includes("{datasetId}")) {
    return template.replace("{datasetId}", datasetId);
  }
  return `/resource/${datasetId}.json`;
}

async function existsLeadByIdentity(name: string, address1: string | null, city: string | null, zip: string | null): Promise<boolean> {
  const and: Prisma.LeadWhereInput[] = [{ name: { equals: name, mode: "insensitive" } }];
  and.push(address1 ? { address1: { equals: address1, mode: "insensitive" } } : { address1: null });
  and.push(city ? { city: { equals: city, mode: "insensitive" } } : { city: null });
  and.push(zip ? { zip } : { zip: null });

  const found = await db.lead.findFirst({
    where: {
      AND: and,
    },
    select: { id: true },
  });
  return Boolean(found);
}

function parseDateRange(startDate?: string, endDate?: string): { startDate: string; endDate: string } {
  const parse = (value?: string) => {
    if (!value) return null;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const today = new Date();
  const end = parse(endDate) ?? today;
  const startFallback = new Date(end);
  startFallback.setUTCDate(startFallback.getUTCDate() - 7);
  const start = parse(startDate) ?? startFallback;

  return {
    startDate: toIsoDate(start),
    endDate: toIsoDate(end),
  };
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await request.json().catch(() => ({}));
  const parsed = importBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const limits = resolveExecutionLimits(parsed.data.limits, "master");
  const fetchLimit = Math.min(5000, Math.max(1, parsed.data.limit ?? 1000));
  const dateRange = parseDateRange(parsed.data.startDate, parsed.data.endDate);

  try {
    const provider = await getProviderBySlug(PROVIDER_SLUGS.SOCRATA);
    if (!provider.enabled) {
      return NextResponse.json(
        {
          code: "PROVIDER_NOT_CONFIGURED",
          provider: PROVIDER_SLUGS.SOCRATA,
          message: "Configure Connecticut Socrata in API Hub.",
        },
        { status: 500 },
      );
    }

    const endpoints = (provider.endpoints ?? {}) as Record<string, unknown>;
    const datasetId = String(endpoints.dataset_id ?? endpoints.datasetId ?? "").trim();
    if (!datasetId) {
      return NextResponse.json(
        {
          code: "PROVIDER_NOT_CONFIGURED",
          provider: PROVIDER_SLUGS.SOCRATA,
          message: "Set Socrata dataset_id in API Hub.",
        },
        { status: 500 },
      );
    }

    const token = await getProviderSecret(PROVIDER_SLUGS.SOCRATA);
    const endpointKey = datasetEndpoint(endpoints, datasetId);

    const whereClause = `create_dt >= '${dateRange.startDate}' AND create_dt <= '${dateRange.endDate}'`;

    const response = await providerRequest<Record<string, unknown>[]>({
      slug: PROVIDER_SLUGS.SOCRATA,
      endpointKey,
      query: {
        $limit: fetchLimit,
        $where: whereClause,
        $order: "create_dt DESC",
      },
      headers: token
        ? {
            "X-App-Token": token,
          }
        : undefined,
    });

    const rows = response.data ?? [];
    let imported = 0;
    let skipped = 0;
    let stoppedEarly = false;
    let stopReason: string | undefined;

    const seen = new Set<string>();

    for (const row of rows) {
      if (imported >= limits.maxLeads) {
        stoppedEarly = true;
        stopReason = `maxLeads_reached_${limits.maxLeads}`;
        break;
      }

      const name = valueFromRow(row, ["name"]);
      if (!name) {
        skipped += 1;
        continue;
      }

      const mailing = parseMailingAddress(valueFromRow(row, ["mailing_address"]));
      const identityKey = [
        normalizeKeyPart(name),
        normalizeKeyPart(mailing.address1),
        normalizeKeyPart(mailing.city),
        normalizeKeyPart(mailing.zip),
      ].join("|");

      if (seen.has(identityKey)) {
        skipped += 1;
        continue;
      }
      seen.add(identityKey);

      const duplicateLead = await existsLeadByIdentity(name, mailing.address1, mailing.city, mailing.zip);
      if (duplicateLead) {
        skipped += 1;
        continue;
      }

      const duplicateMaster = await isMasterDuplicate({
        name,
        website: null,
        phone: null,
      });
      if (duplicateMaster) {
        skipped += 1;
        continue;
      }

      const record: Prisma.LeadCreateInput = {
        source: "CT_REGISTRY",
        externalId: valueFromRow(row, ["accountnumber"]),
        name,
        industryType: valueFromRow(row, ["status"]),
        address1: mailing.address1,
        city: mailing.city,
        state: mailing.state || "CT",
        zip: mailing.zip,
        notes: valueFromRow(row, ["create_dt"]),
      };

      const qualificationScore = computeQualificationScore(record);
      const qualified = isQualifiedLead(record);

      await db.lead.create({
        data: {
          ...record,
          qualificationScore,
          qualified,
        },
      });
      imported += 1;
    }

    console.info(
      `[api/leads/import-ct] fetched=${rows.length} imported=${imported} skipped=${skipped} stoppedEarly=${stoppedEarly} maxLeads=${limits.maxLeads}`,
    );

    return NextResponse.json({
      totalFetched: rows.length,
      imported,
      skipped,
      stoppedEarly,
      stopReason,
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      return NextResponse.json(
        {
          code: error.code,
          provider: error.provider ?? PROVIDER_SLUGS.SOCRATA,
          message: error.message,
        },
        { status: error.statusCode },
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "CT import failed.",
      },
      { status: 500 },
    );
  }
}
