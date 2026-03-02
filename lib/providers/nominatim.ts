import { getProviderBySlug, ProviderRequestError, providerRequest } from "./request";
import { PROVIDER_SLUGS } from "./constants";

export type GeocodeResult = {
  lat: number;
  lon: number;
  displayName: string;
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
    throw new ProviderRequestError({
      code: "PROVIDER_NOT_CONFIGURED",
      provider: PROVIDER_SLUGS.NOMINATIM,
      statusCode: 500,
      message: "Nominatim provider is disabled in API Hub.",
    });
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
  };
}

