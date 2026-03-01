import Link from "next/link";
import { enrichSelectedWithGoogleAction } from "@/app/actions/leads";
import { CtRegistryForm } from "@/components/ct-registry-form";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function CtRegistrySearchPage() {
  await requireUser();

  const registryLeads = await db.lead.findMany({
    where: { source: "CT_REGISTRY" },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">CT Business Registry Search</h1>
        <p className="mt-1 text-sm text-slate-600">
          Powered by data.ct.gov Socrata dataset via configured dataset ID in API Hub.
        </p>
      </div>

      <CtRegistryForm />

      <form action={enrichSelectedWithGoogleAction} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Imported Registry Leads</h2>
          <button
            type="submit"
            className="rounded-md bg-sky-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-600"
          >
            Enrich Selected with Google
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="px-2 py-2">Select</th>
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2">City</th>
                <th className="px-2 py-2">Entity Type</th>
                <th className="px-2 py-2">Address</th>
                <th className="px-2 py-2">Open</th>
              </tr>
            </thead>
            <tbody>
              {registryLeads.map((lead) => (
                <tr key={lead.id} className="border-b border-slate-100 text-slate-700">
                  <td className="px-2 py-2">
                    <input type="checkbox" name="leadId" value={lead.id} />
                  </td>
                  <td className="px-2 py-2">{lead.name}</td>
                  <td className="px-2 py-2">{lead.city || "-"}</td>
                  <td className="px-2 py-2">{lead.industryType || "-"}</td>
                  <td className="px-2 py-2">{lead.address1 || "-"}</td>
                  <td className="px-2 py-2">
                    <Link href={`/leads/${lead.id}`} className="text-sky-700 hover:underline">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
              {!registryLeads.length ? (
                <tr>
                  <td colSpan={6} className="px-2 py-4 text-slate-500">
                    No registry leads yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </form>
    </div>
  );
}

