import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildLeadWhere } from "@/lib/lead-filters";
import { buildLeadExportRows, toWorkbookBuffer } from "@/lib/xlsx";

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const query = request.nextUrl.searchParams;
  const where = buildLeadWhere({
    name: query.get("name") || undefined,
    city: query.get("city") || undefined,
    county: query.get("county") || undefined,
    industryType: query.get("industryType") || undefined,
    qualified: (query.get("qualified") as "all" | "yes" | "no" | null) ?? "all",
    source: query.get("source") || undefined,
    dateFrom: query.get("dateFrom") || undefined,
    dateTo: query.get("dateTo") || undefined,
  });

  const leads = await db.lead.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  const workbook = toWorkbookBuffer(buildLeadExportRows(leads));
  const body = new Uint8Array(workbook);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="ct-leads-export.xlsx"',
    },
  });
}

