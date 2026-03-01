import { Card, Section } from "@/components/card";
import { requireUser } from "@/lib/auth";
import { ensureBootstrapData } from "@/lib/bootstrap";
import { db } from "@/lib/db";
import { PROVIDER_SLUGS } from "@/lib/providers/constants";

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

export default async function DashboardPage() {
  await ensureBootstrapData();
  await requireUser();

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [
    totalLeads,
    qualifiedLeads,
    latestJob,
    totalMonthlyCost,
    latestApiCalls,
    googleProvider,
  ] = await Promise.all([
    db.lead.count(),
    db.lead.count({ where: { qualified: true } }),
    db.enrichmentJob.findFirst({ orderBy: { updatedAt: "desc" } }),
    db.apiUsage.aggregate({
      _sum: { costUsd: true },
      where: { timestamp: { gte: monthStart } },
    }),
    db.apiUsage.findMany({
      orderBy: { timestamp: "desc" },
      take: 10,
      include: { provider: true },
    }),
    db.provider.findUnique({ where: { slug: PROVIDER_SLUGS.GOOGLE } }),
  ]);

  const monthlyGoogle = googleProvider
    ? await db.apiUsage.aggregate({
        _sum: { costUsd: true },
        where: {
          providerId: googleProvider.id,
          timestamp: { gte: monthStart },
        },
      })
    : { _sum: { costUsd: null } };

  const totalMonthly = Number(totalMonthlyCost._sum.costUsd ?? 0);
  const googleMonthly = Number(monthlyGoogle._sum.costUsd ?? 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">Operational snapshot for lead generation and enrichment.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card title="Total Leads" value={String(totalLeads)} />
        <Card title="Qualified Leads" value={String(qualifiedLeads)} />
        <Card title="Monthly Google Cost" value={money(googleMonthly)} />
        <Card title="Total Monthly Cost" value={money(totalMonthly)} />
        <Card
          title="Last Job Status"
          value={latestJob?.status ?? "NONE"}
          subtitle={latestJob ? `${latestJob.processedRows}/${latestJob.totalRows} rows` : "No jobs yet"}
        />
      </div>

      <Section title="Recent API Calls" description="Last 10 outbound provider requests with cost and status.">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="px-2 py-2">Time</th>
                <th className="px-2 py-2">Provider</th>
                <th className="px-2 py-2">Endpoint</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Mock</th>
                <th className="px-2 py-2">Cost</th>
              </tr>
            </thead>
            <tbody>
              {latestApiCalls.map((call) => (
                <tr key={call.id} className="border-b border-slate-100 text-slate-700">
                  <td className="px-2 py-2">{call.timestamp.toLocaleString()}</td>
                  <td className="px-2 py-2">{call.provider.name}</td>
                  <td className="px-2 py-2">{call.endpointKey}</td>
                  <td className="px-2 py-2">{call.statusCode ?? "-"}</td>
                  <td className="px-2 py-2">{call.isMock ? "Yes" : "No"}</td>
                  <td className="px-2 py-2">${Number(call.costUsd).toFixed(3)}</td>
                </tr>
              ))}
              {!latestApiCalls.length ? (
                <tr>
                  <td className="px-2 py-4 text-slate-500" colSpan={6}>
                    No API usage recorded yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Job Queue" description="Latest enrichment jobs.">
        <div className="grid gap-3 md:grid-cols-2">
          {(
            await db.enrichmentJob.findMany({
              orderBy: { createdAt: "desc" },
              take: 6,
            })
          ).map((job) => (
            <div key={job.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <div className="font-medium text-slate-900">{job.id}</div>
              <div>Status: {job.status}</div>
              <div>
                Progress: {job.processedRows}/{job.totalRows} ({job.successRows} success / {job.failedRows} failed)
              </div>
            </div>
          ))}
          {latestJob?.status === "FAILED" ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              Latest job failed. Check `/enrich/bulk` for details.
            </div>
          ) : null}
        </div>
      </Section>
    </div>
  );
}

