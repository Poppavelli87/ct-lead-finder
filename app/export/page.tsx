import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildLeadWhere } from "@/lib/lead-filters";

export default async function ExportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();

  const params = await searchParams;
  const get = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : "");

  const filters = {
    name: get("name") || undefined,
    city: get("city") || undefined,
    county: get("county") || undefined,
    industryType: get("industryType") || undefined,
    qualified: (get("qualified") as "all" | "yes" | "no") || "all",
    source: get("source") || undefined,
    dateFrom: get("dateFrom") || undefined,
    dateTo: get("dateTo") || undefined,
  };

  const previewCount = await db.lead.count({ where: buildLeadWhere(filters) });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Export Leads</h1>
        <p className="mt-1 text-sm text-slate-600">
          Export filtered leads as XLSX with Street, City, State, Zip columns and formula-safe sanitization.
        </p>
      </div>

      <form className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-4">
        <input name="name" placeholder="Name" defaultValue={get("name")} className="rounded-md border border-slate-300 px-3 py-2" />
        <input name="city" placeholder="City" defaultValue={get("city")} className="rounded-md border border-slate-300 px-3 py-2" />
        <input name="county" placeholder="County" defaultValue={get("county")} className="rounded-md border border-slate-300 px-3 py-2" />
        <input name="industryType" placeholder="Industry" defaultValue={get("industryType")} className="rounded-md border border-slate-300 px-3 py-2" />

        <select name="qualified" defaultValue={get("qualified") || "all"} className="rounded-md border border-slate-300 px-3 py-2">
          <option value="all">All qualification</option>
          <option value="yes">Qualified only</option>
          <option value="no">Unqualified only</option>
        </select>

        <input name="source" placeholder="Source (optional)" defaultValue={get("source")} className="rounded-md border border-slate-300 px-3 py-2" />
        <input type="date" name="dateFrom" defaultValue={get("dateFrom")} className="rounded-md border border-slate-300 px-3 py-2" />
        <input type="date" name="dateTo" defaultValue={get("dateTo")} className="rounded-md border border-slate-300 px-3 py-2" />

        <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
          Preview
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-sm text-slate-700">Matching leads: {previewCount}</div>
        <a
          href={`/api/export/leads?${new URLSearchParams(
            Object.fromEntries(Object.entries(filters).filter(([, value]) => Boolean(value))) as Record<string, string>,
          ).toString()}`}
          className="mt-3 inline-block rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
        >
          Download XLSX Export
        </a>
      </div>
    </div>
  );
}

