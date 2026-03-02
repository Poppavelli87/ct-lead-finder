import { getProviderBySlug, getProviderSecret, providerRequest } from "./request";
import { PROVIDER_SLUGS } from "./constants";

export type GenericEnrichResult = {
  ownerName?: string | null;
  socialLinks?: Record<string, string> | null;
  raw: unknown;
};

export async function enrichCompanyByDomain(domain: string): Promise<GenericEnrichResult | null> {
  const provider = await getProviderBySlug(PROVIDER_SLUGS.GENERIC_ENRICH);
  const token = await getProviderSecret(PROVIDER_SLUGS.GENERIC_ENRICH);

  if (!provider.enabled) {
    return null;
  }

  const response = await providerRequest<Record<string, unknown>>({
    slug: PROVIDER_SLUGS.GENERIC_ENRICH,
    endpointKey: "enrich_domain",
    pathParams: { domain },
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : undefined,
    query: {
      domain,
    },
  });

  const data = response.data ?? {};
  const socialLinksRaw = (data.social_links ?? data.socialLinks) as Record<string, unknown> | undefined;
  const socialLinks = socialLinksRaw
    ? Object.fromEntries(
        Object.entries(socialLinksRaw)
          .filter(([, value]) => typeof value === "string" && Boolean(value.trim()))
          .map(([key, value]) => [key, String(value)]),
      )
    : null;

  return {
    ownerName:
      typeof data.owner_name === "string"
        ? data.owner_name
        : typeof data.ownerName === "string"
          ? data.ownerName
          : null,
    socialLinks,
    raw: data,
  };
}

