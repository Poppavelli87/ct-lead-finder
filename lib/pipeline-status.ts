import { LeadSource, Prisma } from "@prisma/client";

export type PipelineStatus = "NEEDS_MATCH" | "MATCHED" | "PHONE_FOUND" | "NO_MATCH" | "NO_PHONE" | "FAILED";

type PipelineLeadLike = {
  source: LeadSource | string;
  externalId?: string | null;
  phone?: string | null;
  matchStatus?: string | null;
  phoneStatus?: string | null;
};

export function derivePipelineStatus(lead: PipelineLeadLike): PipelineStatus {
  const matchStatus = (lead.matchStatus ?? "").toUpperCase();
  const phoneStatus = (lead.phoneStatus ?? "").toUpperCase();
  const source = String(lead.source);
  const hasPlaceId = Boolean((lead.externalId ?? "").trim());
  const hasPhone = Boolean((lead.phone ?? "").trim());

  if (matchStatus === "FAILED" || phoneStatus === "FAILED") return "FAILED";
  if (hasPhone || phoneStatus === "FOUND") return "PHONE_FOUND";
  if (matchStatus === "NO_MATCH") return "NO_MATCH";
  if (phoneStatus === "NO_PHONE") return "NO_PHONE";
  if (hasPlaceId || matchStatus === "MATCHED") return "MATCHED";
  if (!hasPlaceId && !hasPhone && (source === "CT_REGISTRY" || source === "UPLOAD" || source === "BULK_UPLOAD")) {
    return "NEEDS_MATCH";
  }

  return "NEEDS_MATCH";
}

export function pipelineStatusWhere(status?: string): Prisma.LeadWhereInput | undefined {
  if (!status) return undefined;

  const value = status.toUpperCase() as PipelineStatus;
  switch (value) {
    case "NEEDS_MATCH":
      return {
        AND: [
          { externalId: null },
          { phone: null },
          { source: { in: ["CT_REGISTRY", "UPLOAD"] } },
          { OR: [{ matchStatus: null }, { matchStatus: { notIn: ["NO_MATCH", "FAILED"] } }] },
          { OR: [{ phoneStatus: null }, { phoneStatus: { notIn: ["NO_PHONE", "FAILED"] } }] },
        ],
      };
    case "MATCHED":
      return {
        AND: [{ externalId: { not: null } }, { phone: null }, { phoneStatus: null }],
      };
    case "PHONE_FOUND":
      return {
        phone: { not: null },
      };
    case "NO_MATCH":
      return { matchStatus: "NO_MATCH" };
    case "NO_PHONE":
      return { phoneStatus: "NO_PHONE" };
    case "FAILED":
      return { OR: [{ matchStatus: "FAILED" }, { phoneStatus: "FAILED" }] };
    default:
      return undefined;
  }
}
