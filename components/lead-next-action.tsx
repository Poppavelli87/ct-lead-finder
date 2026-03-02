"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type PipelineActionState = "MATCH" | "PHONE" | "EXPORT";

export function LeadNextAction({
  leadId,
  actionState,
}: {
  leadId: string;
  actionState: PipelineActionState;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>("");

  async function runMatch() {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/leads/match-google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: [leadId],
          limits: {
            scope: "search",
            maxLeads: 1,
            maxGoogleCalls: 1,
            rateLimitRps: 10,
          },
        }),
      });
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        setMessage(String(body.message ?? body.error ?? `Match failed (${response.status}).`));
        return;
      }
      setMessage("Google match completed.");
      router.refresh();
    } catch {
      setMessage("Google match failed.");
    } finally {
      setPending(false);
    }
  }

  async function runPhone() {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/leads/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: [leadId],
          mode: "PHONE_ONLY",
          limits: {
            scope: "phone",
            maxLeads: 1,
            maxGoogleCalls: 1,
            rateLimitRps: 10,
          },
        }),
      });
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        setMessage(String(body.message ?? body.error ?? `Phone fetch failed (${response.status}).`));
        return;
      }
      setMessage("Phone fetch completed.");
      router.refresh();
    } catch {
      setMessage("Phone fetch failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      {actionState === "MATCH" ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => void runMatch()}
          className="rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-60"
        >
          {pending ? "Matching..." : "Match Google"}
        </button>
      ) : null}

      {actionState === "PHONE" ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => void runPhone()}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-60"
        >
          {pending ? "Fetching..." : "Fetch Phone"}
        </button>
      ) : null}

      {actionState === "EXPORT" ? (
        <Link
          href="/api/leads/export"
          className="inline-block rounded-md bg-indigo-700 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600"
        >
          Ready to Export
        </Link>
      ) : null}

      {message ? <div className="text-xs text-slate-600">{message}</div> : null}
    </div>
  );
}
