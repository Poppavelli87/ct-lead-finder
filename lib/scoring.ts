import { clampScore } from "./utils";

type Candidate = {
  phone?: string | null;
  formatted_address?: string | null;
  website?: string | null;
  name?: string | null;
  business_status?: string | null;
};

export function computePreQualScore(candidate: Candidate): number {
  let score = 20;

  if ((candidate.phone ?? "").trim()) score += 30;
  if ((candidate.formatted_address ?? "").trim()) score += 25;
  if ((candidate.website ?? "").trim()) score += 20;

  if ((candidate.business_status ?? "").toUpperCase() === "OPERATIONAL") {
    score += 10;
  }

  if ((candidate.name ?? "").length >= 4) {
    score += 5;
  }

  return clampScore(score);
}

