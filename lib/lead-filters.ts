import { Prisma } from "@prisma/client";
import { pipelineStatusWhere } from "./pipeline-status";

export type LeadFilterInput = {
  name?: string;
  city?: string;
  county?: string;
  industryType?: string;
  pipelineStatus?: string;
  qualified?: "all" | "yes" | "no";
  source?: string;
  dateFrom?: string;
  dateTo?: string;
};

export function buildLeadWhere(filters: LeadFilterInput): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {};
  const validSources = ["GOOGLE", "CT_REGISTRY", "UPLOAD", "MANUAL", "DIRECTORY"] as const;
  type ValidSource = (typeof validSources)[number];
  const and: Prisma.LeadWhereInput[] = [];

  if (filters.name) {
    and.push({ name: { contains: filters.name, mode: "insensitive" } });
  }

  if (filters.city) {
    and.push({ city: { contains: filters.city, mode: "insensitive" } });
  }

  if (filters.county) {
    and.push({ county: { contains: filters.county, mode: "insensitive" } });
  }

  if (filters.industryType) {
    and.push({ industryType: { contains: filters.industryType, mode: "insensitive" } });
  }

  if (filters.qualified === "yes") {
    and.push({ qualified: true });
  }

  if (filters.qualified === "no") {
    and.push({ qualified: false });
  }

  if (filters.source && filters.source !== "all") {
    if ((validSources as readonly string[]).includes(filters.source)) {
      and.push({ source: filters.source as ValidSource });
    }
  }

  if (filters.dateFrom || filters.dateTo) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (filters.dateFrom) {
      createdAt.gte = new Date(filters.dateFrom);
    }
    if (filters.dateTo) {
      createdAt.lte = new Date(filters.dateTo);
    }
    and.push({ createdAt });
  }

  const pipelineFilter = pipelineStatusWhere(filters.pipelineStatus);
  if (pipelineFilter) {
    and.push(pipelineFilter);
  }

  if (and.length) {
    where.AND = and;
  }

  return where;
}

