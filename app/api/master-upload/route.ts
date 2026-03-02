import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { MAX_UPLOAD_BYTES } from "@/lib/env";
import { upsertMasterRecordsFromRows } from "@/lib/master-dedupe";
import { parseSpreadsheet } from "@/lib/xlsx";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "File is required." }, { status: 400 });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ ok: false, error: "File too large (max 5MB)." }, { status: 400 });
  }

  const lower = file.name.toLowerCase();
  if (!(lower.endsWith(".csv") || lower.endsWith(".xlsx") || lower.endsWith(".xls"))) {
    return NextResponse.json({ ok: false, error: "Only CSV/XLSX uploads are allowed." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseSpreadsheet(buffer);

    if (!parsed.rows.length) {
      return NextResponse.json({ ok: false, error: "Uploaded file is empty." }, { status: 400 });
    }

    const result = await upsertMasterRecordsFromRows(parsed.rows);
    const totalRecords = await db.masterRecord.count();

    return NextResponse.json({
      ok: true,
      ...result,
      totalRecords,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to process master upload.",
      },
      { status: 500 },
    );
  }
}
