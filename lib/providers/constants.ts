export const PROVIDER_SLUGS = {
  GOOGLE: "google_places",
  SOCRATA: "ct_socrata",
  RDAP: "rdap",
  NOMINATIM: "nominatim",
  GENERIC_ENRICH: "generic_enrich",
} as const;

export type ProviderSlug = (typeof PROVIDER_SLUGS)[keyof typeof PROVIDER_SLUGS];

export const PROVIDER_DEFAULTS: Array<{
  name: string;
  slug: ProviderSlug;
  enabled: boolean;
  baseUrl: string;
  endpoints: Record<string, unknown>;
  rateLimitPerSec: number;
  timeoutMs: number;
  defaultCostPerCall: number;
}> = [
  {
    name: "Google Places API (New)",
    slug: PROVIDER_SLUGS.GOOGLE,
    enabled: false,
    baseUrl: "https://maps.googleapis.com",
    endpoints: {
      text_search_new: "https://places.googleapis.com/v1/places:searchText",
      place_phone_details: "https://places.googleapis.com/v1/places/{placeId}",
      text_search: "/maps/api/place/textsearch/json",
      place_details: "/maps/api/place/details/json",
      geocode: "/maps/api/geocode/json",
    },
    rateLimitPerSec: 10,
    timeoutMs: 12000,
    defaultCostPerCall: 0,
  },
  {
    name: "Connecticut Open Data (Socrata)",
    slug: PROVIDER_SLUGS.SOCRATA,
    enabled: true,
    baseUrl: "https://data.ct.gov",
    endpoints: {
      dataset_id: "n7gp-d28j",
      query: "/resource/{datasetId}.json",
    },
    rateLimitPerSec: 4,
    timeoutMs: 10000,
    defaultCostPerCall: 0,
  },
  {
    name: "WHOIS/RDAP",
    slug: PROVIDER_SLUGS.RDAP,
    enabled: true,
    baseUrl: "https://rdap.org",
    endpoints: {
      domain_lookup: "/domain/{domain}",
    },
    rateLimitPerSec: 2,
    timeoutMs: 12000,
    defaultCostPerCall: 0,
  },
  {
    name: "OpenStreetMap Nominatim",
    slug: PROVIDER_SLUGS.NOMINATIM,
    enabled: true,
    baseUrl: "https://nominatim.openstreetmap.org",
    endpoints: {
      search: "/search",
      reverse: "/reverse",
      user_agent: "CTLeadFinder/1.0 (local-dev)",
    },
    rateLimitPerSec: 1,
    timeoutMs: 15000,
    defaultCostPerCall: 0,
  },
  {
    name: "Company Enrichment API (Generic)",
    slug: PROVIDER_SLUGS.GENERIC_ENRICH,
    enabled: false,
    baseUrl: "https://api.company-enrichment.com",
    endpoints: {
      enrich_domain: "/enrich?domain={domain}",
    },
    rateLimitPerSec: 2,
    timeoutMs: 12000,
    defaultCostPerCall: 0,
  },
];

export const GOOGLE_TEXT_SEARCH_COST = 0.032;
export const GOOGLE_DETAILS_COST = 0.032;

