import { clampScore } from "./utils";

type LeadLike = {
  phone?: string | null;
  address1?: string | null;
  website?: string | null;
  state?: string | null;
};

export function hasRealStreetAddress(address?: string | null): boolean {
  const text = (address ?? "").trim();
  if (!text) return false;
  return !/\bP\.?\s*O\.?\s*Box\b/i.test(text);
}

export function computeQualificationScore(lead: LeadLike): number {
  let score = 0;
  if ((lead.phone ?? "").trim()) score += 40;
  if (hasRealStreetAddress(lead.address1)) score += 40;
  if ((lead.website ?? "").trim()) score += 20;
  return clampScore(score);
}

export function isQualifiedLead(lead: LeadLike): boolean {
  const state = (lead.state ?? "").trim().toUpperCase();
  return state === "CT" && Boolean((lead.phone ?? "").trim()) && hasRealStreetAddress(lead.address1);
}

