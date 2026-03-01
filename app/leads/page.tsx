import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ensureBootstrapData } from "@/lib/bootstrap";
import { db } from "@/lib/db";
import { buildLeadWhere } from "@/lib/lead-filters";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await ensureBootstrapData();
  await requireUser();

  const params = await searchParams;
  const get = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : "");

  const where = buildLeadWhere({
    name: get("name") || undefined,
    city: get("city") || undefined,
    county: get("county") || undefined,
    industryType: get("industryType") || undefined,
    qualified: (get("qualified") as "all" | "yes" | "no") || "all",
    source: get("source") || undefined,
    dateFrom: get("dateFrom") || undefined,
    dateTo: get("dateTo") || undefined,
  });

  const leads = await db.lead.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Lead Management</h1>
        <p className="mt-1 text-sm text-slate-600">Filter, review, and enrich stored leads.</p>
      </div>

      <form className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-4">
        <input name="name" placeholder="Name" defaultValue={get("name")} className="rounded-md border border-slate-300 px-3 py-2" />
        <input name="city" placeholder="City" defaultValue={get("city")} className="rounded-md border border-slate-300 px-3 py-2" />
        <input name="county" placeholder="County" defaultValue={get("county")} className="rounded-md border border-slate-300 px-3 py-2" />
        <input name="industryType" placeholder="Industry/Type" defaultValue={get("industryType")} className="rounded-md border border-slate-300 px-3 py-2" />

        <select name="qualified" defaultValue={get("qualified") || "all"} className="rounded-md border border-slate-300 px-3 py-2">
          <option value="all">All Qualification</option>
          <option value="yes">Qualified</option>
          <option value="no">Unqualified</option>
        </select>

        <select name="source" defaultValue={get("source") || "all"} className="rounded-md border border-slate-300 px-3 py-2">
          <option value="all">All Sources</option>
          {leadSources.map((source) => (
            <option key={source} value={source}>
              {source}
            </option>
          ))}
        </select>

        <input type="date" name="dateFrom" defaultValue={get("dateFrom")} className="rounded-md border border-slate-300 px-3 py-2" />
        <input type="date" name="dateTo" defaultValue={get("dateTo")} className="rounded-md border border-slate-300 px-3 py-2" />

        <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
          Apply Filters
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">City</th>
              <th className="px-3 py-2">County</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">Website</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Qualified</th>
              <th className="px-3 py-2">Score</th>
              <th className="px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="border-b border-slate-100 text-slate-700">
                <td className="px-3 py-2 font-medium text-slate-900">{lead.name}</td>
                <td className="px-3 py-2">{lead.city || "-"}</td>
                <td className="px-3 py-2">{lead.county || "-"}</td>
                <td className="px-3 py-2">{lead.phone || "-"}</td>
                <td className="px-3 py-2">{lead.website || "-"}</td>
                <td className="px-3 py-2">{lead.source}</td>
                <td className="px-3 py-2">{lead.qualified ? "Yes" : "No"}</td>
                <td className="px-3 py-2">{lead.qualificationScore}</td>
                <td className="px-3 py-2">
                  <Link href={`/leads/${lead.id}`} className="text-sky-700 hover:underline">
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {!leads.length ? (
              <tr>
                <td className="px-3 py-4 text-slate-500" colSpan={9}>
                  No leads match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

  const leadSources = ["GOOGLE", "CT_REGISTRY", "UPLOAD", "MANUAL", "DIRECTORY", "MOCK"];
