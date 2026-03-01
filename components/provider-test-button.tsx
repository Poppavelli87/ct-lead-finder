"use client";

import { useState } from "react";

export function ProviderTestButton({ slug }: { slug: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");

  const runTest = async () => {
    setLoading(true);
    setResult("");

    try {
      const res = await fetch(`/api/providers/test?slug=${encodeURIComponent(slug)}`);
      const data = (await res.json()) as { message?: string; ok?: boolean };
      setResult(data.message ?? (data.ok ? "Test passed" : "Test failed"));
    } catch {
      setResult("Test request failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={runTest}
        disabled={loading}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
      >
        {loading ? "Testing..." : "Test Connectivity"}
      </button>
      {result ? <span className="text-xs text-slate-600">{result}</span> : null}
    </div>
  );
}

