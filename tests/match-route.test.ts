import { vi } from "vitest";

const {
  getSessionUserMock,
  getProviderBySlugMock,
  getProviderSecretMock,
  searchPlaceCandidatesNewMock,
  dbMock,
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  getProviderBySlugMock: vi.fn(),
  getProviderSecretMock: vi.fn(),
  searchPlaceCandidatesNewMock: vi.fn(),
  dbMock: {
    lead: {
      findMany: vi.fn(),
      update: vi.fn(),
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
  searchPlaceCandidatesNew: searchPlaceCandidatesNewMock,
}));

import { POST } from "@/app/api/leads/match-google/route";

function makeRequest(payload: unknown): Request {
  return new Request("http://localhost/api/leads/match-google", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

describe("POST /api/leads/match-google", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getSessionUserMock.mockResolvedValue({ id: "user_1", username: "admin" });
    getProviderBySlugMock.mockResolvedValue({
      enabled: true,
      endpoints: {
        text_search_new: "https://places.googleapis.com/v1/places:searchText",
      },
    });
    getProviderSecretMock.mockResolvedValue("google_key");

    dbMock.lead.update.mockResolvedValue({});
  });

  it("scores candidates and sets MATCHED using the highest-confidence candidate", async () => {
    dbMock.lead.findMany.mockResolvedValue([
      {
        id: "lead_1",
        name: "Acme Roofing",
        address1: "12 Main St",
        city: "Hartford",
        externalId: null,
        phone: null,
      },
    ]);

    searchPlaceCandidatesNewMock.mockResolvedValue([
      {
        placeId: "place_low",
        formattedAddress: "99 Other Rd, Boston, MA 02110",
        displayName: "Acme Roofing Boston",
        city: "Boston",
        state: "MA",
      },
      {
        placeId: "place_best",
        formattedAddress: "12 Main St, Hartford, CT 06103",
        displayName: "Acme Roofing",
        city: "Hartford",
        state: "CT",
      },
    ]);

    const response = await POST(makeRequest({ ids: ["lead_1"], limits: { maxLeads: 500, rateLimitRps: 10 } }) as any);
    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      attempted: 1,
      matched: 1,
      no_match: 0,
      failed: 0,
      googleCallsUsed: 1,
      stoppedEarly: false,
    });
    expect(dbMock.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lead_1" },
        data: expect.objectContaining({
          externalId: "place_best",
          matchStatus: "MATCHED",
        }),
      }),
    );
    expect(body.results[0]).toMatchObject({
      id: "lead_1",
      status: "matched",
    });
  });

  it("enforces maxGoogleCalls and stops early", async () => {
    dbMock.lead.findMany.mockResolvedValue([
      {
        id: "lead_1",
        name: "First Biz",
        address1: "1 Main St",
        city: "Hartford",
        externalId: null,
        phone: null,
      },
      {
        id: "lead_2",
        name: "Second Biz",
        address1: "2 Main St",
        city: "Hartford",
        externalId: null,
        phone: null,
      },
    ]);

    searchPlaceCandidatesNewMock.mockResolvedValue([]);

    const response = await POST(
      makeRequest({
        ids: ["lead_1", "lead_2"],
        limits: { maxLeads: 500, maxGoogleCalls: 1, rateLimitRps: 10 },
      }) as any,
    );
    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      attempted: 1,
      matched: 0,
      no_match: 1,
      failed: 0,
      googleCallsUsed: 1,
      stoppedEarly: true,
      stopReason: "maxGoogleCalls_reached_1",
    });
    expect(searchPlaceCandidatesNewMock).toHaveBeenCalledTimes(1);
    expect(dbMock.lead.update).toHaveBeenCalledTimes(1);
    expect(dbMock.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lead_1" },
        data: expect.objectContaining({
          matchStatus: "NO_MATCH",
        }),
      }),
    );
  });
});
