import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildJobExportRows, toWorkbookBuffer } from "@/lib/xlsx";

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobId = request.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  const rows = await db.jobRow.findMany({
    where: { jobId },
    orderBy: { rowIndex: "asc" },
    select: {
      originalData: true,
      finalData: true,
    },
  });

  const workbook = toWorkbookBuffer(buildJobExportRows(rows));
  const body = new Uint8Array(workbook);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="enrichment-job-${jobId}.xlsx"`,
    },
  });
}

