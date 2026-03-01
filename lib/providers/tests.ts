import { ProviderSlug, PROVIDER_SLUGS } from "./constants";
import { providerRequest } from "./request";
import { getProviderBySlug, getProviderSecret } from "./request";

export async function runProviderConnectivityTest(slug: ProviderSlug): Promise<{
  ok: boolean;
  message: string;
  isMock: boolean;
  statusCode?: number;
}> {
  const provider = await getProviderBySlug(slug);

  if (!provider.enabled) {
    return {
      ok: false,
      message: "Provider is disabled in API Hub.",
      isMock: true,
    };
  }

  try {
    if (slug === PROVIDER_SLUGS.GOOGLE) {
      const key = await getProviderSecret(slug);
      const response = await providerRequest<{ status?: string }>({
        slug,
        endpointKey: "text_search",
        query: {
          query: "coffee in Hartford, Connecticut",
          key: key ?? "",
        },
      });

      return {
        ok: true,
        message: `Google test call succeeded (${response.data.status ?? "OK"}).`,
        isMock: response.isMock,
        statusCode: response.statusCode,
      };
    }

    if (slug === PROVIDER_SLUGS.SOCRATA) {
      const endpoints = (provider.endpoints ?? {}) as Record<string, unknown>;
      const datasetId = typeof endpoints.dataset_id === "string" ? endpoints.dataset_id.trim() : "";
      if (!datasetId) {
        return {
          ok: false,
          message: "Missing dataset_id endpoint setting.",
          isMock: true,
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
        message: `Socrata reachable (${Array.isArray(response.data) ? response.data.length : 0} row sample).`,
        isMock: response.isMock,
        statusCode: response.statusCode,
      };
    }

    if (slug === PROVIDER_SLUGS.RDAP) {
      const response = await providerRequest<Record<string, unknown>>({
        slug,
        endpointKey: "domain_lookup",
        pathParams: { domain: "example.com" },
      });

      return {
        ok: true,
        message: `RDAP test succeeded (${response.data.ldhName ?? "domain response"}).`,
        isMock: response.isMock,
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
        isMock: response.isMock,
        statusCode: response.statusCode,
      };
    }

    if (slug === PROVIDER_SLUGS.GENERIC_ENRICH) {
      const token = await getProviderSecret(slug);
      const response = await providerRequest<Record<string, unknown>>({
        slug,
        endpointKey: "enrich_domain",
        pathParams: { domain: "example.com" },
        query: {
          domain: "example.com",
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
        isMock: response.isMock,
        statusCode: response.statusCode,
      };
    }

    return { ok: false, message: "Unknown provider.", isMock: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Provider test failed",
      isMock: false,
    };
  }
}

