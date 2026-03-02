import { db } from "../db";
import { decryptSecret } from "../security/encryption";
import { getMonthKey, hashRequest } from "../utils";
import { ensureProviderDefaults } from "./bootstrap";
import { GOOGLE_DETAILS_COST, GOOGLE_TEXT_SEARCH_COST, ProviderSlug, PROVIDER_SLUGS } from "./constants";

type Primitive = string | number | boolean;

export type ProviderRequestOptions = {
  slug: ProviderSlug;
  endpointKey: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  pathParams?: Record<string, Primitive>;
  query?: Record<string, Primitive | undefined | null>;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  leadId?: string;
  jobId?: string;
  costUsd?: number;
};

type ProviderRequestErrorCode = "PROVIDER_NOT_CONFIGURED" | "PROVIDER_REQUEST_FAILED";

const providerThrottleState = new Map<string, number>();

export class ProviderRequestError extends Error {
  code: ProviderRequestErrorCode;
  provider?: string;
  statusCode: number;
  upstreamStatus?: number;

  constructor(args: {
    code: ProviderRequestErrorCode;
    message: string;
    provider?: string;
    statusCode: number;
    upstreamStatus?: number;
  }) {
    super(args.message);
    this.code = args.code;
    this.provider = args.provider;
    this.statusCode = args.statusCode;
    this.upstreamStatus = args.upstreamStatus;
  }
}

function resolveEndpoint(provider: any, endpointKey: string, pathParams?: Record<string, Primitive>): string {
  const endpoints = (provider.endpoints ?? {}) as Record<string, unknown>;
  const rawTemplate = typeof endpoints[endpointKey] === "string" ? (endpoints[endpointKey] as string) : endpointKey;

  let path = rawTemplate;
  if (pathParams) {
    for (const [key, value] of Object.entries(pathParams)) {
      path = path.replace(new RegExp(`\\{${key}\\}`, "g"), encodeURIComponent(String(value)));
    }
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${provider.baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

async function throttleProvider(provider: any): Promise<void> {
  const providerLimit = Math.max(1, provider.rateLimitPerSec || 1);
  const perSec = provider.slug === PROVIDER_SLUGS.GOOGLE ? Math.min(providerLimit, 10) : providerLimit;
  const minInterval = Math.ceil(1000 / perSec);
  const now = Date.now();
  const nextAllowedAt = providerThrottleState.get(provider.slug) ?? 0;
  const waitMs = nextAllowedAt - now;

  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  providerThrottleState.set(provider.slug, Date.now() + minInterval);
}

function resolveCost(provider: any, endpointKey: string, override?: number): number {
  if (typeof override === "number") return override;

  if (provider.slug === PROVIDER_SLUGS.GOOGLE) {
    if (endpointKey === "text_search") return GOOGLE_TEXT_SEARCH_COST;
    if (endpointKey === "text_search_new") return GOOGLE_TEXT_SEARCH_COST;
    if (endpointKey === "place_details") return GOOGLE_DETAILS_COST;
    if (endpointKey === "place_phone_details") return GOOGLE_DETAILS_COST;
  }

  const fallback = provider.defaultCostPerCall ?? 0;
  return Number(fallback);
}

async function updateMonthlyUsage(providerId: string, costUsd: number, timestamp: Date): Promise<void> {
  const month = getMonthKey(timestamp);
  const increment = costUsd;

  await db.monthlyUsage.upsert({
    where: {
      providerId_month: {
        providerId,
        month,
      },
    },
    update: {
      requestCount: { increment: 1 },
      costUsd: { increment },
    },
    create: {
      providerId,
      month,
      requestCount: 1,
      costUsd: increment,
    },
  });

  const existingGlobal = await db.monthlyUsage.findFirst({
    where: {
      providerId: null,
      month,
    },
  });

  if (existingGlobal) {
    await db.monthlyUsage.update({
      where: { id: existingGlobal.id },
      data: {
        requestCount: { increment: 1 },
        costUsd: { increment },
      },
    });
  } else {
    await db.monthlyUsage.create({
      data: {
        providerId: null,
        month,
        requestCount: 1,
        costUsd: increment,
      },
    });
  }
}

async function logUsage(args: {
  provider: any;
  endpointKey: string;
  timestamp: Date;
  costUsd: number;
  requestHash: string;
  jobId?: string;
  leadId?: string;
  statusCode?: number;
  durationMs: number;
  errorMessage?: string;
}): Promise<void> {
  const { provider } = args;
  void args.requestHash;
  void args.jobId;
  void args.leadId;
  void args.durationMs;

  await db.apiUsage.create({
    data: {
      providerId: provider.id,
      endpointKey: args.endpointKey,
      timestamp: args.timestamp,
      statusCode: args.statusCode,
      errorMessage: args.errorMessage,
    },
  });

  await updateMonthlyUsage(provider.id, args.costUsd, args.timestamp);

  if (args.errorMessage) {
    await db.provider.update({
      where: { id: provider.id },
      data: {
        lastError: args.errorMessage.slice(0, 2000),
        lastErrorAt: args.timestamp,
      },
    });
  } else {
    await db.provider.update({
      where: { id: provider.id },
      data: {
        lastError: null,
        lastSuccessAt: args.timestamp,
      },
    });
  }
}

export async function getProviderBySlug(slug: ProviderSlug): Promise<any> {
  let provider = await db.provider.findUnique({ where: { slug } });
  if (!provider) {
    await ensureProviderDefaults();
    provider = await db.provider.findUnique({ where: { slug } });
  }
  if (!provider) {
    throw new ProviderRequestError({
      code: "PROVIDER_NOT_CONFIGURED",
      provider: slug,
      statusCode: 500,
      message: `Provider ${slug} is not configured.`,
    });
  }
  return provider;
}

export async function getProviderSecret(slug: ProviderSlug): Promise<string | null> {
  const provider = await getProviderBySlug(slug);
  return decryptSecret(provider.secretEncrypted);
}

export async function providerRequest<T = unknown>(options: ProviderRequestOptions): Promise<{
  data: T;
  statusCode: number;
  durationMs: number;
}> {
  const provider = await getProviderBySlug(options.slug);
  const method = options.method ?? "GET";
  const timestamp = new Date();
  const costUsd = resolveCost(provider, options.endpointKey, options.costUsd);

  const baseRequestFingerprint = `${provider.slug}:${options.endpointKey}:${method}:${JSON.stringify(options.pathParams ?? {})}:${JSON.stringify(options.query ?? {})}`;
  const requestHash = hashRequest(baseRequestFingerprint);

  if (!provider.enabled) {
    const message = `Provider ${provider.slug} is disabled in API Hub.`;
    await logUsage({
      provider,
      endpointKey: options.endpointKey,
      timestamp,
      costUsd,
      requestHash,
      jobId: options.jobId,
      leadId: options.leadId,
      statusCode: 500,
      durationMs: 0,
      errorMessage: message,
    });
    throw new ProviderRequestError({
      code: "PROVIDER_NOT_CONFIGURED",
      provider: provider.slug,
      statusCode: 500,
      message,
    });
  }

  await throttleProvider(provider);

  const url = new URL(resolveEndpoint(provider, options.endpointKey, options.pathParams));
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  const timeoutMs = options.timeoutMs ?? provider.timeoutMs;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(url.toString(), {
      method,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers ?? {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });

    const durationMs = Date.now() - startedAt;
    const text = await response.text();
    const data = tryParseJson(text);

    if (!response.ok) {
      const bodySnippet = text.slice(0, 500);
      const message =
        response.status === 429
          ? `Provider rate limited (${provider.slug}/${options.endpointKey}) status 429: ${bodySnippet || "empty response body"}`
          : `Provider call failed (${provider.slug}/${options.endpointKey}) with status ${response.status}: ${bodySnippet || "empty response body"}`;
      await logUsage({
        provider,
        endpointKey: options.endpointKey,
        timestamp,
        costUsd,
        requestHash,
        jobId: options.jobId,
        leadId: options.leadId,
        statusCode: response.status,
        durationMs,
        errorMessage: message,
      });
      throw new ProviderRequestError({
        code: "PROVIDER_REQUEST_FAILED",
        provider: provider.slug,
        statusCode: 502,
        upstreamStatus: response.status,
        message,
      });
    }

    await logUsage({
      provider,
      endpointKey: options.endpointKey,
      timestamp,
      costUsd,
      requestHash,
      jobId: options.jobId,
      leadId: options.leadId,
      statusCode: response.status,
      durationMs,
    });

    return {
      data: data as T,
      statusCode: response.status,
      durationMs,
    };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    const durationMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : "Unknown provider request error";

    await logUsage({
      provider,
      endpointKey: options.endpointKey,
      timestamp,
      costUsd,
      requestHash,
      jobId: options.jobId,
      leadId: options.leadId,
      statusCode: 502,
      durationMs,
      errorMessage: message,
    });

    throw new ProviderRequestError({
      code: "PROVIDER_REQUEST_FAILED",
      provider: provider.slug,
      statusCode: 502,
      message,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function tryParseJson(text: string): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
