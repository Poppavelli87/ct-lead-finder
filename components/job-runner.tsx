"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type JobStatusResponse = {
  id: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  totalRows: number;
  processedRows: number;
  successRows: number;
  failedRows: number;
  rows: Array<{ id: string; rowIndex: number; status: string; error: string | null }>;
};

export function JobRunner({ jobId }: { jobId: string }) {
  const [status, setStatus] = useState<JobStatusResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");

  const progress = useMemo(() => {
    if (!status || !status.totalRows) return 0;
    return Math.round((status.processedRows / status.totalRows) * 100);
  }, [status]);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/jobs/status?jobId=${encodeURIComponent(jobId)}`);
    if (!res.ok) return;
    const data = (await res.json()) as JobStatusResponse;
    setStatus(data);
  }, [jobId]);

  const runLoop = async () => {
    setRunning(true);
    setMessage("");

    try {
      while (true) {
        const res = await fetch(`/api/jobs/run?jobId=${encodeURIComponent(jobId)}`);
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          setMessage(data.error ?? "Job runner failed.");
          break;
        }

        await refresh();
        const latest = await fetch(`/api/jobs/status?jobId=${encodeURIComponent(jobId)}`).then((r) =>
          r.json() as Promise<JobStatusResponse>,
        );

        setStatus(latest);
        if (latest.status === "COMPLETED" || latest.status === "FAILED") {
          break;
        }
      }
    } catch {
      setMessage("Job loop interrupted.");
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 2500);
    return () => clearInterval(timer);
  }, [jobId, refresh]);

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={runLoop}
          disabled={running}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-70"
        >
          {running ? "Running..." : "Start / Resume Job"}
        </button>
        <a
          href={`/api/jobs/export?jobId=${encodeURIComponent(jobId)}`}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-white"
        >
          Export Job XLSX
        </a>
        <span className="text-sm text-slate-600">Status: {status?.status ?? "loading"}</span>
      </div>

      <div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div className="h-full bg-slate-700" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-1 text-xs text-slate-600">
          {status?.processedRows ?? 0} / {status?.totalRows ?? 0} processed ({progress}%)
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs text-slate-600">
        <div>Success: {status?.successRows ?? 0}</div>
        <div>Failed: {status?.failedRows ?? 0}</div>
        <div>Rows shown: {status?.rows?.length ?? 0}</div>
      </div>

      {message ? <div className="text-xs text-rose-600">{message}</div> : null}
      {status?.rows?.length ? (
        <div className="max-h-48 overflow-auto rounded border border-slate-200 bg-white p-2 text-xs">
          {status.rows.map((row) => (
            <div key={row.id} className="flex justify-between border-b border-slate-100 py-1 last:border-none">
              <span>Row {row.rowIndex + 1}</span>
              <span>{row.status}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

