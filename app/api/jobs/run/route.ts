import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { processEnrichmentJobChunk } from "@/lib/enrichment";

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobId = request.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  const chunkSize = Number(request.nextUrl.searchParams.get("chunkSize") ?? "10");

  try {
    const result = await processEnrichmentJobChunk(jobId, Number.isFinite(chunkSize) ? chunkSize : 10);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process job" },
      { status: 500 },
    );
  }
}

