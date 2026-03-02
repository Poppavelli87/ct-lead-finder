"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

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
};

export function LeadsTable({ leads }: { leads: LeadTableRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [enriching, setEnriching] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectAllRef = useRef<HTMLInputElement | null>(null);

  const allSelected = leads.length > 0 && leads.every((lead) => selectedSet.has(lead.id));
  const someSelected = leads.some((lead) => selectedSet.has(lead.id));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected && !allSelected;
    }
  }, [someSelected, allSelected]);

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

  async function runEnrich(ids: string[], mode: "selected" | "all") {
    if (!ids.length || enriching) return;

    setEnriching(true);
    setResultMessage(null);

    try {
      const response = await fetch("/api/leads/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });

      const body = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        updated?: number;
        failed?: number;
      };

      if (!response.ok || !body.ok) {
        setResultMessage(`Enrich failed: ${body.error ?? response.statusText}`);
        return;
      }

      setResultMessage(`Enrich complete (${mode}). Updated: ${body.updated ?? 0}, Failed: ${body.failed ?? 0}.`);
      if (mode === "selected") {
        setSelected([]);
      }
      router.refresh();
    } catch {
      setResultMessage("Enrich failed due to a network error.");
    } finally {
      setEnriching(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-slate-900">Lead Results</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void runEnrich(selected, "selected")}
            disabled={enriching || !selected.length}
            className="rounded-md bg-sky-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {enriching ? "Enriching..." : `Enrich Selected (${selected.length})`}
          </button>

          <button
            type="button"
            onClick={() => void runEnrich(leads.map((lead) => lead.id), "all")}
            disabled={enriching || !leads.length}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {enriching ? "Enriching..." : `Enrich All Filtered (${leads.length})`}
          </button>
        </div>
      </div>

      {resultMessage ? <div className="text-sm text-slate-700">{resultMessage}</div> : null}

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
              <th className="px-2 py-2">City</th>
              <th className="px-2 py-2">County</th>
              <th className="px-2 py-2">Phone</th>
              <th className="px-2 py-2">Website</th>
              <th className="px-2 py-2">Source</th>
              <th className="px-2 py-2">Qualified</th>
              <th className="px-2 py-2">Score</th>
              <th className="px-2 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
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
                <td className="px-2 py-2">{lead.city || "-"}</td>
                <td className="px-2 py-2">{lead.county || "-"}</td>
                <td className="px-2 py-2">{lead.phone || "-"}</td>
                <td className="px-2 py-2">{lead.website || "-"}</td>
                <td className="px-2 py-2">{lead.source}</td>
                <td className="px-2 py-2">{lead.qualified ? "Yes" : "No"}</td>
                <td className="px-2 py-2">{lead.qualificationScore}</td>
                <td className="px-2 py-2">
                  <Link href={`/leads/${lead.id}`} className="text-sky-700 hover:underline">
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {!leads.length ? (
              <tr>
                <td className="px-2 py-4 text-slate-500" colSpan={10}>
                  No leads match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
