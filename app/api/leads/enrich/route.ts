import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { enrichLeadWithGoogle } from "@/lib/providers/google";

export const runtime = "nodejs";

const enrichBodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
});

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const raw = await request.json().catch(() => ({}));
  const parsed = enrichBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload." }, { status: 400 });
  }

  const ids = Array.from(new Set(parsed.data.ids));
  const leads = await db.lead.findMany({
    where: {
      id: { in: ids },
    },
  });

  let updated = 0;
  let failed = 0;

  for (const lead of leads) {
    try {
      await enrichLeadWithGoogle(lead);
      updated += 1;
    } catch {
      failed += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    updated,
    failed,
    requested: ids.length,
    found: leads.length,
  });
}
