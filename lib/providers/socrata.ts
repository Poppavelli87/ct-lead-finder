import { subMonths } from "date-fns";
import { dedupeAndSaveLead } from "../dedupe";
import { getProviderBySlug, getProviderSecret, providerRequest } from "./request";
import { PROVIDER_SLUGS } from "./constants";

export type CtRegistryFilters = {
  nameContains?: string;
  city?: string;
  entityType?: string;
  filingDateFrom?: string;
  filingDateTo?: string;
  newBusinessesOnly: boolean;
  limit?: number;
};

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function mockRegistryRows(filters: CtRegistryFilters) {
  const seedName = filters.nameContains || "CT Business";
  return Array.from({ length: 20 }).map((_, idx) => ({
    id: `mock-reg-${idx}`,
    business_name: `${seedName} ${idx + 1}`,
    city: filters.city || ["Hartford", "New Haven", "Bridgeport"][idx % 3],
    entity_type: filters.entityType || "LLC",
    filing_date: formatDate(subMonths(new Date(), idx % 8)),
    principal_address: `${120 + idx} Oak Street`,
    zip: `06${String(100 + idx).slice(-3)}`,
  }));
}

function endpointWithDataset(endpoints: Record<string, unknown>, datasetId: string): string {
  const queryTemplate = typeof endpoints.query === "string" ? endpoints.query : "";
  if (queryTemplate.includes("{datasetId}")) {
    return queryTemplate.replace("{datasetId}", datasetId);
  }
  return `/resource/${datasetId}.json`;
}

function valueFromRow(row: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

export async function searchCtRegistry(filters: CtRegistryFilters) {
  const provider = await getProviderBySlug(PROVIDER_SLUGS.SOCRATA);
  const endpoints = (provider.endpoints ?? {}) as Record<string, unknown>;
  const rawDatasetId =
    typeof endpoints.dataset_id === "string"
      ? endpoints.dataset_id
      : typeof endpoints.datasetId === "string"
        ? endpoints.datasetId
        : "";
  const datasetId = rawDatasetId.trim();
  const appToken = await getProviderSecret(PROVIDER_SLUGS.SOCRATA);

  const effectiveLimit = Math.max(10, Math.min(filters.limit ?? 100, 500));
  const whereClauses: string[] = [];

  if (filters.nameContains) {
    const value = filters.nameContains.replace(/'/g, "''");
    whereClauses.push(`upper(business_name) like upper('%${value}%')`);
  }
  if (filters.city) {
    const value = filters.city.replace(/'/g, "''");
    whereClauses.push(`upper(city) = upper('${value}')`);
  }
  if (filters.entityType) {
    const value = filters.entityType.replace(/'/g, "''");
    whereClauses.push(`upper(entity_type) = upper('${value}')`);
  }

  const fromDate = filters.newBusinessesOnly
    ? formatDate(subMonths(new Date(), 6))
    : filters.filingDateFrom;

  if (fromDate) {
    whereClauses.push(`filing_date >= '${fromDate}'`);
  }

  if (filters.filingDateTo) {
    whereClauses.push(`filing_date <= '${filters.filingDateTo}'`);
  }

  const shouldMock = !provider.enabled || !datasetId;

  const response = await providerRequest<Record<string, unknown>[]>({
    slug: PROVIDER_SLUGS.SOCRATA,
    endpointKey: shouldMock ? "query" : endpointWithDataset(endpoints, datasetId),
    forceMock: shouldMock,
    mockResponse: mockRegistryRows(filters),
    query: {
      $limit: effectiveLimit,
      $where: whereClauses.length ? whereClauses.join(" AND ") : undefined,
      $order: "filing_date DESC",
    },
    headers: appToken
      ? {
          "X-App-Token": appToken,
        }
      : undefined,
  });

  const rows = response.data ?? [];

  const leads: any[] = [];
  for (const row of rows) {
    const name = valueFromRow(row, ["business_name", "entity_name", "name"]);
    if (!name) continue;

    const lead = await dedupeAndSaveLead({
      source: "CT_REGISTRY",
      externalId: valueFromRow(row, ["id", "record_id", "entity_number"]),
      name,
      city: valueFromRow(row, ["city", "town"]),
      county: valueFromRow(row, ["county"]),
      industryType: valueFromRow(row, ["entity_type", "type"]),
      address1: valueFromRow(row, ["principal_address", "address", "street"]),
      zip: valueFromRow(row, ["zip", "zipcode", "postal_code"]),
      state: "CT",
      notes: valueFromRow(row, ["filing_date"]),
    });
    leads.push(lead);
  }

  return {
    rows,
    leads,
    isMock: response.isMock,
  };
}

