import Link from "next/link";
import { GoogleSearchForm } from "@/components/google-search-form";
import { CT_COUNTIES } from "@/lib/ct-counties";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function GoogleSearchPage() {
  await requireUser();

  const recentGoogleLeads = await db.lead.findMany({
    where: { source: "GOOGLE" },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Google Places Search</h1>
        <p className="mt-1 text-sm text-slate-600">
          Text Search first, then Place Details only when PreQualScore is 65+ to minimize paid calls.
        </p>
      </div>

      <GoogleSearchForm counties={CT_COUNTIES} />

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">Latest Google Leads</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2">City</th>
                <th className="px-2 py-2">Phone</th>
                <th className="px-2 py-2">Website</th>
                <th className="px-2 py-2">PreQual</th>
                <th className="px-2 py-2">Open</th>
              </tr>
            </thead>
            <tbody>
              {recentGoogleLeads.map((lead) => (
                <tr key={lead.id} className="border-b border-slate-100 text-slate-700">
                  <td className="px-2 py-2">{lead.name}</td>
                  <td className="px-2 py-2">{lead.city || "-"}</td>
                  <td className="px-2 py-2">{lead.phone || "-"}</td>
                  <td className="px-2 py-2">{lead.website || "-"}</td>
                  <td className="px-2 py-2">{lead.preQualScore ?? "-"}</td>
                  <td className="px-2 py-2">
                    <Link href={`/leads/${lead.id}`} className="text-sky-700 hover:underline">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
              {!recentGoogleLeads.length ? (
                <tr>
                  <td colSpan={6} className="px-2 py-4 text-slate-500">
                    No Google leads yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

