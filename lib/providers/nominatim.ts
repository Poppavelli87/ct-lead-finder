import { getProviderBySlug, providerRequest } from "./request";
import { PROVIDER_SLUGS } from "./constants";

export type GeocodeResult = {
  lat: number;
  lon: number;
  displayName: string;
  isMock: boolean;
};

type NominatimItem = {
  lat: string;
  lon: string;
  display_name: string;
};

export async function nominatimGeocode(query: string): Promise<GeocodeResult | null> {
  const provider = await getProviderBySlug(PROVIDER_SLUGS.NOMINATIM);
  const endpoints = (provider.endpoints ?? {}) as Record<string, unknown>;
  const userAgent = typeof endpoints.user_agent === "string" ? endpoints.user_agent : "CTLeadFinder/1.0";

  if (!provider.enabled) {
    return {
      lat: 41.7637,
      lon: -72.6851,
      displayName: "Hartford, Connecticut",
      isMock: true,
    };
  }

  const response = await providerRequest<NominatimItem[]>({
    slug: PROVIDER_SLUGS.NOMINATIM,
    endpointKey: "search",
    query: {
      q: query,
      format: "jsonv2",
      limit: 1,
      addressdetails: 1,
      countrycodes: "us",
    },
    headers: {
      "User-Agent": userAgent,
    },
  });

  const item = response.data?.[0];
  if (!item) return null;

  return {
    lat: Number(item.lat),
    lon: Number(item.lon),
    displayName: item.display_name,
    isMock: response.isMock,
  };
}

