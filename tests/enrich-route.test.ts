import { vi } from "vitest";

const {
  getSessionUserMock,
  getProviderBySlugMock,
  getProviderSecretMock,
  fetchPhoneFromPlaceIdMock,
  dbMock,
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  getProviderBySlugMock: vi.fn(),
  getProviderSecretMock: vi.fn(),
  fetchPhoneFromPlaceIdMock: vi.fn(),
  dbMock: {
    lead: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    masterRecord: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  getSessionUser: getSessionUserMock,
}));

vi.mock("@/lib/db", () => ({
  db: dbMock,
}));

vi.mock("@/lib/providers/request", () => ({
  getProviderBySlug: getProviderBySlugMock,
  getProviderSecret: getProviderSecretMock,
  ProviderRequestError: class ProviderRequestError extends Error {
    code: string;
    provider?: string;
    statusCode: number;
    upstreamStatus?: number;

    constructor(args: { code: string; message: string; provider?: string; statusCode: number; upstreamStatus?: number }) {
      super(args.message);
      this.code = args.code;
      this.provider = args.provider;
      this.statusCode = args.statusCode;
      this.upstreamStatus = args.upstreamStatus;
    }
  },
}));

vi.mock("@/lib/providers/google", () => ({
  fetchPhoneFromPlaceId: fetchPhoneFromPlaceIdMock,
}));

import { POST } from "@/app/api/leads/enrich/route";

function makeRequest(payload: unknown): Request {
  return new Request("http://localhost/api/leads/enrich", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

describe("POST /api/leads/enrich", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getSessionUserMock.mockResolvedValue({ id: "user_1", username: "admin" });
    getProviderBySlugMock.mockResolvedValue({
      enabled: true,
      endpoints: {
        place_phone_details: "https://places.googleapis.com/v1/places/{placeId}",
      },
    });
    getProviderSecretMock.mockResolvedValue("google_key");

    dbMock.lead.findFirst.mockResolvedValue(null);
    dbMock.lead.findUnique.mockResolvedValue(null);
    dbMock.lead.update.mockResolvedValue({});
    dbMock.masterRecord.findFirst.mockResolvedValue(null);
  });

  it("returns expected counts for updated, missing_place_id, and already_has_phone", async () => {
    dbMock.lead.findMany.mockResolvedValue([
      {
        id: "lead_1",
        externalId: "place_1",
        phone: null,
        phoneStatus: null,
        domain: null,
        website: null,
        city: "Hartford",
      },
      {
        id: "lead_2",
        externalId: null,
        phone: null,
        phoneStatus: null,
        domain: null,
        website: null,
        city: "Hartford",
      },
      {
        id: "lead_3",
        externalId: "place_3",
        phone: "(860) 321-0003",
        phoneStatus: null,
        domain: null,
        website: null,
        city: "Hartford",
      },
    ]);

    fetchPhoneFromPlaceIdMock.mockResolvedValue({ phone: "+1 860-321-0001" });

    const response = await POST(makeRequest({ ids: ["lead_1", "lead_2", "lead_3"], mode: "PHONE_ONLY" }) as any);
    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      attempted: 1,
      updated: 1,
      no_phone: 0,
      skipped: 2,
      failed: 0,
      googleCallsUsed: 1,
      stoppedEarly: false,
    });
    expect(fetchPhoneFromPlaceIdMock).toHaveBeenCalledTimes(1);
    expect(fetchPhoneFromPlaceIdMock).toHaveBeenCalledWith(
      "place_1",
      "google_key",
      expect.objectContaining({ leadId: "lead_1" }),
    );
    expect(body.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "lead_2", status: "skipped", reason: "missing_place_id" }),
        expect.objectContaining({ id: "lead_3", status: "skipped", reason: "already_has_phone" }),
      ]),
    );
  });

  it("enforces limits.maxLeads and stops early", async () => {
    dbMock.lead.findMany.mockResolvedValue([
      {
        id: "lead_1",
        externalId: "place_1",
        phone: null,
        phoneStatus: null,
        domain: null,
        website: null,
        city: "Hartford",
      },
      {
        id: "lead_2",
        externalId: "place_2",
        phone: null,
        phoneStatus: null,
        domain: null,
        website: null,
        city: "Hartford",
      },
    ]);

    fetchPhoneFromPlaceIdMock.mockResolvedValue({ phone: "+1 860-321-1001" });

    const response = await POST(
      makeRequest({
        ids: ["lead_1", "lead_2"],
        mode: "PHONE_ONLY",
        limits: { maxLeads: 1, maxGoogleCalls: 100, rateLimitRps: 10 },
      }) as any,
    );
    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      attempted: 1,
      updated: 1,
      no_phone: 0,
      skipped: 1,
      failed: 0,
      googleCallsUsed: 1,
      stoppedEarly: true,
      stopReason: "maxLeads_reached_1",
    });
    expect(fetchPhoneFromPlaceIdMock).toHaveBeenCalledTimes(1);
    expect(body.results).toContainEqual(
      expect.objectContaining({ id: "lead_2", status: "skipped", reason: "maxLeads_reached_1" }),
    );
  });

  it("enforces limits.maxGoogleCalls and stops before additional Google calls", async () => {
    dbMock.lead.findMany.mockResolvedValue([
      {
        id: "lead_1",
        externalId: "place_1",
        phone: null,
        phoneStatus: null,
        domain: null,
        website: null,
        city: "Hartford",
      },
      {
        id: "lead_2",
        externalId: "place_2",
        phone: null,
        phoneStatus: null,
        domain: null,
        website: null,
        city: "Hartford",
      },
    ]);

    fetchPhoneFromPlaceIdMock.mockResolvedValue({ phone: null });

    const response = await POST(
      makeRequest({
        ids: ["lead_1", "lead_2"],
        mode: "PHONE_ONLY",
        limits: { maxLeads: 500, maxGoogleCalls: 1, rateLimitRps: 10 },
      }) as any,
    );
    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      attempted: 2,
      updated: 0,
      no_phone: 1,
      skipped: 1,
      failed: 0,
      googleCallsUsed: 1,
      stoppedEarly: true,
      stopReason: "maxGoogleCalls_reached_1",
    });
    expect(fetchPhoneFromPlaceIdMock).toHaveBeenCalledTimes(1);
    expect(body.results).toContainEqual(
      expect.objectContaining({ id: "lead_2", status: "skipped", reason: "maxGoogleCalls_reached_1" }),
    );
  });
});
