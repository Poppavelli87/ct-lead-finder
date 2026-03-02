import { subMonths } from "date-fns";
import { dedupeAndSaveLead } from "../dedupe";
import { getProviderBySlug, getProviderSecret, ProviderRequestError, providerRequest } from "./request";
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
  if (!provider.enabled) {
    throw new ProviderRequestError({
      code: "PROVIDER_NOT_CONFIGURED",
      provider: PROVIDER_SLUGS.SOCRATA,
      statusCode: 500,
      message: "Socrata provider is disabled in API Hub.",
    });
  }
  const endpoints = (provider.endpoints ?? {}) as Record<string, unknown>;
  const rawDatasetId =
    typeof endpoints.dataset_id === "string"
      ? endpoints.dataset_id
      : typeof endpoints.datasetId === "string"
        ? endpoints.datasetId
        : "";
  const datasetId = rawDatasetId.trim();
  if (!datasetId) {
    throw new ProviderRequestError({
      code: "PROVIDER_NOT_CONFIGURED",
      provider: PROVIDER_SLUGS.SOCRATA,
      statusCode: 500,
      message: "Socrata dataset_id is missing in API Hub.",
    });
  }
  const appToken = await getProviderSecret(PROVIDER_SLUGS.SOCRATA);

  const effectiveLimit = Math.max(10, Math.min(filters.limit ?? 100, 500));
  const whereClauses: string[] = [];

  if (filters.nameContains) {
    const value = filters.nameContains.replace(/'/g, "''");
    whereClauses.push(`upper(name) like upper('%${value}%')`);
  }

  const fromDate = filters.newBusinessesOnly
    ? formatDate(subMonths(new Date(), 6))
    : filters.filingDateFrom;

  if (fromDate) {
    whereClauses.push(`create_dt >= '${fromDate}'`);
  }

  if (filters.filingDateTo) {
    whereClauses.push(`create_dt <= '${filters.filingDateTo}'`);
  }

  const response = await providerRequest<Record<string, unknown>[]>({
    slug: PROVIDER_SLUGS.SOCRATA,
    endpointKey: endpointWithDataset(endpoints, datasetId),
    query: {
      $limit: effectiveLimit,
      $where: whereClauses.length ? whereClauses.join(" AND ") : undefined,
      $order: "create_dt DESC",
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
    const name = valueFromRow(row, ["name"]);
    if (!name) continue;

    const lead = await dedupeAndSaveLead({
      source: "CT_REGISTRY",
      externalId: valueFromRow(row, ["accountnumber"]),
      name,
      industryType: valueFromRow(row, ["status"]),
      address1: valueFromRow(row, ["mailing_address"]),
      state: "CT",
      notes: valueFromRow(row, ["create_dt"]),
    });
    leads.push(lead);
  }

  return {
    rows,
    leads,
  };
}

