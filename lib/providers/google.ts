import { dedupeAndSaveLead } from "../dedupe";
import { isMockGoogleEnabled } from "../env";
import { computePreQualScore } from "../scoring";
import { domainFromWebsite } from "../utils";
import { progressiveCountyOrder } from "../ct-counties";
import { getProviderBySlug, getProviderSecret, providerRequest } from "./request";
import { PROVIDER_SLUGS } from "./constants";
import { nominatimGeocode } from "./nominatim";

type LeadRecord = Record<string, any>;

type GoogleTextSearchResult = {
  place_id: string;
  name: string;
  formatted_address?: string;
  business_status?: string;
};

type GoogleTextSearchResponse = {
  results: GoogleTextSearchResult[];
  status: string;
};

type GoogleDetailsResponse = {
  result?: {
    name?: string;
    formatted_address?: string;
    formatted_phone_number?: string;
    website?: string;
    address_components?: Array<{ long_name: string; short_name: string; types: string[] }>;
    url?: string;
  };
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

function deterministicNumber(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function buildMockGoogleResults(query: string, count: number): GoogleTextSearchResponse {
  const safeCount = Math.max(5, Math.min(30, count));
  const results = Array.from({ length: safeCount }).map((_, idx) => {
    const seed = deterministicNumber(`${query}-${idx}`);
    const streetNo = 100 + (seed % 900);
    const cityList = ["Hartford", "New Haven", "Stamford", "Norwalk", "Bridgeport", "Waterbury"];
    const city = cityList[seed % cityList.length];
    return {
      place_id: `mock_${seed}`,
      name: `${query.split(" in ")[0]} ${idx + 1}`,
      formatted_address: `${streetNo} Main St, ${city}, CT ${(6000 + (seed % 999)).toString().padStart(5, "0")}`,
      business_status: "OPERATIONAL",
    };
  });

  return {
    status: "OK",
    results,
  };
}

function buildMockDetails(placeId: string): GoogleDetailsResponse {
  const seed = deterministicNumber(placeId);
  const phone = `(203) ${String(200 + (seed % 700)).padStart(3, "0")}-${String(1000 + (seed % 9000)).padStart(4, "0")}`;
  const domain = `business-${seed % 1000}.example.com`;

  return {
    result: {
      formatted_phone_number: phone,
      website: `https://${domain}`,
    },
  };
}

async function resolveGoogleMode() {
  const provider = await getProviderBySlug(PROVIDER_SLUGS.GOOGLE);
  const key = await getProviderSecret(PROVIDER_SLUGS.GOOGLE);
  const forcedMock = isMockGoogleEnabled();
  const usable = provider.enabled && Boolean(key) && !forcedMock;

  return {
    provider,
    key,
    isMock: !usable,
  };
}

async function googleTextSearch(query: string, jobId?: string, leadId?: string, targetCount = 20) {
  const mode = await resolveGoogleMode();

  if (mode.isMock) {
    return providerRequest<GoogleTextSearchResponse>({
      slug: PROVIDER_SLUGS.GOOGLE,
      endpointKey: "text_search",
      forceMock: true,
      mockResponse: buildMockGoogleResults(query, targetCount),
      query: { query },
      jobId,
      leadId,
    });
  }

  return providerRequest<GoogleTextSearchResponse>({
    slug: PROVIDER_SLUGS.GOOGLE,
    endpointKey: "text_search",
    query: {
      query,
      key: mode.key ?? "",
    },
    jobId,
    leadId,
  });
}

async function googlePlaceDetails(placeId: string, jobId?: string, leadId?: string) {
  const mode = await resolveGoogleMode();

  if (mode.isMock) {
    return providerRequest<GoogleDetailsResponse>({
      slug: PROVIDER_SLUGS.GOOGLE,
      endpointKey: "place_details",
      forceMock: true,
      query: { place_id: placeId },
      mockResponse: buildMockDetails(placeId),
      jobId,
      leadId,
    });
  }

  return providerRequest<GoogleDetailsResponse>({
    slug: PROVIDER_SLUGS.GOOGLE,
    endpointKey: "place_details",
    query: {
      place_id: placeId,
      fields: "name,formatted_address,formatted_phone_number,website,address_component,url",
      key: mode.key ?? "",
    },
    jobId,
    leadId,
  });
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
  searchedLocations: string[];
}> {
  const mode = await resolveGoogleMode();
  const target = Math.max(1, input.targetCount || 100);
  const locationSeed = input.zip || input.city || input.county || "Connecticut";

  const locations = input.progressive && input.county
    ? progressiveCountyOrder(input.county).map((county) => `${county} County, Connecticut`)
    : [`${locationSeed}, Connecticut`];

  const saved: LeadRecord[] = [];
  let skippedForLowPrequal = 0;

  for (const location of locations) {
    if (saved.length >= target) break;
    let locationText = location;
    if (mode.isMock) {
      const geocoded = await nominatimGeocode(location);
      if (geocoded?.displayName) {
        locationText = geocoded.displayName;
      }
    }
    const query = `${input.businessType} in ${locationText}`;
    const textSearch = await googleTextSearch(query, undefined, undefined, Math.min(20, target));

    for (const candidate of textSearch.data.results ?? []) {
      if (saved.length >= target) break;

      const preQual = computePreQualScore({
        name: candidate.name,
        formatted_address: candidate.formatted_address,
        business_status: candidate.business_status,
      });

      if (preQual < 65) {
        skippedForLowPrequal += 1;
        continue;
      }

      const details = await googlePlaceDetails(candidate.place_id);
      const detail = details.data.result ?? {};
      const address = splitAddress(detail.formatted_address ?? candidate.formatted_address ?? undefined);

      const lead = await dedupeAndSaveLead({
        source: "GOOGLE",
        externalId: candidate.place_id,
        name: detail.name || candidate.name,
        phone: detail.formatted_phone_number,
        website: detail.website,
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
    searchedLocations: locations,
  };
}

export async function enrichLeadWithGoogle(lead: LeadRecord, jobId?: string): Promise<LeadRecord> {
  const locationText = [lead.city, lead.state, lead.zip].filter(Boolean).join(" ");
  const query = `${lead.name} ${locationText}`.trim();

  const text = await googleTextSearch(query, jobId, lead.id, 10);
  const candidate = text.data.results?.[0];
  if (!candidate) {
    return lead;
  }

  const preQual = computePreQualScore({
    name: candidate.name,
    formatted_address: candidate.formatted_address,
    business_status: candidate.business_status,
  });

  if (preQual < 65) {
    return lead;
  }

  const details = await googlePlaceDetails(candidate.place_id, jobId, lead.id);
  const detail = details.data.result ?? {};
  const addr = splitAddress(detail.formatted_address ?? candidate.formatted_address ?? undefined);

  return dedupeAndSaveLead({
    source: lead.source,
    externalId: lead.externalId ?? candidate.place_id,
    name: detail.name || lead.name,
    industryType: lead.industryType,
    phone: detail.formatted_phone_number || lead.phone,
    email: lead.email,
    website: detail.website || lead.website,
    ownerName: lead.ownerName,
    socialLinks: lead.socialLinks,
    address1: addr.address1 || lead.address1,
    city: addr.city || lead.city,
    county: lead.county,
    state: addr.state || lead.state || "CT",
    zip: addr.zip || lead.zip,
    notes: lead.notes,
    preQualScore: preQual,
  });
}

export async function googleResolverFromName(name: string, city?: string | null, county?: string | null, jobId?: string) {
  const query = `${name} ${city ?? ""} CT`.trim();
  const text = await googleTextSearch(query, jobId, undefined, 5);
  const candidate = text.data.results?.[0];
  if (!candidate) return null;

  const preQual = computePreQualScore({
    name: candidate.name,
    formatted_address: candidate.formatted_address,
    business_status: candidate.business_status,
  });

  if (preQual < 65) {
    return null;
  }

  const details = await googlePlaceDetails(candidate.place_id, jobId);
  const detail = details.data.result ?? {};
  const addr = splitAddress(detail.formatted_address ?? candidate.formatted_address ?? undefined);

  return dedupeAndSaveLead({
    source: "UPLOAD",
    externalId: candidate.place_id,
    name: detail.name || candidate.name,
    phone: detail.formatted_phone_number,
    website: detail.website,
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

