import { MasterRecord } from "@prisma/client";
import { db } from "./db";
import { domainFromWebsite, normalizePhone, normalizeString } from "./utils";

export type MasterIdentityInput = {
  name?: string | null;
  phone?: string | null;
  website?: string | null;
};

const NAME_COLUMNS = [
  "name",
  "business name",
  "company",
  "company name",
  "legal name",
];

const PHONE_COLUMNS = [
  "phone",
  "phone number",
  "telephone",
  "tel",
  "contact phone",
];

const WEBSITE_COLUMNS = [
  "website",
  "domain",
  "url",
  "site",
  "web",
];

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWebsite(value?: string | null): string {
  const trimmed = normalizeString(value);
  if (!trimmed) return "";

  const domain = domainFromWebsite(trimmed);
  if (domain) return domain;

  return trimmed.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function normalizeName(value?: string | null): string {
  return normalizeString(value).replace(/\s+/g, " ").trim();
}

function pickValue(row: Record<string, string>, candidateHeaders: string[]): string | null {
  const entries = Object.entries(row).map(([header, value]) => ({
    header: normalizeHeader(header),
    value: String(value ?? "").trim(),
  }));

  for (const candidate of candidateHeaders) {
    const normalizedCandidate = normalizeHeader(candidate);
    const found = entries.find(
      (entry) =>
        entry.header === normalizedCandidate ||
        entry.header.includes(normalizedCandidate) ||
        normalizedCandidate.includes(entry.header),
    );
    if (found?.value) return found.value;
  }

  return null;
}

export function extractMasterIdentityFromRow(row: Record<string, string>): MasterIdentityInput {
  return {
    name: pickValue(row, NAME_COLUMNS),
    phone: pickValue(row, PHONE_COLUMNS),
    website: pickValue(row, WEBSITE_COLUMNS),
  };
}

export function buildMasterNormalizedKey(input: MasterIdentityInput): string {
  const name = normalizeName(input.name);
  const phone = normalizePhone(input.phone);
  const website = normalizeWebsite(input.website);
  return `${name}|${phone}|${website}`;
}

export function buildMasterKeyVariants(input: MasterIdentityInput): string[] {
  const name = normalizeName(input.name);
  const phone = normalizePhone(input.phone);
  const website = normalizeWebsite(input.website);
  if (!name) return [];

  const variants = new Set<string>();
  variants.add(`${name}|${phone}|${website}`);
  variants.add(`${name}|${phone}|`);
  variants.add(`${name}||${website}`);
  variants.add(`${name}||`);

  return Array.from(variants).filter((key) => key !== "||");
}

export async function findMasterRecordByIdentity(input: MasterIdentityInput): Promise<MasterRecord | null> {
  const keys = buildMasterKeyVariants(input);
  if (!keys.length) return null;

  return db.masterRecord.findFirst({
    where: {
      normalizedKey: {
        in: keys,
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function isMasterDuplicate(input: MasterIdentityInput): Promise<boolean> {
  const found = await findMasterRecordByIdentity(input);
  return Boolean(found);
}

export async function upsertMasterRecordsFromRows(rows: Record<string, string>[]): Promise<{
  processedRows: number;
  acceptedRows: number;
  skippedRows: number;
  uniqueKeysPrepared: number;
  insertedKeys: number;
  duplicateKeys: number;
}> {
  const keyMap = new Map<
    string,
    {
      name: string | null;
      phone: string | null;
      website: string | null;
      normalizedKey: string;
    }
  >();

  let acceptedRows = 0;
  let skippedRows = 0;

  for (const row of rows) {
    const identity = extractMasterIdentityFromRow(row);
    const normalizedName = normalizeName(identity.name);
    if (!normalizedName) {
      skippedRows += 1;
      continue;
    }

    acceptedRows += 1;

    for (const key of buildMasterKeyVariants(identity)) {
      if (!keyMap.has(key)) {
        keyMap.set(key, {
          name: identity.name?.trim() || null,
          phone: normalizePhone(identity.phone) || null,
          website: normalizeWebsite(identity.website) || null,
          normalizedKey: key,
        });
      }
    }
  }

  if (!keyMap.size) {
    return {
      processedRows: rows.length,
      acceptedRows,
      skippedRows,
      uniqueKeysPrepared: 0,
      insertedKeys: 0,
      duplicateKeys: 0,
    };
  }

  const created = await db.masterRecord.createMany({
    data: Array.from(keyMap.values()),
    skipDuplicates: true,
  });

  return {
    processedRows: rows.length,
    acceptedRows,
    skippedRows,
    uniqueKeysPrepared: keyMap.size,
    insertedKeys: created.count,
    duplicateKeys: keyMap.size - created.count,
  };
}
