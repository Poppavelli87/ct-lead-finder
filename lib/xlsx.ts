import * as XLSX from "xlsx";
import { sanitizeExcelCell } from "./utils";

export type ParsedSheet = {
  headers: string[];
  rows: Record<string, string>[];
};

export function parseSpreadsheet(buffer: Buffer): ParsedSheet {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
    raw: false,
    defval: "",
  });

  const headers = data.length ? Object.keys(data[0]) : [];
  const rows = data.map((row) => {
    const normalized: Record<string, string> = {};
    for (const header of headers) {
      normalized[header] = String(row[header] ?? "").trim();
    }
    return normalized;
  });

  return { headers, rows };
}

export function toWorkbookBuffer(rows: Record<string, unknown>[]): Buffer {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Export");
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}

export function buildLeadExportRows(leads: any[]): Record<string, string>[] {
  return leads.map((lead) => ({
    LeadID: sanitizeExcelCell(lead.id),
    Name: sanitizeExcelCell(lead.name),
    Source: sanitizeExcelCell(lead.source),
    Industry: sanitizeExcelCell(lead.industryType),
    Phone: sanitizeExcelCell(lead.phone),
    Email: sanitizeExcelCell(lead.email),
    Website: sanitizeExcelCell(lead.website),
    OwnerName: sanitizeExcelCell(lead.ownerName),
    Street: sanitizeExcelCell(lead.address1),
    City: sanitizeExcelCell(lead.city),
    State: sanitizeExcelCell(lead.state),
    Zip: sanitizeExcelCell(lead.zip),
    County: sanitizeExcelCell(lead.county),
    Qualified: sanitizeExcelCell(lead.qualified ? "Yes" : "No"),
    QualificationScore: sanitizeExcelCell(lead.qualificationScore),
    CreatedAt: sanitizeExcelCell(lead.createdAt.toISOString()),
  }));
}

export function buildJobExportRows(rows: Array<{ originalData: unknown; finalData: unknown }>): Record<string, string>[] {
  return rows.map((row) => {
    const original = (row.originalData ?? {}) as Record<string, unknown>;
    const final = (row.finalData ?? {}) as Record<string, unknown>;

    const normalized: Record<string, string> = {};

    for (const [key, value] of Object.entries(original)) {
      normalized[sanitizeHeader(key)] = sanitizeExcelCell(value);
    }

    for (const [key, value] of Object.entries(final)) {
      normalized[`AF_${sanitizeHeader(key)}`] = sanitizeExcelCell(value);
    }

    return normalized;
  });
}

function sanitizeHeader(value: string): string {
  return value.replace(/[^A-Za-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "") || "field";
}

