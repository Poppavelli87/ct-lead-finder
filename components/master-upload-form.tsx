"use client";

import { useState } from "react";

type UploadResult = {
  ok: boolean;
  processedRows: number;
  acceptedRows: number;
  skippedRows: number;
  uniqueKeysPrepared: number;
  insertedKeys: number;
  duplicateKeys: number;
  totalRecords: number;
};

export function MasterUploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>("");
  const [result, setResult] = useState<UploadResult | null>(null);

  async function submitUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Select a CSV or XLSX file.");
      return;
    }

    setPending(true);
    setError("");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/master-upload", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json()) as UploadResult & { error?: string };
      if (!response.ok || !data.ok) {
        setError(data.error ?? "Master upload failed.");
        return;
      }

      setResult(data);
      setFile(null);
      const input = document.getElementById("master-file-input") as HTMLInputElement | null;
      if (input) input.value = "";
    } catch {
      setError("Upload failed due to a network or parsing error.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="font-semibold text-slate-900">Upload Master List</h2>
      <p className="mt-1 text-sm text-slate-600">
        Upload CSV/XLSX to pre-load dedupe keys and reduce paid Google enrichment calls.
      </p>

      <form onSubmit={submitUpload} className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
        <input
          id="master-file-input"
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          required
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-70"
        >
          {pending ? "Processing..." : "Process Master List"}
        </button>
      </form>

      {error ? <div className="mt-3 text-sm text-rose-600">{error}</div> : null}

      {result ? (
        <div className="mt-3 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 md:grid-cols-2">
          <div>Processed rows: {result.processedRows}</div>
          <div>Accepted rows: {result.acceptedRows}</div>
          <div>Skipped rows: {result.skippedRows}</div>
          <div>Prepared keys: {result.uniqueKeysPrepared}</div>
          <div>Inserted keys: {result.insertedKeys}</div>
          <div>Duplicate keys: {result.duplicateKeys}</div>
          <div>Total master records: {result.totalRecords}</div>
        </div>
      ) : null}
    </section>
  );
}
