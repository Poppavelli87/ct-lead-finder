"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PipelineStatus } from "@/lib/pipeline-status";

export type LeadsPageFilters = {
  name?: string;
  city?: string;
  county?: string;
  industryType?: string;
  pipelineStatus?: string;
  qualified?: "all" | "yes" | "no";
  source?: string;
  dateFrom?: string;
  dateTo?: string;
};

type LeadTableRow = {
  id: string;
  name: string;
  city: string | null;
  county: string | null;
  phone: string | null;
  website: string | null;
  source: string;
  qualified: boolean;
  qualificationScore: number;
  externalId: string | null;
  matchStatus: string | null;
  phoneStatus: string | null;
  pipelineStatus: PipelineStatus;
};

type ExecutionLimitsPayload = {
  scope: "master" | "search" | "phone";
  maxLeads: number;
  maxGoogleCalls?: number;
  maxCostUsd?: number;
  rateLimitRps: number;
};

type ImportResponse = {
  totalFetched: number;
  imported: number;
  skipped: number;
  stoppedEarly: boolean;
  stopReason?: string;
  error?: string;
};

type MatchResponse = {
  attempted: number;
  matched: number;
  no_match: number;
  failed: number;
  googleCallsUsed: number;
  stoppedEarly: boolean;
  stopReason?: string;
  results: Array<{ id: string; status: "matched" | "no_match" | "failed"; confidence?: number; reason?: string }>;
  error?: string;
};

type PhoneResponse = {
  attempted: number;
  updated: number;
  no_phone: number;
  skipped: number;
  failed: number;
  googleCallsUsed: number;
  stoppedEarly: boolean;
  stopReason?: string;
  results: Array<{ id: string; status: "updated" | "skipped" | "no_phone" | "failed"; reason?: string }>;
  error?: string;
};

type EligibleEstimates = {
  match: number;
  matchWithRetry: number;
  phone: number;
  phoneWithRetry: number;
};

const PRESETS = {
  CONSERVATIVE: { maxLeads: 100, maxGoogleCalls: "100", maxCostUsd: "2" },
  NORMAL: { maxLeads: 300, maxGoogleCalls: "300", maxCostUsd: "10" },
  AGGRESSIVE: { maxLeads: 500, maxGoogleCalls: "500", maxCostUsd: "25" },
} as const;

type PresetKey = keyof typeof PRESETS | "CUSTOM";

function clampMaxLeads(value: number): number {
  if (!Number.isFinite(value)) return 500;
  return Math.max(1, Math.min(500, Math.floor(value)));
}

function parseOptionalPositiveInt(value: string): number | undefined {
  const text = value.trim();
  if (!text) return undefined;
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.floor(parsed);
}

function parseOptionalPositiveFloat(value: string): number | undefined {
  const text = value.trim();
  if (!text) return undefined;
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function statusBadge(status: PipelineStatus): { label: string; className: string } {
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

function summarizeReasons<T extends { id: string; reason?: string; status: string }>(results: T[]): string[] {
  return results
    .filter((result) => result.reason)
    .slice(0, 10)
    .map((result) => `${result.id} (${result.status}): ${result.reason}`);
}

function buildExportUrl(filters: LeadsPageFilters, qualifiedOnly = false): string {
  const params = new URLSearchParams();
  const entries = Object.entries(filters) as Array<[keyof LeadsPageFilters, string | undefined]>;
  for (const [key, value] of entries) {
    if (!value) continue;
    if (key === "qualified" && value === "all") continue;
    if (key === "source" && value === "all") continue;
    params.set(key, value);
  }
  if (qualifiedOnly) {
    params.set("qualifiedOnly", "1");
  }

  const qs = params.toString();
  return qs ? `/api/leads/export?${qs}` : "/api/leads/export";
}

async function fetchFilteredIds(filters: LeadsPageFilters, limit: number): Promise<{ ids: string[]; totalEligible: number }> {
  const ids: string[] = [];
  let cursor: string | undefined;
  let totalEligible = 0;

  while (ids.length < limit) {
    const response = await fetch("/api/leads/ids", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filters,
        limit: Math.min(500, limit - ids.length),
        cursor,
      }),
    });

    const body = (await response.json().catch(() => ({}))) as { ids?: string[]; totalEligible?: number; nextCursor?: string; error?: string };
    if (!response.ok) {
      throw new Error(body.error ?? "Failed to fetch filtered lead IDs.");
    }

    const batch = Array.isArray(body.ids) ? body.ids : [];
    totalEligible = typeof body.totalEligible === "number" ? body.totalEligible : totalEligible;
    ids.push(...batch);
    cursor = body.nextCursor;

    if (!cursor || !batch.length) break;
  }

  return {
    ids: Array.from(new Set(ids)),
    totalEligible,
  };
}

export function LeadsTable({
  leads,
  filters,
  totalFiltered,
  eligibleEstimates,
}: {
  leads: LeadTableRow[];
  filters: LeadsPageFilters;
  totalFiltered: number;
  eligibleEstimates: EligibleEstimates;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [runningStep, setRunningStep] = useState<"import" | "match" | "phone" | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [reasonLines, setReasonLines] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ processed: number; total: number }>({ processed: 0, total: 0 });

  const [preset, setPreset] = useState<PresetKey>("NORMAL");
  const [maxLeads, setMaxLeads] = useState<number>(PRESETS.NORMAL.maxLeads);
  const [maxGoogleCalls, setMaxGoogleCalls] = useState<string>(PRESETS.NORMAL.maxGoogleCalls);
  const [maxCostUsd, setMaxCostUsd] = useState<string>(PRESETS.NORMAL.maxCostUsd);
  const [rateLimitRps] = useState<number>(10);

  const [importStartDate, setImportStartDate] = useState<string>(filters.dateFrom ?? "");
  const [importEndDate, setImportEndDate] = useState<string>(filters.dateTo ?? "");
  const [importFetchLimit, setImportFetchLimit] = useState<number>(1000);
  const [retryNoMatch, setRetryNoMatch] = useState<boolean>(false);
  const [retryNoPhone, setRetryNoPhone] = useState<boolean>(false);
  const [importSummary, setImportSummary] = useState<ImportResponse | null>(null);
  const [matchSummary, setMatchSummary] = useState<MatchResponse | null>(null);
  const [phoneSummary, setPhoneSummary] = useState<PhoneResponse | null>(null);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectAllRef = useRef<HTMLInputElement | null>(null);

  const allSelected = leads.length > 0 && leads.every((lead) => selectedSet.has(lead.id));
  const someSelected = leads.some((lead) => selectedSet.has(lead.id));

  const matchEligibleEstimate = retryNoMatch ? eligibleEstimates.matchWithRetry : eligibleEstimates.match;
  const phoneEligibleEstimate = retryNoPhone ? eligibleEstimates.phoneWithRetry : eligibleEstimates.phone;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected && !allSelected;
    }
  }, [someSelected, allSelected]);

  function setPresetValues(nextPreset: PresetKey) {
    setPreset(nextPreset);
    if (nextPreset === "CUSTOM") return;
    const values = PRESETS[nextPreset];
    setMaxLeads(values.maxLeads);
    setMaxGoogleCalls(values.maxGoogleCalls);
    setMaxCostUsd(values.maxCostUsd);
  }

  function toLimits(scope: "master" | "search" | "phone"): ExecutionLimitsPayload {
    return {
      scope,
      maxLeads: clampMaxLeads(maxLeads),
      maxGoogleCalls: parseOptionalPositiveInt(maxGoogleCalls),
      maxCostUsd: parseOptionalPositiveFloat(maxCostUsd),
      rateLimitRps: Math.min(10, Math.max(1, Math.floor(rateLimitRps))),
    };
  }

  function toggleSingle(id: string, checked: boolean) {
    setSelected((current) => {
      const set = new Set(current);
      if (checked) {
        set.add(id);
      } else {
        set.delete(id);
      }
      return Array.from(set);
    });
  }

  function toggleAll(checked: boolean) {
    if (!checked) {
      setSelected([]);
      return;
    }
    setSelected(leads.map((lead) => lead.id));
  }

  async function runImportCt() {
    if (runningStep) return;

    setRunningStep("import");
    setResultMessage(null);
    setReasonLines([]);
    setProgress({ processed: 0, total: 1 });
    setImportSummary(null);

    try {
      const response = await fetch("/api/leads/import-ct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: importStartDate || undefined,
          endDate: importEndDate || undefined,
          limit: Math.min(5000, Math.max(1, Math.floor(importFetchLimit))),
          limits: toLimits("master"),
        }),
      });

      const body = (await response.json().catch(() => ({}))) as ImportResponse & { message?: string };
      if (!response.ok) {
        setResultMessage(body.message ?? body.error ?? `Import failed (${response.status}).`);
        return;
      }

      setImportSummary(body);
      setProgress({ processed: 1, total: 1 });
      setResultMessage(
        `CT import complete. Fetched ${body.totalFetched}, Imported ${body.imported}, Skipped ${body.skipped}${body.stoppedEarly ? `, stopped early: ${body.stopReason ?? "budget limit"}` : ""}.`,
      );
      router.refresh();
    } catch (error) {
      setResultMessage(error instanceof Error ? error.message : "CT import failed.");
    } finally {
      setRunningStep(null);
    }
  }

  async function runMatch(mode: "filtered" | "selected") {
    if (runningStep) return;

    setRunningStep("match");
    setResultMessage(null);
    setReasonLines([]);
    setMatchSummary(null);

    try {
      const limits = toLimits("search");
      const sourceIds = mode === "selected" ? Array.from(new Set(selected)) : (await fetchFilteredIds(filters, limits.maxLeads)).ids;

      if (!sourceIds.length) {
        setResultMessage("No leads available for Google matching.");
        return;
      }

      setProgress({ processed: 0, total: sourceIds.length });

      const response = await fetch("/api/leads/match-google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: sourceIds,
          retryNoMatch,
          limits,
        }),
      });

      const body = (await response.json().catch(() => ({}))) as MatchResponse & { message?: string; error?: string };
      if (!response.ok) {
        setResultMessage(body.message ?? body.error ?? `Match failed (${response.status}).`);
        setReasonLines(summarizeReasons(body.results ?? []));
        return;
      }

      setMatchSummary(body);
      setProgress({ processed: body.attempted, total: sourceIds.length });
      setReasonLines(summarizeReasons(body.results ?? []));
      setResultMessage(
        `Google match complete (${mode}). Attempted ${body.attempted}, Matched ${body.matched}, No match ${body.no_match}, Failed ${body.failed}, Google calls ${body.googleCallsUsed}${body.stoppedEarly ? `, stopped early: ${body.stopReason ?? "budget limit"}` : ""}.`,
      );

      if (mode === "selected") {
        setSelected([]);
      }
      router.refresh();
    } catch (error) {
      setResultMessage(error instanceof Error ? error.message : "Google match failed.");
    } finally {
      setRunningStep(null);
    }
  }

  async function runPhone(mode: "filtered" | "selected") {
    if (runningStep) return;

    setRunningStep("phone");
    setResultMessage(null);
    setReasonLines([]);
    setPhoneSummary(null);

    try {
      const limits = toLimits("phone");
      const sourceIds = mode === "selected" ? Array.from(new Set(selected)) : (await fetchFilteredIds(filters, limits.maxLeads)).ids;

      if (!sourceIds.length) {
        setResultMessage("No leads available for phone enrichment.");
        return;
      }

      setProgress({ processed: 0, total: sourceIds.length });

      const response = await fetch("/api/leads/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: sourceIds,
          mode: "PHONE_ONLY",
          retryNoPhone,
          limits,
        }),
      });

      const body = (await response.json().catch(() => ({}))) as PhoneResponse & { message?: string; error?: string };
      if (!response.ok) {
        setResultMessage(body.message ?? body.error ?? `Phone enrichment failed (${response.status}).`);
        setReasonLines(summarizeReasons(body.results ?? []));
        return;
      }

      setPhoneSummary(body);
      setProgress({ processed: body.attempted + body.skipped, total: sourceIds.length });
      setReasonLines(summarizeReasons(body.results ?? []));
      setResultMessage(
        `Phone fetch complete (${mode}). Attempted ${body.attempted}, Updated ${body.updated}, No phone ${body.no_phone}, Skipped ${body.skipped}, Failed ${body.failed}, Google calls ${body.googleCallsUsed}${body.stoppedEarly ? `, stopped early: ${body.stopReason ?? "budget limit"}` : ""}.`,
      );

      if (mode === "selected") {
        setSelected([]);
      }
      router.refresh();
    } catch (error) {
      setResultMessage(error instanceof Error ? error.message : "Phone enrichment failed.");
    } finally {
      setRunningStep(null);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">Pipeline</h2>
          <div className="text-sm text-slate-600">
            Filtered leads: <span className="font-semibold text-slate-900">{totalFiltered}</span>
          </div>
        </div>
        <Link
          href="/master-upload"
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Import Master File (CSV)
        </Link>
      </div>

      <section className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-5">
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium uppercase text-slate-600">Preset</label>
          <select
            value={preset}
            onChange={(event) => setPresetValues(event.target.value as PresetKey)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="CONSERVATIVE">Conservative</option>
            <option value="NORMAL">Normal</option>
            <option value="AGGRESSIVE">Aggressive</option>
            <option value="CUSTOM">Custom</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-slate-600">Max Leads (1-500)</label>
          <input
            type="number"
            min={1}
            max={500}
            value={maxLeads}
            onChange={(event) => {
              setPreset("CUSTOM");
              setMaxLeads(clampMaxLeads(Number(event.target.value)));
            }}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-slate-600">Max Google Calls</label>
          <input
            value={maxGoogleCalls}
            onChange={(event) => {
              setPreset("CUSTOM");
              setMaxGoogleCalls(event.target.value);
            }}
            placeholder="optional"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-slate-600">Max Budget USD</label>
          <input
            value={maxCostUsd}
            onChange={(event) => {
              setPreset("CUSTOM");
              setMaxCostUsd(event.target.value);
            }}
            placeholder="optional"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-slate-600">Rate Limit</label>
          <input
            value={`${rateLimitRps} req/sec`}
            readOnly
            className="w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-600"
          />
        </div>

        <div className="text-xs text-slate-600">
          Match eligible estimate: <span className="font-semibold text-slate-900">{matchEligibleEstimate}</span>
        </div>
        <div className="text-xs text-slate-600">
          Phone eligible estimate: <span className="font-semibold text-slate-900">{phoneEligibleEstimate}</span>
        </div>
      </section>

      <section className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-2">
        <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="text-sm font-semibold text-slate-900">Step 1: Import CT Filings</div>
          <div className="grid grid-cols-3 gap-2">
            <input
              type="date"
              value={importStartDate}
              onChange={(event) => setImportStartDate(event.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
            <input
              type="date"
              value={importEndDate}
              onChange={(event) => setImportEndDate(event.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
            <input
              type="number"
              min={1}
              max={5000}
              value={importFetchLimit}
              onChange={(event) => setImportFetchLimit(Math.max(1, Math.min(5000, Number(event.target.value) || 1000)))}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              title="Socrata fetch size"
            />
          </div>
          <button
            type="button"
            onClick={() => void runImportCt()}
            disabled={runningStep !== null}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {runningStep === "import" ? "Importing..." : "Import CT Filings"}
          </button>
          {importSummary ? (
            <div className="text-xs text-slate-700">
              fetched {importSummary.totalFetched}, imported {importSummary.imported}, skipped {importSummary.skipped}
              {importSummary.stoppedEarly ? `, stopped: ${importSummary.stopReason ?? "limit"}` : ""}
            </div>
          ) : null}
        </div>

        <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="text-sm font-semibold text-slate-900">Step 2: Match Google (resolve place_id)</div>
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={retryNoMatch} onChange={(event) => setRetryNoMatch(event.target.checked)} />
            Retry NO_MATCH
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void runMatch("filtered")}
              disabled={runningStep !== null || matchEligibleEstimate === 0}
              className="rounded-md bg-sky-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-60"
            >
              Match Google for Filtered
            </button>
            <button
              type="button"
              onClick={() => void runMatch("selected")}
              disabled={runningStep !== null || selected.length === 0}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Match Google for Selected ({selected.length})
            </button>
          </div>
          {matchSummary ? (
            <div className="text-xs text-slate-700">
              matched {matchSummary.matched}, no_match {matchSummary.no_match}, failed {matchSummary.failed}, google calls{" "}
              {matchSummary.googleCallsUsed}
              {matchSummary.stoppedEarly ? `, stopped: ${matchSummary.stopReason ?? "limit"}` : ""}
            </div>
          ) : null}
        </div>

        <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="text-sm font-semibold text-slate-900">Step 3: Fetch Phones (Place Details phone-only)</div>
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={retryNoPhone} onChange={(event) => setRetryNoPhone(event.target.checked)} />
            Retry NO_PHONE
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void runPhone("filtered")}
              disabled={runningStep !== null || phoneEligibleEstimate === 0}
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-60"
            >
              Fetch Phones for Filtered
            </button>
            <button
              type="button"
              onClick={() => void runPhone("selected")}
              disabled={runningStep !== null || selected.length === 0}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Fetch Phones for Selected ({selected.length})
            </button>
          </div>
          {phoneSummary ? (
            <div className="text-xs text-slate-700">
              updated {phoneSummary.updated}, no_phone {phoneSummary.no_phone}, skipped {phoneSummary.skipped}, failed{" "}
              {phoneSummary.failed}, google calls {phoneSummary.googleCallsUsed}
              {phoneSummary.stoppedEarly ? `, stopped: ${phoneSummary.stopReason ?? "limit"}` : ""}
            </div>
          ) : null}
        </div>

        <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="text-sm font-semibold text-slate-900">Step 4: Export</div>
          <div className="flex flex-wrap gap-2">
            <a
              href={buildExportUrl(filters, false)}
              className="rounded-md bg-indigo-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-600"
            >
              Export With Phones
            </a>
            <a
              href={buildExportUrl(filters, true)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Export Qualified
            </a>
          </div>
        </div>
      </section>

      {resultMessage ? <div className="text-sm text-slate-700">{resultMessage}</div> : null}
      {runningStep ? (
        <div className="text-xs text-slate-600">
          Progress: {progress.processed}/{progress.total}
        </div>
      ) : null}
      {reasonLines.length ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          <div className="mb-1 font-medium text-slate-900">First 10 reasons</div>
          {reasonLines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-2 py-2">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={(event) => toggleAll(event.target.checked)}
                  aria-label="Select all rows"
                />
              </th>
              <th className="px-2 py-2">Name</th>
              <th className="px-2 py-2">Pipeline Status</th>
              <th className="px-2 py-2">City</th>
              <th className="px-2 py-2">County</th>
              <th className="px-2 py-2">Phone</th>
              <th className="px-2 py-2">Place ID</th>
              <th className="px-2 py-2">Source</th>
              <th className="px-2 py-2">Qualified</th>
              <th className="px-2 py-2">Score</th>
              <th className="px-2 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => {
              const badge = statusBadge(lead.pipelineStatus);
              return (
                <tr key={lead.id} className="border-b border-slate-100 text-slate-700">
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={selectedSet.has(lead.id)}
                      onChange={(event) => toggleSingle(lead.id, event.target.checked)}
                      aria-label={`Select ${lead.name}`}
                    />
                  </td>
                  <td className="px-2 py-2 font-medium text-slate-900">{lead.name}</td>
                  <td className="px-2 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-2 py-2">{lead.city || "-"}</td>
                  <td className="px-2 py-2">{lead.county || "-"}</td>
                  <td className="px-2 py-2">{lead.phone || "-"}</td>
                  <td className="px-2 py-2">{lead.externalId || "-"}</td>
                  <td className="px-2 py-2">{lead.source}</td>
                  <td className="px-2 py-2">{lead.qualified ? "Yes" : "No"}</td>
                  <td className="px-2 py-2">{lead.qualificationScore}</td>
                  <td className="px-2 py-2">
                    <Link href={`/leads/${lead.id}`} className="text-sky-700 hover:underline">
                      Open
                    </Link>
                  </td>
                </tr>
              );
            })}
            {!leads.length ? (
              <tr>
                <td className="px-2 py-4 text-slate-500" colSpan={11}>
                  <div className="space-y-2">
                    <div>No leads yet.</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void runImportCt()}
                        disabled={runningStep !== null}
                        className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-60"
                      >
                        Import CT Filings
                      </button>
                      <Link
                        href="/master-upload"
                        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Upload Master File
                      </Link>
                    </div>
                  </div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
