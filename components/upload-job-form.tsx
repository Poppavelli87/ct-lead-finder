"use client";

import Link from "next/link";
import { useActionState } from "react";
import { uploadEnrichmentFileAction } from "@/app/actions/jobs";

const initialState: { message: string; jobId?: string } = { message: "" };

export function UploadJobForm() {
  const [state, formAction, pending] = useActionState(uploadEnrichmentFileAction, initialState);

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="font-semibold text-slate-900">Upload CSV/XLSX</h2>
      <form action={formAction} className="flex flex-col gap-3 md:flex-row md:items-center">
        <input
          type="file"
          name="file"
          accept=".csv,.xlsx,.xls"
          required
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-70"
        >
          {pending ? "Uploading..." : "Create Enrichment Job"}
        </button>
      </form>

      {state.message ? <div className="text-sm text-slate-700">{state.message}</div> : null}
      {state.jobId ? (
        <Link href={`/enrich/bulk?jobId=${state.jobId}`} className="text-sm text-sky-700 hover:underline">
          Open job {state.jobId}
        </Link>
      ) : null}
    </div>
  );
}

