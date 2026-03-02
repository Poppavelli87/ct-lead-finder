import { bootstrapAdminIfMissing } from "./auth";
import { ensureProviderDefaults } from "./providers/bootstrap";

let bootstrapPromise: Promise<void> | null = null;

async function runBootstrap(): Promise<void> {
  await bootstrapAdminIfMissing();
  await ensureProviderDefaults();
}

export async function ensureBootstrapData(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = runBootstrap().catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }

  await bootstrapPromise;
}

