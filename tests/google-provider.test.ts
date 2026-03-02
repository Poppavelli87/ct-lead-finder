import { vi } from "vitest";

const { dbMock, fetchMock } = vi.hoisted(() => ({
  dbMock: {
    provider: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    apiUsage: {
      create: vi.fn(),
    },
    monthlyUsage: {
      upsert: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
  fetchMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: dbMock,
}));

function defaultGoogleProvider() {
  return {
    id: "provider_google",
    slug: "google_places",
    enabled: true,
    baseUrl: "https://unused-base.example",
    endpoints: {
      place_phone_details: "https://places.googleapis.com/v1/places/{placeId}",
    },
    rateLimitPerSec: 10,
    timeoutMs: 10000,
    defaultCostPerCall: 0,
  };
}

describe("google provider phone fetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    dbMock.provider.findUnique.mockResolvedValue(defaultGoogleProvider());
    dbMock.provider.create.mockResolvedValue(defaultGoogleProvider());
    dbMock.provider.update.mockResolvedValue({});
    dbMock.apiUsage.create.mockResolvedValue({});
    dbMock.monthlyUsage.upsert.mockResolvedValue({});
    dbMock.monthlyUsage.findFirst.mockResolvedValue(null);
    dbMock.monthlyUsage.update.mockResolvedValue({});
    dbMock.monthlyUsage.create.mockResolvedValue({});

    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("calls Places API New with place URL and exact phone-only field mask", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ internationalPhoneNumber: "+1 860-321-0101" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { fetchPhoneFromPlaceId } = await import("@/lib/providers/google");
    const result = await fetchPhoneFromPlaceId("place_abc", "test_api_key");

    expect(result).toEqual({ phone: "+1 860-321-0101" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://places.googleapis.com/v1/places/place_abc");
    expect(init.method).toBe("GET");
    expect(init.headers).toMatchObject({
      "X-Goog-Api-Key": "test_api_key",
      "X-Goog-FieldMask": "nationalPhoneNumber,internationalPhoneNumber",
    });
    expect(url).not.toContain("fields=");
  });

  it("prefers internationalPhoneNumber over nationalPhoneNumber", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          internationalPhoneNumber: "+1 860-321-0102",
          nationalPhoneNumber: "(860) 321-0102",
        }),
        { status: 200 },
      ),
    );

    const { fetchPhoneFromPlaceId } = await import("@/lib/providers/google");
    const result = await fetchPhoneFromPlaceId("place_prefers_intl", "test_api_key");

    expect(result.phone).toBe("+1 860-321-0102");
  });

  it("falls back to nationalPhoneNumber when international is missing", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          nationalPhoneNumber: "(860) 321-0103",
        }),
        { status: 200 },
      ),
    );

    const { fetchPhoneFromPlaceId } = await import("@/lib/providers/google");
    const result = await fetchPhoneFromPlaceId("place_national_only", "test_api_key");

    expect(result.phone).toBe("(860) 321-0103");
  });

  it("returns null when no phone fields are present", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    const { fetchPhoneFromPlaceId } = await import("@/lib/providers/google");
    const result = await fetchPhoneFromPlaceId("place_no_phone", "test_api_key");

    expect(result.phone).toBeNull();
  });

  it("throws structured upstream error with status and body text when response is not ok", async () => {
    fetchMock.mockResolvedValue(new Response("upstream failure", { status: 502 }));

    const { fetchPhoneFromPlaceId } = await import("@/lib/providers/google");

    let thrown: unknown;
    try {
      await fetchPhoneFromPlaceId("place_bad", "test_api_key");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      code: "PROVIDER_REQUEST_FAILED",
      statusCode: 502,
      upstreamStatus: 502,
    });
    expect((thrown as Error).message).toContain("status 502");
    expect((thrown as Error).message).toContain("upstream failure");
  });

  it("throws PROVIDER_NOT_CONFIGURED when provider is missing", async () => {
    dbMock.provider.findUnique.mockReset();
    dbMock.provider.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    const { fetchPhoneFromPlaceId } = await import("@/lib/providers/google");

    await expect(fetchPhoneFromPlaceId("place_missing_provider", "test_api_key")).rejects.toMatchObject({
      code: "PROVIDER_NOT_CONFIGURED",
      provider: "google_places",
      statusCode: 500,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
