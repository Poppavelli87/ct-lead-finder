import { Prisma } from "@prisma/client";
import { db } from "../db";
import { PROVIDER_DEFAULTS } from "./constants";

export async function ensureProviderDefaults(): Promise<void> {
  for (const config of PROVIDER_DEFAULTS) {
    const existing = await db.provider.findUnique({ where: { slug: config.slug } });
    if (existing) continue;

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
  }
}

