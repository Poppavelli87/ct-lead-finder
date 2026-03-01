"use client";

import { useActionState } from "react";
import { runCtRegistrySearchAction } from "@/app/actions/ctRegistry";

const initialState = { message: "" };

export function CtRegistryForm() {
  const [state, formAction, pending] = useActionState(runCtRegistrySearchAction, initialState);

  return (
    <form action={formAction} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3">
      <input name="nameContains" placeholder="Name contains" className="rounded-md border border-slate-300 px-3 py-2" />
      <input name="city" placeholder="City" className="rounded-md border border-slate-300 px-3 py-2" />
      <input name="entityType" placeholder="Entity type" className="rounded-md border border-slate-300 px-3 py-2" />
      <input type="date" name="filingDateFrom" className="rounded-md border border-slate-300 px-3 py-2" />
      <input type="date" name="filingDateTo" className="rounded-md border border-slate-300 px-3 py-2" />
      <input
        type="number"
        min={10}
        max={500}
        name="limit"
        defaultValue={100}
        className="rounded-md border border-slate-300 px-3 py-2"
      />

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="newBusinessesOnly" defaultChecked />
        New businesses only (last 6 months)
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-70"
      >
        {pending ? "Searching..." : "Search CT Registry"}
      </button>

      {state.message ? <div className="text-sm text-slate-700 md:col-span-3">{state.message}</div> : null}
    </form>
  );
}

