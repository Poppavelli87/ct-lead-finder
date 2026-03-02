export type ExecutionScope = "master" | "search" | "phone";

export type ExecutionLimits = {
  scope?: ExecutionScope;
  maxLeads?: number;
  maxGoogleCalls?: number;
  maxCostUsd?: number;
  rateLimitRps?: number;
};

export type ResolvedExecutionLimits = {
  scope: ExecutionScope;
  maxLeads: number;
  maxGoogleCalls?: number;
  maxCostUsd?: number;
  rateLimitRps: number;
};

export const HARD_MAX_LEADS = 500;
export const DEFAULT_MAX_LEADS = 500;
export const MAX_GOOGLE_RPS = 10;

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export function resolveExecutionLimits(
  input?: ExecutionLimits,
  fallbackScope: ExecutionScope = "phone",
): ResolvedExecutionLimits {
  const maxLeads = clampInt(input?.maxLeads ?? DEFAULT_MAX_LEADS, 1, HARD_MAX_LEADS);
  const rateLimitRps = clampInt(input?.rateLimitRps ?? MAX_GOOGLE_RPS, 1, MAX_GOOGLE_RPS);

  const maxGoogleCalls =
    typeof input?.maxGoogleCalls === "number" && Number.isFinite(input.maxGoogleCalls)
      ? clampInt(input.maxGoogleCalls, 1, 1_000_000)
      : undefined;

  const maxCostUsd =
    typeof input?.maxCostUsd === "number" && Number.isFinite(input.maxCostUsd) && input.maxCostUsd > 0
      ? Number(input.maxCostUsd)
      : undefined;

  return {
    scope: input?.scope ?? fallbackScope,
    maxLeads,
    maxGoogleCalls,
    maxCostUsd,
    rateLimitRps,
  };
}

export function shouldStopForBudget(args: {
  limits: ResolvedExecutionLimits;
  processedLeads: number;
  googleCallsUsed: number;
  costPerGoogleCall: number;
}): { stop: boolean; reason?: string } {
  const { limits, processedLeads, googleCallsUsed, costPerGoogleCall } = args;

  if (processedLeads >= limits.maxLeads) {
    return { stop: true, reason: `maxLeads_reached_${limits.maxLeads}` };
  }

  if (typeof limits.maxGoogleCalls === "number" && googleCallsUsed >= limits.maxGoogleCalls) {
    return { stop: true, reason: `maxGoogleCalls_reached_${limits.maxGoogleCalls}` };
  }

  if (typeof limits.maxCostUsd === "number") {
    const projected = googleCallsUsed * costPerGoogleCall;
    if (projected >= limits.maxCostUsd) {
      return { stop: true, reason: `maxCostUsd_reached_${limits.maxCostUsd}` };
    }
  }

  return { stop: false };
}
