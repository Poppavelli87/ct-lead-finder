export type LeadFilterInput = {
  name?: string;
  city?: string;
  county?: string;
  industryType?: string;
  qualified?: "all" | "yes" | "no";
  source?: string;
  dateFrom?: string;
  dateTo?: string;
};

export function buildLeadWhere(filters: LeadFilterInput): Record<string, any> {
  const where: Record<string, any> = {};
  const validSources = ["GOOGLE", "CT_REGISTRY", "UPLOAD", "MANUAL", "DIRECTORY", "MOCK"];

  if (filters.name) {
    where.name = { contains: filters.name, mode: "insensitive" };
  }

  if (filters.city) {
    where.city = { contains: filters.city, mode: "insensitive" };
  }

  if (filters.county) {
    where.county = { contains: filters.county, mode: "insensitive" };
  }

  if (filters.industryType) {
    where.industryType = { contains: filters.industryType, mode: "insensitive" };
  }

  if (filters.qualified === "yes") {
    where.qualified = true;
  }

  if (filters.qualified === "no") {
    where.qualified = false;
  }

  if (filters.source && filters.source !== "all") {
    if (validSources.includes(filters.source)) {
      where.source = filters.source;
    }
  }

  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) {
      where.createdAt.gte = new Date(filters.dateFrom);
    }
    if (filters.dateTo) {
      where.createdAt.lte = new Date(filters.dateTo);
    }
  }

  return where;
}

