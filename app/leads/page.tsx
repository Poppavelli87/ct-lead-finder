import { Prisma } from "@prisma/client";
import { LeadsTable, type LeadsPageFilters } from "@/components/leads-table";
import { requireUser } from "@/lib/auth";
import { ensureBootstrapData } from "@/lib/bootstrap";
import { db } from "@/lib/db";
import { buildLeadWhere } from "@/lib/lead-filters";
import { derivePipelineStatus } from "@/lib/pipeline-status";

const leadSources = ["GOOGLE", "CT_REGISTRY", "UPLOAD", "MANUAL", "DIRECTORY"];

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function getDefaultDateRange(): { dateFrom: string; dateTo: string } {
  const today = new Date();
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - 7);
  return {
    dateFrom: toIsoDate(from),
    dateTo: toIsoDate(today),
  };
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await ensureBootstrapData();
  await requireUser();

  const params = await searchParams;
  const get = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : "");
  const defaults = getDefaultDateRange();

  const filters: LeadsPageFilters = {
    name: get("name") || undefined,
    city: get("city") || undefined,
    county: get("county") || undefined,
    industryType: get("industryType") || undefined,
    pipelineStatus: get("pipelineStatus") || "NEEDS_MATCH",
    qualified: (get("qualified") as "all" | "yes" | "no") || "all",
    source: get("source") || "CT_REGISTRY",
    dateFrom: get("dateFrom") || defaults.dateFrom,
    dateTo: get("dateTo") || defaults.dateTo,
  };

  const where = buildLeadWhere(filters);

  const matchEligibleWhere: Prisma.LeadWhereInput = {
    AND: [
      where,
      { externalId: null },
      { phone: null },
      { OR: [{ matchStatus: null }, { matchStatus: "FAILED" }] },
    ],
  };

  const matchEligibleRetryWhere: Prisma.LeadWhereInput = {
    AND: [
      where,
      { externalId: null },
      { phone: null },
      { OR: [{ matchStatus: null }, { matchStatus: "FAILED" }, { matchStatus: "NO_MATCH" }] },
    ],
  };

  const phoneEligibleWhere: Prisma.LeadWhereInput = {
    AND: [
      where,
      { externalId: { not: null } },
      { phone: null },
      { OR: [{ phoneStatus: null }, { phoneStatus: "FAILED" }] },
    ],
  };

  const phoneEligibleRetryWhere: Prisma.LeadWhereInput = {
    AND: [
      where,
      { externalId: { not: null } },
      { phone: null },
      { OR: [{ phoneStatus: null }, { phoneStatus: "FAILED" }, { phoneStatus: "NO_PHONE" }] },
    ],
  };

  const [leads, totalFiltered, matchEligible, matchEligibleWithRetry, phoneEligible, phoneEligibleWithRetry] =
    await Promise.all([
      db.lead.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      db.lead.count({ where }),
      db.lead.count({ where: matchEligibleWhere }),
      db.lead.count({ where: matchEligibleRetryWhere }),
      db.lead.count({ where: phoneEligibleWhere }),
      db.lead.count({ where: phoneEligibleRetryWhere }),
    ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Lead Pipeline</h1>
        <p className="mt-1 text-sm text-slate-600">
          CT Registry import to Google match to phone enrichment to export.
        </p>
      </div>

      <form className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-4">
        <input name="name" placeholder="Name" defaultValue={filters.name} className="rounded-md border border-slate-300 px-3 py-2" />
        <input name="city" placeholder="City" defaultValue={filters.city} className="rounded-md border border-slate-300 px-3 py-2" />
        <input name="county" placeholder="County" defaultValue={filters.county} className="rounded-md border border-slate-300 px-3 py-2" />
        <input
          name="industryType"
          placeholder="Industry/Type"
          defaultValue={filters.industryType}
          className="rounded-md border border-slate-300 px-3 py-2"
        />

        <select name="pipelineStatus" defaultValue={filters.pipelineStatus} className="rounded-md border border-slate-300 px-3 py-2">
          <option value="NEEDS_MATCH">Needs Match</option>
          <option value="MATCHED">Matched (No Phone)</option>
          <option value="PHONE_FOUND">Phone Found</option>
          <option value="NO_MATCH">No Match</option>
          <option value="NO_PHONE">No Phone</option>
          <option value="FAILED">Failed</option>
        </select>

        <select name="qualified" defaultValue={filters.qualified} className="rounded-md border border-slate-300 px-3 py-2">
          <option value="all">All Qualification</option>
          <option value="yes">Qualified</option>
          <option value="no">Unqualified</option>
        </select>

        <select name="source" defaultValue={filters.source} className="rounded-md border border-slate-300 px-3 py-2">
          <option value="all">All Sources</option>
          {leadSources.map((source) => (
            <option key={source} value={source}>
              {source}
            </option>
          ))}
        </select>

        <input type="date" name="dateFrom" defaultValue={filters.dateFrom} className="rounded-md border border-slate-300 px-3 py-2" />
        <input type="date" name="dateTo" defaultValue={filters.dateTo} className="rounded-md border border-slate-300 px-3 py-2" />

        <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
          Apply Filters
        </button>
      </form>

      <LeadsTable
        totalFiltered={totalFiltered}
        filters={filters}
        eligibleEstimates={{
          match: matchEligible,
          matchWithRetry: matchEligibleWithRetry,
          phone: phoneEligible,
          phoneWithRetry: phoneEligibleWithRetry,
        }}
        leads={leads.map((lead) => ({
          id: lead.id,
          name: lead.name,
          city: lead.city,
          county: lead.county,
          phone: lead.phone,
          website: lead.website,
          source: lead.source,
          qualified: lead.qualified,
          qualificationScore: lead.qualificationScore,
          externalId: lead.externalId,
          matchStatus: lead.matchStatus,
          phoneStatus: lead.phoneStatus,
          pipelineStatus: derivePipelineStatus({
            source: lead.source,
            externalId: lead.externalId,
            phone: lead.phone,
            matchStatus: lead.matchStatus,
            phoneStatus: lead.phoneStatus,
          }),
        }))}
      />
    </div>
  );
}
