import { Prisma } from "@prisma/client";
import { db } from "../db";
import { PROVIDER_DEFAULTS, PROVIDER_SLUGS } from "./constants";

export async function ensureProviderDefaults(): Promise<void> {
  for (const config of PROVIDER_DEFAULTS) {
    const existing = await db.provider.findUnique({ where: { slug: config.slug } });
    if (!existing) {
      await db.provider.create({
        data: {
          name: config.name,
          slug: config.slug,
          enabled: config.enabled,
          baseUrl: config.baseUrl,
          endpoints: config.endpoints as Prisma.InputJsonValue,
          rateLimitPerSec: config.rateLimitPerSec,
          timeoutMs: config.timeoutMs,
          defaultCostPerCall: config.defaultCostPerCall,
        },
      });
      continue;
    }

    const currentEndpoints =
      existing.endpoints && typeof existing.endpoints === "object" && !Array.isArray(existing.endpoints)
        ? (existing.endpoints as Record<string, unknown>)
        : {};

    const mergedEndpoints = {
      ...(config.endpoints as Record<string, unknown>),
      ...currentEndpoints,
    };

    const shouldEnableFromSecret =
      existing.slug === PROVIDER_SLUGS.GOOGLE && Boolean(existing.secretEncrypted) && !existing.enabled;

    const needsEndpointBackfill = Object.keys(mergedEndpoints).length !== Object.keys(currentEndpoints).length;

    if (!shouldEnableFromSecret && !needsEndpointBackfill) {
      continue;
    }

    await db.provider.update({
      where: { id: existing.id },
      data: {
        ...(shouldEnableFromSecret ? { enabled: true } : {}),
        ...(needsEndpointBackfill ? { endpoints: mergedEndpoints as Prisma.InputJsonValue } : {}),
      },
    });
  }
}

