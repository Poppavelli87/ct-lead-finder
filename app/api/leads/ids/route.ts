import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildLeadWhere } from "@/lib/lead-filters";
import { leadFilterSchema } from "@/lib/validation";

export const runtime = "nodejs";

const idsBodySchema = z.object({
  filters: leadFilterSchema.partial().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  cursor: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await request.json().catch(() => ({}));
  const parsed = idsBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const take = parsed.data.limit ?? 500;
  const normalizedFilters = {
    qualified: "all" as const,
    ...parsed.data.filters,
  };

  const where = buildLeadWhere(normalizedFilters);
  const rows = await db.lead.findMany({
    where,
    select: { id: true },
    orderBy: { id: "asc" },
    take: take + 1,
    ...(parsed.data.cursor
      ? {
          cursor: { id: parsed.data.cursor },
          skip: 1,
        }
      : {}),
  });

  const hasMore = rows.length > take;
  const ids = (hasMore ? rows.slice(0, take) : rows).map((row) => row.id);
  const nextCursor = hasMore ? ids[ids.length - 1] : undefined;
  const totalEligible = await db.lead.count({ where });

  return NextResponse.json({
    ids,
    totalEligible,
    nextCursor,
  });
}
