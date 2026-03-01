import { db } from "./db";
import { computeQualificationScore, isQualifiedLead } from "./qualification";
import { domainFromWebsite, normalizePhone, normalizeString, normalizeZip } from "./utils";

export type LeadInput = {
  source: string;
  externalId?: string | null;
  name: string;
  industryType?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  ownerName?: string | null;
  socialLinks?: unknown;
  address1?: string | null;
  city?: string | null;
  county?: string | null;
  state?: string | null;
  zip?: string | null;
  notes?: string | null;
  preQualScore?: number | null;
};

function mergeLead(existing: any, incoming: LeadInput): Record<string, unknown> {
  const website = incoming.website || existing.website;
  const merged = {
    name: incoming.name || existing.name,
    industryType: incoming.industryType || existing.industryType,
    phone: incoming.phone || existing.phone,
    email: incoming.email || existing.email,
    website,
    domain: domainFromWebsite(website) || existing.domain,
    ownerName: incoming.ownerName || existing.ownerName,
    socialLinks: incoming.socialLinks ?? existing.socialLinks,
    address1: incoming.address1 || existing.address1,
    city: incoming.city || existing.city,
    county: incoming.county || existing.county,
    state: incoming.state || existing.state,
    zip: incoming.zip || existing.zip,
    notes: incoming.notes || existing.notes,
    preQualScore: incoming.preQualScore ?? existing.preQualScore,
  };

  const qualificationScore = computeQualificationScore(merged);

  return {
    ...merged,
    qualified: isQualifiedLead(merged),
    qualificationScore,
  };
}

export async function findDuplicateLead(input: LeadInput): Promise<any | null> {
  const filters: Array<Record<string, unknown>> = [];

  if (input.externalId) {
    filters.push({ externalId: input.externalId });
  }

  const normalizedPhone = normalizePhone(input.phone);
  const normalizedAddress = normalizeString(input.address1);
  const normalizedZipCode = normalizeZip(input.zip);
  const domain = domainFromWebsite(input.website);
  const normalizedCity = normalizeString(input.city);

  if (normalizedPhone && normalizedAddress && normalizedZipCode) {
    filters.push({
      phone: { contains: normalizedPhone.slice(-7) },
      address1: { contains: input.address1 ?? "", mode: "insensitive" },
      zip: normalizedZipCode,
    });
  }

  if (domain && normalizedCity) {
    filters.push({
      domain,
      city: { equals: input.city ?? "", mode: "insensitive" },
    });
  }

  if (!filters.length) return null;

  const candidates = await db.lead.findMany({
    where: { OR: filters },
    take: 20,
  });

  return (
    candidates.find((candidate) => {
      if (input.externalId && candidate.externalId === input.externalId) return true;

      const samePhoneAddressZip =
        normalizedPhone &&
        normalizePhone(candidate.phone) === normalizedPhone &&
        normalizeString(candidate.address1) === normalizedAddress &&
        normalizeZip(candidate.zip) === normalizedZipCode;

      const sameDomainCity =
        domain &&
        candidate.domain === domain &&
        normalizeString(candidate.city) === normalizedCity;

      return Boolean(samePhoneAddressZip || sameDomainCity);
    }) ?? null
  );
}

export async function dedupeAndSaveLead(input: LeadInput): Promise<any> {
  const website = input.website ?? null;
  const withDefaults = {
    ...input,
    state: input.state ?? "CT",
    domain: domainFromWebsite(website),
  };

  const duplicate = await findDuplicateLead(withDefaults);
  if (duplicate) {
    return db.lead.update({
      where: { id: duplicate.id },
      data: mergeLead(duplicate, withDefaults),
    });
  }

  const base = {
    ...withDefaults,
    qualificationScore: computeQualificationScore(withDefaults),
    qualified: isQualifiedLead(withDefaults),
    domain: domainFromWebsite(website),
  };

  return db.lead.create({ data: base as any });
}

