"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { providerUpdateSchema } from "@/lib/validation";
import { canEncryptSecrets, encryptSecret } from "@/lib/security/encryption";

export async function saveProviderAction(formData: FormData): Promise<void> {
  await requireUser();

  const parsed = providerUpdateSchema.safeParse({
    id: formData.get("id"),
    enabled: formData.get("enabled") === "on",
    baseUrl: formData.get("baseUrl"),
    endpointsJson: formData.get("endpointsJson"),
    secret: formData.get("secret") || undefined,
    rateLimitPerSec: formData.get("rateLimitPerSec"),
    timeoutMs: formData.get("timeoutMs"),
    defaultCostPerCall: formData.get("defaultCostPerCall"),
  });

  if (!parsed.success) {
    return;
  }

  const endpoints = safeParseEndpoints(parsed.data.endpointsJson);
  if (!endpoints) {
    return;
  }

  const existing = await db.provider.findUnique({ where: { id: parsed.data.id } });
  if (!existing) {
    return;
  }

  let secretEncrypted: string | undefined;
  const submittedSecret = parsed.data.secret?.trim();

  if (submittedSecret) {
    if (!canEncryptSecrets()) {
      return;
    }
    secretEncrypted = encryptSecret(submittedSecret);
  }

  await db.provider.update({
    where: { id: parsed.data.id },
    data: {
      enabled: parsed.data.enabled,
      baseUrl: parsed.data.baseUrl,
      endpoints: endpoints as Prisma.InputJsonValue,
      rateLimitPerSec: parsed.data.rateLimitPerSec,
      timeoutMs: parsed.data.timeoutMs,
      defaultCostPerCall: parsed.data.defaultCostPerCall,
      ...(secretEncrypted ? { secretEncrypted } : {}),
    },
  });

  revalidatePath("/api-hub");
}

function safeParseEndpoints(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

