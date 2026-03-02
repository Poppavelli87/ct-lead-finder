import { Lead } from "@prisma/client";
import { db } from "../db";
import { dedupeAndSaveLead } from "../dedupe";
import { isMasterDuplicate } from "../master-dedupe";
import { computeQualificationScore, isQualifiedLead } from "../qualification";
import { computePreQualScore } from "../scoring";
import { progressiveCountyOrder } from "../ct-counties";
import { RequestRateLimiter } from "../request-rate-limiter";
import { domainFromWebsite } from "../utils";
import { PROVIDER_SLUGS } from "./constants";
import { getProviderBySlug, getProviderSecret, ProviderRequestError, providerRequest } from "./request";

type LeadRecord = Record<string, any>;

type GooglePlacePhoneResponse = {
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
};

type GooglePlaceProfileResponse = {
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
};

type GoogleTextSearchNewResponse = {
  places?: Array<{
    id?: string;
    name?: string;
    formattedAddress?: string;
    displayName?: { text?: string };
  }>;
};

export type GooglePlaceCandidate = {
  placeId: string;
  formattedAddress: string | null;
  displayName: string | null;
  city: string | null;
  state: string | null;
};

export type PhoneEnrichmentResult = {
  status: "updated" | "skipped" | "failed";
  reason?: string;
  phone?: string | null;
  lead?: LeadRecord;
};

type GoogleRequestOptions = {
  limiter?: RequestRateLimiter;
  leadId?: string;
  jobId?: string;
};

type GooglePlaceProfile = {
  name: string | null;
  formattedAddress: string | null;
  phone: string | null;
  website: string | null;
};

function splitAddress(address?: string): { address1: string | null; city: string | null; state: string | null; zip: string | null } {
  if (!address) {
    return { address1: null, city: null, state: null, zip: null };
  }

  const parts = address.split(",").map((part) => part.trim());
  const address1 = parts[0] || null;
  const city = parts[1] || null;
  const stateZip = parts[2] || "";
  const [state, zip] = stateZip.split(" ").filter(Boolean);

  return {
    address1,
    city,
    state: state || "CT",
    zip: zip || null,
  };
}

function truncateError(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 2000);
}

function resolvePlaceIdFromLead(lead: LeadRecord): string | null {
  const candidate = lead.externalId ?? lead.place_id ?? lead.placeId ?? null;
  if (!candidate) return null;
  const text = String(candidate).trim();
  return text || null;
}

function parseCityStateFromFormattedAddress(formattedAddress?: string | null): { city: string | null; state: string | null } {
  if (!formattedAddress) return { city: null, state: null };
  const parts = formattedAddress
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const city = parts.length >= 2 ? parts[parts.length - 2] : null;
  const stateZip = parts.length >= 1 ? parts[parts.length - 1] : "";
  const stateMatch = stateZip.match(/\b([A-Z]{2})\b/);
  const state = stateMatch ? stateMatch[1] : null;

  return { city, state };
}

function extractPlaceId(place: { id?: string; name?: string }): string | null {
  const direct = String(place.id ?? "").trim();
  if (direct) return direct;
  const resource = String(place.name ?? "").trim();
  if (!resource) return null;
  const last = resource.split("/").filter(Boolean).pop() ?? "";
  return last || null;
}

async function requireGoogleConfig(): Promise<{ key: string; provider: any }> {
  const provider = await getProviderBySlug(PROVIDER_SLUGS.GOOGLE);
  if (!provider.enabled) {
    throw new ProviderRequestError({
      code: "PROVIDER_NOT_CONFIGURED",
      provider: PROVIDER_SLUGS.GOOGLE,
      statusCode: 500,
      message: "Google Places provider is not configured in API Hub.",
    });
  }

  const key = (await getProviderSecret(PROVIDER_SLUGS.GOOGLE))?.trim();
  if (!key) {
    throw new ProviderRequestError({
      code: "PROVIDER_NOT_CONFIGURED",
      provider: PROVIDER_SLUGS.GOOGLE,
      statusCode: 500,
      message: "Google Places provider is not configured in API Hub.",
    });
  }

  return { key, provider };
}

async function fetchPlaceProfileFromPlaceId(
  placeId: string,
  apiKey: string,
  options?: GoogleRequestOptions,
): Promise<GooglePlaceProfile> {
  const cleanPlaceId = String(placeId ?? "").trim();
  if (!cleanPlaceId) {
    throw new Error("Missing placeId for place profile lookup.");
  }

  const cleanApiKey = String(apiKey ?? "").trim();
  if (!cleanApiKey) {
    throw new Error("Missing Google API key.");
  }

  if (options?.limiter) {
    await options.limiter.wait();
  }

  const response = await providerRequest<GooglePlaceProfileResponse>({
    slug: PROVIDER_SLUGS.GOOGLE,
    endpointKey: "place_phone_details",
    pathParams: { placeId: cleanPlaceId },
    headers: {
      "X-Goog-Api-Key": cleanApiKey,
      "X-Goog-FieldMask": "displayName,formattedAddress,nationalPhoneNumber,internationalPhoneNumber,websiteUri",
    },
    leadId: options?.leadId,
    jobId: options?.jobId,
  });

  const data = response.data ?? {};
  const phone = data.internationalPhoneNumber ?? data.nationalPhoneNumber ?? null;
  return {
    name: data.displayName?.text ?? null,
    formattedAddress: data.formattedAddress ?? null,
    phone,
    website: data.websiteUri ?? null,
  };
}

export async function searchPlaceCandidatesNew(args: {
  query: string;
  apiKey: string;
  pageSize?: number;
  limiter?: RequestRateLimiter;
  leadId?: string;
  jobId?: string;
}): Promise<GooglePlaceCandidate[]> {
  const query = String(args.query ?? "").trim();
  if (!query) return [];

  const apiKey = String(args.apiKey ?? "").trim();
  if (!apiKey) {
    throw new ProviderRequestError({
      code: "PROVIDER_NOT_CONFIGURED",
      provider: PROVIDER_SLUGS.GOOGLE,
      statusCode: 500,
      message: "Google Places provider is not configured in API Hub.",
    });
  }

  if (args.limiter) {
    await args.limiter.wait();
  }

  const response = await providerRequest<GoogleTextSearchNewResponse>({
    slug: PROVIDER_SLUGS.GOOGLE,
    endpointKey: "text_search_new",
    method: "POST",
    body: {
      textQuery: query,
      pageSize: Math.max(1, Math.min(5, Math.floor(args.pageSize ?? 5))),
      languageCode: "en",
    },
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.id,places.name,places.displayName,places.formattedAddress",
    },
    leadId: args.leadId,
    jobId: args.jobId,
  });

  return (response.data.places ?? [])
    .map((place) => {
      const placeId = extractPlaceId(place);
      if (!placeId) return null;
      const formattedAddress = place.formattedAddress ?? null;
      const parsed = parseCityStateFromFormattedAddress(formattedAddress);

      return {
        placeId,
        formattedAddress,
        displayName: place.displayName?.text ?? null,
        city: parsed.city,
        state: parsed.state,
      } satisfies GooglePlaceCandidate;
    })
    .filter((item): item is GooglePlaceCandidate => Boolean(item));
}

export async function fetchPhoneFromPlaceId(
  placeId: string,
  apiKey: string,
  options?: GoogleRequestOptions,
): Promise<{ phone: string | null }> {
  const cleanPlaceId = String(placeId ?? "").trim();
  if (!cleanPlaceId) {
    throw new Error("Missing placeId for phone lookup.");
  }

  const cleanApiKey = String(apiKey ?? "").trim();
  if (!cleanApiKey) {
    throw new Error("Missing Google API key.");
  }

  if (options?.limiter) {
    await options.limiter.wait();
  }

  const response = await providerRequest<GooglePlacePhoneResponse>({
    slug: PROVIDER_SLUGS.GOOGLE,
    endpointKey: "place_phone_details",
    pathParams: { placeId: cleanPlaceId },
    headers: {
      "X-Goog-Api-Key": cleanApiKey,
      "X-Goog-FieldMask": "nationalPhoneNumber,internationalPhoneNumber",
    },
    leadId: options?.leadId,
    jobId: options?.jobId,
  });

  const data = response.data ?? {};
  const phone = data.internationalPhoneNumber ?? data.nationalPhoneNumber ?? null;
  return { phone };
}

export type GoogleSearchInput = {
  businessType: string;
  county?: string;
  city?: string;
  zip?: string;
  progressive: boolean;
  targetCount: number;
};

export async function runGoogleProgressiveSearch(input: GoogleSearchInput): Promise<{
  saved: LeadRecord[];
  skippedForLowPrequal: number;
  skippedForMasterDedupe: number;
  searchedLocations: string[];
}> {
  const config = await requireGoogleConfig();
  const target = Math.max(1, input.targetCount || 100);
  const locationSeed = input.zip || input.city || input.county || "Connecticut";

  const locations = input.progressive && input.county
    ? progressiveCountyOrder(input.county).map((county) => `${county} County, Connecticut`)
    : [`${locationSeed}, Connecticut`];

  const saved: LeadRecord[] = [];
  let skippedForLowPrequal = 0;
  let skippedForMasterDedupe = 0;

  for (const location of locations) {
    if (saved.length >= target) break;
    const query = `${input.businessType} in ${location}`;
    const candidates = await searchPlaceCandidatesNew({
      query,
      apiKey: config.key,
      pageSize: Math.min(5, Math.max(1, target - saved.length)),
    });

    for (const candidate of candidates) {
      if (saved.length >= target) break;

      const profile = await fetchPlaceProfileFromPlaceId(candidate.placeId, config.key);
      const name = profile.name || candidate.displayName || input.businessType;
      const formattedAddress = profile.formattedAddress || candidate.formattedAddress;

      const preQual = computePreQualScore({
        name,
        formatted_address: formattedAddress,
        phone: profile.phone,
        website: profile.website,
        business_status: "OPERATIONAL",
      });

      if (preQual < 65) {
        skippedForLowPrequal += 1;
        continue;
      }

      const existsInMaster = await isMasterDuplicate({
        name,
      });

      if (existsInMaster) {
        skippedForMasterDedupe += 1;
        continue;
      }

      const address = splitAddress(formattedAddress ?? undefined);

      const lead = await dedupeAndSaveLead({
        source: "GOOGLE",
        externalId: candidate.placeId,
        name,
        phone: profile.phone,
        website: profile.website,
        address1: address.address1,
        city: address.city,
        state: address.state ?? "CT",
        zip: address.zip,
        county: input.county,
        industryType: input.businessType,
        preQualScore: preQual,
      });

      saved.push(lead);
    }
  }

  return {
    saved,
    skippedForLowPrequal,
    skippedForMasterDedupe,
    searchedLocations: locations,
  };
}

export async function enrichLeadPhoneOnlyWithGoogle(
  lead: Lead | LeadRecord,
  options?: { apiKey?: string | null; providerEnabled?: boolean; limiter?: RequestRateLimiter },
): Promise<PhoneEnrichmentResult> {
  if ((lead.phone ?? "").trim()) {
    return { status: "skipped", reason: "already_has_phone", lead };
  }

  const placeId = resolvePlaceIdFromLead(lead);
  if (!placeId) {
    if (lead.id) {
      await db.lead.update({
        where: { id: lead.id },
        data: {
          phoneStatus: "FAILED",
          phoneAttemptedAt: new Date(),
          phoneError: "missing_place_id",
        },
      });
    }
    return { status: "skipped", reason: "missing_place_id", lead };
  }

  const providerEnabled =
    typeof options?.providerEnabled === "boolean"
      ? options.providerEnabled
      : Boolean((await getProviderBySlug(PROVIDER_SLUGS.GOOGLE)).enabled);

  if (!providerEnabled) {
    throw new ProviderRequestError({
      code: "PROVIDER_NOT_CONFIGURED",
      provider: PROVIDER_SLUGS.GOOGLE,
      statusCode: 500,
      message: "Google Places provider is not configured in API Hub.",
    });
  }

  const apiKey = options?.apiKey?.trim() || (await getProviderSecret(PROVIDER_SLUGS.GOOGLE))?.trim();
  if (!apiKey) {
    throw new ProviderRequestError({
      code: "PROVIDER_NOT_CONFIGURED",
      provider: PROVIDER_SLUGS.GOOGLE,
      statusCode: 500,
      message: "Google Places provider is not configured in API Hub.",
    });
  }

  try {
    const { phone } = await fetchPhoneFromPlaceId(placeId, apiKey, {
      limiter: options?.limiter,
      leadId: lead.id,
    });

    if (!phone) {
      if (lead.id) {
        await db.lead.update({
          where: { id: lead.id },
          data: {
            phoneStatus: "NO_PHONE",
            phoneAttemptedAt: new Date(),
            phoneError: null,
          },
        });
      }

      return { status: "skipped", reason: "phone_not_found", phone: null, lead };
    }

    const nextLead = {
      ...lead,
      phone,
    };

    const updatedLead = await db.lead.update({
      where: { id: lead.id },
      data: {
        phone,
        phoneStatus: "FOUND",
        phoneAttemptedAt: new Date(),
        phoneError: null,
        qualificationScore: computeQualificationScore(nextLead),
        qualified: isQualifiedLead(nextLead),
        lastEnrichedAt: new Date(),
      },
    });

    return {
      status: "updated",
      phone,
      lead: updatedLead,
    };
  } catch (error) {
    if (lead.id) {
      await db.lead.update({
        where: { id: lead.id },
        data: {
          phoneStatus: "FAILED",
          phoneAttemptedAt: new Date(),
          phoneError: truncateError(error instanceof Error ? error.message : "google_request_failed"),
        },
      });
    }

    if (error instanceof ProviderRequestError && error.upstreamStatus === 429) {
      return { status: "failed", reason: "rate_limited", lead };
    }
    if (error instanceof ProviderRequestError && error.code === "PROVIDER_NOT_CONFIGURED") {
      return { status: "failed", reason: "provider_not_configured", lead };
    }
    return { status: "failed", reason: "google_request_failed", lead };
  }
}

export async function enrichLeadWithGoogle(lead: LeadRecord, _jobId?: string): Promise<LeadRecord> {
  void _jobId;
  const outcome = await enrichLeadPhoneOnlyWithGoogle(lead);
  if (outcome.status === "updated" && outcome.lead) {
    return outcome.lead;
  }
  return lead;
}

export async function googleResolverFromName(name: string, city?: string | null, county?: string | null, jobId?: string) {
  const existsInMaster = await isMasterDuplicate({ name });
  if (existsInMaster) {
    return null;
  }

  const query = `${name} ${city ?? ""} CT`.trim();
  const config = await requireGoogleConfig();
  const candidates = await searchPlaceCandidatesNew({
    query,
    apiKey: config.key,
    pageSize: 5,
    jobId,
  });
  const candidate = candidates[0];
  if (!candidate) return null;

  const profile = await fetchPlaceProfileFromPlaceId(candidate.placeId, config.key, { jobId });
  const resolvedName = profile.name || candidate.displayName || name;
  const formattedAddress = profile.formattedAddress || candidate.formattedAddress;

  const preQual = computePreQualScore({
    name: resolvedName,
    formatted_address: formattedAddress,
    phone: profile.phone,
    website: profile.website,
    business_status: "OPERATIONAL",
  });

  if (preQual < 65) {
    return null;
  }

  const addr = splitAddress(formattedAddress ?? undefined);

  return dedupeAndSaveLead({
    source: "UPLOAD",
    externalId: candidate.placeId,
    name: resolvedName,
    phone: profile.phone,
    website: profile.website,
    address1: addr.address1,
    city: addr.city || city,
    county: county ?? undefined,
    state: addr.state || "CT",
    zip: addr.zip,
    preQualScore: preQual,
  });
}

export function inferDomain(lead: LeadRecord): string | null {
  return lead.domain || domainFromWebsite(lead.website);
}
