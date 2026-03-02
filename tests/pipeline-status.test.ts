import { derivePipelineStatus } from "@/lib/pipeline-status";

describe("pipeline-status", () => {
  it("returns NEEDS_MATCH when place_id missing and phone missing for CT_REGISTRY/UPLOAD", () => {
    expect(
      derivePipelineStatus({
        source: "CT_REGISTRY",
        externalId: null,
        phone: null,
        matchStatus: null,
        phoneStatus: null,
      }),
    ).toBe("NEEDS_MATCH");
  });

  it("returns MATCHED when place_id exists and phone missing", () => {
    expect(
      derivePipelineStatus({
        source: "CT_REGISTRY",
        externalId: "place_123",
        phone: null,
        matchStatus: "MATCHED",
        phoneStatus: null,
      }),
    ).toBe("MATCHED");
  });

  it("returns PHONE_FOUND when phone exists", () => {
    expect(
      derivePipelineStatus({
        source: "CT_REGISTRY",
        externalId: null,
        phone: "+18605551234",
        matchStatus: null,
        phoneStatus: null,
      }),
    ).toBe("PHONE_FOUND");
  });

  it("returns NO_MATCH when matchStatus is NO_MATCH", () => {
    expect(
      derivePipelineStatus({
        source: "CT_REGISTRY",
        externalId: null,
        phone: null,
        matchStatus: "NO_MATCH",
        phoneStatus: null,
      }),
    ).toBe("NO_MATCH");
  });

  it("returns NO_PHONE when phoneStatus is NO_PHONE", () => {
    expect(
      derivePipelineStatus({
        source: "CT_REGISTRY",
        externalId: "place_123",
        phone: null,
        matchStatus: "MATCHED",
        phoneStatus: "NO_PHONE",
      }),
    ).toBe("NO_PHONE");
  });

  it("returns FAILED when matchStatus FAILED or phoneStatus FAILED", () => {
    expect(
      derivePipelineStatus({
        source: "CT_REGISTRY",
        externalId: null,
        phone: null,
        matchStatus: "FAILED",
        phoneStatus: null,
      }),
    ).toBe("FAILED");

    expect(
      derivePipelineStatus({
        source: "CT_REGISTRY",
        externalId: null,
        phone: null,
        matchStatus: null,
        phoneStatus: "FAILED",
      }),
    ).toBe("FAILED");
  });
});
