"use client";

import { useActionState } from "react";
import { runGoogleSearchAction } from "@/app/actions/googleSearch";

const initialState = { message: "" };

export function GoogleSearchForm({ counties }: { counties: string[] }) {
  const [state, formAction, pending] = useActionState(runGoogleSearchAction, initialState);

  return (
    <form action={formAction} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3">
      <input
        name="businessType"
        placeholder="Business type (e.g. roofer)"
        required
        className="rounded-md border border-slate-300 px-3 py-2"
      />

      <select name="county" className="rounded-md border border-slate-300 px-3 py-2">
        <option value="">County (optional)</option>
        {counties.map((county) => (
          <option key={county} value={county}>
            {county}
          </option>
        ))}
      </select>

      <input name="city" placeholder="City (optional)" className="rounded-md border border-slate-300 px-3 py-2" />
      <input name="zip" placeholder="ZIP (optional)" className="rounded-md border border-slate-300 px-3 py-2" />
      <input
        type="number"
        name="targetCount"
        defaultValue={100}
        min={1}
        max={500}
        className="rounded-md border border-slate-300 px-3 py-2"
      />

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="progressive" defaultChecked />
        Progressive Search (county expansion)
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-70"
      >
        {pending ? "Searching..." : "Run Google Search"}
      </button>

      {state.message ? <div className="text-sm text-slate-700 md:col-span-3">{state.message}</div> : null}
    </form>
  );
}

