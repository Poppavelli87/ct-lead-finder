import { notFound } from "next/navigation";
import { LeadNextAction } from "@/components/lead-next-action";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { derivePipelineStatus } from "@/lib/pipeline-status";

function statusBadge(status: string): { label: string; className: string } {
  if (status === "PHONE_FOUND") {
    return { label: "Phone Found", className: "bg-emerald-100 text-emerald-800" };
  }
  if (status === "MATCHED") {
    return { label: "Matched", className: "bg-sky-100 text-sky-800" };
  }
  if (status === "NO_MATCH") {
    return { label: "No Match", className: "bg-amber-100 text-amber-800" };
  }
  if (status === "NO_PHONE") {
    return { label: "No Phone", className: "bg-amber-100 text-amber-800" };
  }
  if (status === "FAILED") {
    return { label: "Failed", className: "bg-rose-100 text-rose-800" };
  }
  return { label: "Needs Match", className: "bg-slate-100 text-slate-700" };
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();

  const { id } = await params;
  const lead = await db.lead.findUnique({
    where: { id },
    include: {
      apiUsage: {
        include: { provider: true },
        orderBy: { timestamp: "desc" },
        take: 15,
      },
    },
  });

  if (!lead) notFound();
  const pipelineStatus = derivePipelineStatus({
    source: lead.source,
    externalId: lead.externalId,
    phone: lead.phone,
    matchStatus: lead.matchStatus,
    phoneStatus: lead.phoneStatus,
  });

  const badge = statusBadge(pipelineStatus);
  const nextAction = lead.phone ? "EXPORT" : lead.externalId ? "PHONE" : "MATCH";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{lead.name}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {lead.city || "Unknown city"}, {lead.county || "Unknown county"} - {lead.source}
          </p>
          <div className="mt-2">
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
              {badge.label}
            </span>
          </div>
        </div>

        <LeadNextAction leadId={lead.id} actionState={nextAction} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-slate-900">Lead Data</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Phone</dt>
              <dd>{lead.phone || "-"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Email</dt>
              <dd>{lead.email || "-"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Website</dt>
              <dd>{lead.website || "-"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Address</dt>
              <dd className="text-right">{lead.address1 || "-"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Qualified</dt>
              <dd>{lead.qualified ? "Yes" : "No"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Score</dt>
              <dd>{lead.qualificationScore}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Last Match Attempt</dt>
              <dd>{lead.matchAttemptedAt ? lead.matchAttemptedAt.toLocaleString() : "Never"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Last Phone Attempt</dt>
              <dd>{lead.phoneAttemptedAt ? lead.phoneAttemptedAt.toLocaleString() : "Never"}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-slate-900">Enrichment / Ownership</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Owner</dt>
              <dd>{lead.ownerName || "-"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Domain</dt>
              <dd>{lead.domain || "-"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Last Enriched</dt>
              <dd>{lead.lastEnrichedAt ? lead.lastEnrichedAt.toLocaleString() : "Never"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Social Links</dt>
              <dd className="mt-1 rounded bg-slate-50 p-2 text-xs text-slate-700">
                {lead.socialLinks ? JSON.stringify(lead.socialLinks, null, 2) : "-"}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">Recent API Activity for This Lead</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="px-2 py-2">Time</th>
                <th className="px-2 py-2">Provider</th>
                <th className="px-2 py-2">Endpoint</th>
                <th className="px-2 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {lead.apiUsage.map((item) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="px-2 py-2">{item.timestamp.toLocaleString()}</td>
                  <td className="px-2 py-2">{item.provider.name}</td>
                  <td className="px-2 py-2">{item.endpointKey}</td>
                  <td className="px-2 py-2">{item.statusCode ?? "-"}</td>
                </tr>
              ))}
              {!lead.apiUsage.length ? (
                <tr>
                  <td colSpan={4} className="px-2 py-4 text-slate-500">
                    No API calls linked to this lead yet.
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
