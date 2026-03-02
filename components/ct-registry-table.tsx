"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { enrichSelectedWithGoogleAction } from "@/app/actions/leads";

type RegistryLead = {
  id: string;
  name: string;
  city: string | null;
  industryType: string | null;
  address1: string | null;
};

function isActiveType(value: string | null): boolean {
  return (value ?? "").trim().toUpperCase() === "ACTIVE";
}

export function CtRegistryTable({ leads }: { leads: RegistryLead[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const selectAllRef = useRef<HTMLInputElement | null>(null);

  const filteredRows = useMemo(
    () => (showActiveOnly ? leads.filter((lead) => isActiveType(lead.industryType)) : leads),
    [leads, showActiveOnly],
  );

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const allVisibleSelected = filteredRows.length > 0 && filteredRows.every((row) => selectedSet.has(row.id));
  const someVisibleSelected = filteredRows.some((row) => selectedSet.has(row.id));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected && !allVisibleSelected;
    }
  }, [someVisibleSelected, allVisibleSelected]);

  function toggleSingle(id: string, checked: boolean) {
    setSelected((current) => {
      const set = new Set(current);
      if (checked) set.add(id);
      else set.delete(id);
      return Array.from(set);
    });
  }

  function toggleAll(checked: boolean) {
    if (!checked) {
      setSelected((current) => current.filter((id) => !filteredRows.some((row) => row.id === id)));
      return;
    }

    setSelected((current) => {
      const set = new Set(current);
      for (const row of filteredRows) {
        set.add(row.id);
      }
      return Array.from(set);
    });
  }

  return (
    <form action={enrichSelectedWithGoogleAction} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-slate-900">Imported Registry Leads</h2>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={showActiveOnly}
              onChange={(e) => setShowActiveOnly(e.target.checked)}
            />
            Show Active Only
          </label>
          <button
            type="submit"
            disabled={!selected.length}
            className="rounded-md bg-sky-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Enrich Selected with Google
          </button>
        </div>
      </div>

      {selected.map((id) => (
        <input key={id} type="hidden" name="leadId" value={id} />
      ))}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-2 py-2">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(e) => toggleAll(e.target.checked)}
                  aria-label="Select all visible rows"
                />
              </th>
              <th className="px-2 py-2">Name</th>
              <th className="px-2 py-2">City</th>
              <th className="px-2 py-2">Entity Type</th>
              <th className="px-2 py-2">Address</th>
              <th className="px-2 py-2">Open</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((lead) => (
              <tr key={lead.id} className="border-b border-slate-100 text-slate-700">
                <td className="px-2 py-2">
                  <input
                    type="checkbox"
                    checked={selectedSet.has(lead.id)}
                    onChange={(e) => toggleSingle(lead.id, e.target.checked)}
                    aria-label={`Select ${lead.name}`}
                  />
                </td>
                <td className="px-2 py-2">{lead.name}</td>
                <td className="px-2 py-2">{lead.city || "-"}</td>
                <td className="px-2 py-2">{lead.industryType || "-"}</td>
                <td className="px-2 py-2">{lead.address1 || "-"}</td>
                <td className="px-2 py-2">
                  <Link href={`/leads/${lead.id}`} className="text-sky-700 hover:underline">
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {!filteredRows.length ? (
              <tr>
                <td colSpan={6} className="px-2 py-4 text-slate-500">
                  No registry leads match this filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </form>
  );
}
