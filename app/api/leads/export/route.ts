import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildLeadWhere } from "@/lib/lead-filters";
import { derivePipelineStatus } from "@/lib/pipeline-status";
import { sanitizeExcelCell } from "@/lib/utils";

export const runtime = "nodejs";

function csvEscape(value: unknown): string {
  const text = sanitizeExcelCell(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const query = request.nextUrl.searchParams;
  const qualifiedOnly = query.get("qualifiedOnly") === "1";

  const where: Prisma.LeadWhereInput = {
    AND: [
      buildLeadWhere({
        name: query.get("name") || undefined,
        city: query.get("city") || undefined,
        county: query.get("county") || undefined,
        industryType: query.get("industryType") || undefined,
        pipelineStatus: query.get("pipelineStatus") || undefined,
        qualified: (query.get("qualified") as "all" | "yes" | "no" | null) ?? "all",
        source: query.get("source") || undefined,
        dateFrom: query.get("dateFrom") || undefined,
        dateTo: query.get("dateTo") || undefined,
      }),
      { phone: { not: null } },
      { state: { equals: "CT", mode: Prisma.QueryMode.insensitive } },
      ...(qualifiedOnly ? [{ qualified: true }] : []),
    ],
  };

  const leads = await db.lead.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  const headers = [
    "LeadID",
    "Name",
    "Source",
    "Industry",
    "Phone",
    "Email",
    "Website",
    "Street",
    "City",
    "State",
    "Zip",
    "County",
    "Qualified",
    "QualificationScore",
    "PipelineStatus",
    "CreatedAt",
  ];

  const lines = [headers.join(",")];
  for (const lead of leads) {
    const row = [
      lead.id,
      lead.name,
      lead.source,
      lead.industryType ?? "",
      lead.phone ?? "",
      lead.email ?? "",
      lead.website ?? "",
      lead.address1 ?? "",
      lead.city ?? "",
      lead.state ?? "",
      lead.zip ?? "",
      lead.county ?? "",
      lead.qualified ? "Yes" : "No",
      lead.qualificationScore,
      derivePipelineStatus({
        source: lead.source,
        externalId: lead.externalId,
        phone: lead.phone,
        matchStatus: lead.matchStatus,
        phoneStatus: lead.phoneStatus,
      }),
      lead.createdAt.toISOString(),
    ];
    lines.push(row.map(csvEscape).join(","));
  }

  return new NextResponse(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="ct-leads-with-phones.csv"',
      "Cache-Control": "no-store",
    },
  });
}
