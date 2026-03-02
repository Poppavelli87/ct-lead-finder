import { ProviderSlug, PROVIDER_SLUGS } from "./constants";
import { providerRequest } from "./request";
import { getProviderBySlug, getProviderSecret } from "./request";
import { fetchPhoneFromPlaceId } from "./google";

export async function runProviderConnectivityTest(slug: ProviderSlug): Promise<{
  ok: boolean;
  message: string;
  statusCode?: number;
}> {
  const provider = await getProviderBySlug(slug);

  if (!provider.enabled) {
    return {
      ok: false,
      message: "Provider is disabled in API Hub.",
      statusCode: 500,
    };
  }

  try {
    if (slug === PROVIDER_SLUGS.GOOGLE) {
      const key = await getProviderSecret(slug);
      if (!key) {
        return {
          ok: false,
          message: "Google API key is missing.",
          statusCode: 500,
        };
      }
      const { phone } = await fetchPhoneFromPlaceId("ChIJN1t_tDeuEmsRUsoyG83frY4", key);

      return {
        ok: true,
        message: `Google phone-only details call succeeded${phone ? ` (${phone})` : " (no phone found)"}.`,
        statusCode: 200,
      };
    }

    if (slug === PROVIDER_SLUGS.SOCRATA) {
      const endpoints = (provider.endpoints ?? {}) as Record<string, unknown>;
      const datasetId = typeof endpoints.dataset_id === "string" ? endpoints.dataset_id.trim() : "";
      if (!datasetId) {
        return {
          ok: false,
          message: "Missing dataset_id endpoint setting.",
          statusCode: 500,
        };
      }

      const appToken = await getProviderSecret(slug);
      const response = await providerRequest<Record<string, unknown>[]>({
        slug,
        endpointKey: `/resource/${datasetId}.json`,
        query: {
          $limit: 1,
        },
        headers: appToken
          ? {
              "X-App-Token": appToken,
            }
          : undefined,
      });

      return {
        ok: true,
        message: `Socrata reachable (${Array.isArray(response.data) ? response.data.length : 0} rows returned).`,
        statusCode: response.statusCode,
      };
    }

    if (slug === PROVIDER_SLUGS.RDAP) {
      const response = await providerRequest<Record<string, unknown>>({
        slug,
        endpointKey: "domain_lookup",
        pathParams: { domain: "ct.gov" },
      });

      return {
        ok: true,
        message: `RDAP test succeeded (${response.data.ldhName ?? "domain response"}).`,
        statusCode: response.statusCode,
      };
    }

    if (slug === PROVIDER_SLUGS.NOMINATIM) {
      const endpoints = (provider.endpoints ?? {}) as Record<string, unknown>;
      const userAgent = typeof endpoints.user_agent === "string" ? endpoints.user_agent : "CTLeadFinder/1.0";
      const response = await providerRequest<unknown[]>({
        slug,
        endpointKey: "search",
        query: {
          q: "Hartford, CT",
          format: "jsonv2",
          limit: 1,
        },
        headers: {
          "User-Agent": userAgent,
        },
      });

      return {
        ok: true,
        message: "Nominatim test succeeded.",
        statusCode: response.statusCode,
      };
    }

    if (slug === PROVIDER_SLUGS.GENERIC_ENRICH) {
      const token = await getProviderSecret(slug);
      const response = await providerRequest<Record<string, unknown>>({
        slug,
        endpointKey: "enrich_domain",
        pathParams: { domain: "ct.gov" },
        query: {
          domain: "ct.gov",
        },
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : undefined,
      });

      return {
        ok: true,
        message: "Generic enrichment endpoint reachable.",
        statusCode: response.statusCode,
      };
    }

    return { ok: false, message: "Unknown provider.", statusCode: 400 };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Provider test failed",
      statusCode: 502,
    };
  }
}

