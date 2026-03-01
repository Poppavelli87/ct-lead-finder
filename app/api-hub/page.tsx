import { saveProviderAction } from "@/app/actions/providers";
import { ProviderTestButton } from "@/components/provider-test-button";
import { requireUser } from "@/lib/auth";
import { ensureBootstrapData } from "@/lib/bootstrap";
import { db } from "@/lib/db";
import { encryptionWarningMessage } from "@/lib/env";
import { getMonthKey } from "@/lib/utils";

export default async function ApiHubPage() {
  await ensureBootstrapData();
  await requireUser();

  const month = getMonthKey();

  const providers = await db.provider.findMany({
    orderBy: { name: "asc" },
    include: {
      apiUsage: {
        orderBy: { timestamp: "desc" },
        take: 50,
      },
      monthlyUsage: {
        where: { month },
        take: 1,
      },
    },
  });

  const warning = encryptionWarningMessage();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">API Hub</h1>
        <p className="mt-1 text-sm text-slate-600">
          Integration & Endpoint Manager: toggle providers, edit endpoints/base URL, store encrypted keys, test connectivity,
          and monitor recent calls.
        </p>
      </div>

      {warning ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Secret storage blocked:</strong> {warning}
        </div>
      ) : null}

      <div className="space-y-4">
        {providers.map((provider) => {
          const monthUsage = provider.monthlyUsage[0];
          return (
            <section key={provider.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{provider.name}</h2>
                  <p className="text-sm text-slate-600">Slug: {provider.slug}</p>
                  <p className="mt-1 text-xs text-slate-500">Last error: {provider.lastError || "None"}</p>
                  <p className="text-xs text-slate-500">
                    Last success: {provider.lastSuccessAt ? provider.lastSuccessAt.toLocaleString() : "Never"}
                  </p>
                </div>
                <div className="text-sm text-slate-700">
                  <div>
                    Month requests: <strong>{monthUsage?.requestCount ?? 0}</strong>
                  </div>
                  <div>
                    Month cost: <strong>${Number(monthUsage?.costUsd ?? 0).toFixed(3)}</strong>
                  </div>
                </div>
              </div>

              <form action={saveProviderAction} className="grid gap-3 md:grid-cols-2">
                <input type="hidden" name="id" value={provider.id} />

                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" name="enabled" defaultChecked={provider.enabled} />
                  Enabled
                </label>

                <div />

                <label className="flex flex-col gap-1 text-sm text-slate-700 md:col-span-2">
                  Base URL
                  <input
                    name="baseUrl"
                    defaultValue={provider.baseUrl}
                    className="rounded-md border border-slate-300 px-3 py-2"
                    required
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm text-slate-700 md:col-span-2">
                  Endpoint templates (JSON)
                  <textarea
                    name="endpointsJson"
                    defaultValue={JSON.stringify(provider.endpoints, null, 2)}
                    className="min-h-32 rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
                    required
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm text-slate-700">
                  API key/token (new value)
                  <input
                    name="secret"
                    type="password"
                    placeholder={provider.secretEncrypted ? "Stored (enter to replace)" : "Enter secret"}
                    className="rounded-md border border-slate-300 px-3 py-2"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm text-slate-700">
                  Rate limit per sec
                  <input
                    name="rateLimitPerSec"
                    type="number"
                    defaultValue={provider.rateLimitPerSec}
                    min={1}
                    max={100}
                    className="rounded-md border border-slate-300 px-3 py-2"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm text-slate-700">
                  Timeout (ms)
                  <input
                    name="timeoutMs"
                    type="number"
                    defaultValue={provider.timeoutMs}
                    min={1000}
                    max={60000}
                    className="rounded-md border border-slate-300 px-3 py-2"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm text-slate-700">
                  Default cost per call (USD)
                  <input
                    name="defaultCostPerCall"
                    type="number"
                    defaultValue={Number(provider.defaultCostPerCall)}
                    min={0}
                    step={0.001}
                    className="rounded-md border border-slate-300 px-3 py-2"
                  />
                </label>

                <div className="md:col-span-2 flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
                  >
                    Save Provider
                  </button>
                  <ProviderTestButton slug={provider.slug} />
                </div>
              </form>

              <details className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
                <summary className="cursor-pointer text-sm font-medium text-slate-800">
                  Last 50 calls ({provider.apiUsage.length})
                </summary>
                <div className="mt-3 max-h-64 overflow-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="px-2 py-1">Time</th>
                        <th className="px-2 py-1">Endpoint</th>
                        <th className="px-2 py-1">Status</th>
                        <th className="px-2 py-1">Duration</th>
                        <th className="px-2 py-1">Cost</th>
                        <th className="px-2 py-1">Mock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {provider.apiUsage.map((call) => (
                        <tr key={call.id} className="border-b border-slate-100 text-slate-700">
                          <td className="px-2 py-1">{call.timestamp.toLocaleString()}</td>
                          <td className="px-2 py-1">{call.endpointKey}</td>
                          <td className="px-2 py-1">{call.statusCode ?? "-"}</td>
                          <td className="px-2 py-1">{call.durationMs ?? 0}ms</td>
                          <td className="px-2 py-1">${Number(call.costUsd).toFixed(3)}</td>
                          <td className="px-2 py-1">{call.isMock ? "Yes" : "No"}</td>
                        </tr>
                      ))}
                      {!provider.apiUsage.length ? (
                        <tr>
                          <td colSpan={6} className="px-2 py-3 text-slate-500">
                            No calls logged yet.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </details>
            </section>
          );
        })}
      </div>
    </div>
  );
}

