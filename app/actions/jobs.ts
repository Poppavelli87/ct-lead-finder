"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { MAX_UPLOAD_BYTES } from "@/lib/env";
import { parseSpreadsheet } from "@/lib/xlsx";
import { jobMappingSchema } from "@/lib/validation";

function findHeader(headers: string[], candidates: string[]): string | undefined {
  const normalized = headers.map((header) => ({
    raw: header,
    normalized: header.trim().toLowerCase(),
  }));

  for (const candidate of candidates) {
    const found = normalized.find((entry) => entry.normalized.includes(candidate));
    if (found) return found.raw;
  }

  return undefined;
}

export async function uploadEnrichmentFileAction(
  _prevState: { message: string; jobId?: string },
  formData: FormData,
): Promise<{ message: string; jobId?: string }> {
  await requireUser();

  const file = formData.get("file") as File | null;
  if (!file) {
    return { message: "Select a CSV or XLSX file." };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return { message: "File too large (max 5MB)." };
  }

  const filename = file.name.toLowerCase();
  if (!(filename.endsWith(".csv") || filename.endsWith(".xlsx") || filename.endsWith(".xls"))) {
    return { message: "Only CSV/XLSX uploads are allowed." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = parseSpreadsheet(buffer);

  if (!parsed.headers.length || !parsed.rows.length) {
    return { message: "File appears empty." };
  }

  const mapping = {
    name: findHeader(parsed.headers, ["name", "business", "company"]) || parsed.headers[0],
    website: findHeader(parsed.headers, ["website", "domain", "url"]),
    city: findHeader(parsed.headers, ["city", "town"]),
    county: findHeader(parsed.headers, ["county"]),
    phone: findHeader(parsed.headers, ["phone", "tel"]),
    address: findHeader(parsed.headers, ["address", "street"]),
    email: findHeader(parsed.headers, ["email"]),
  };

  const job = await db.enrichmentJob.create({
    data: {
      sourceFilename: file.name,
      sourceHeaders: parsed.headers,
      mapping: mapping,
      totalRows: parsed.rows.length,
    },
  });

  await db.jobRow.createMany({
    data: parsed.rows.map((row, idx) => ({
      jobId: job.id,
      rowIndex: idx,
      originalData: row,
    })),
  });

  revalidatePath("/enrich/bulk");
  return {
    message: `Upload accepted. Job ${job.id} created with ${parsed.rows.length} rows.`,
    jobId: job.id,
  };
}

export async function saveJobMappingAction(formData: FormData): Promise<void> {
  await requireUser();

  const parsed = jobMappingSchema.safeParse({
    jobId: formData.get("jobId"),
    name: formData.get("name"),
    website: formData.get("website") || undefined,
    city: formData.get("city") || undefined,
    county: formData.get("county") || undefined,
    phone: formData.get("phone") || undefined,
    address: formData.get("address") || undefined,
    email: formData.get("email") || undefined,
  });

  if (!parsed.success) {
    return;
  }

  await db.enrichmentJob.update({
    where: { id: parsed.data.jobId },
    data: {
      mapping: parsed.data,
    },
  });

  revalidatePath("/enrich/bulk");
}

