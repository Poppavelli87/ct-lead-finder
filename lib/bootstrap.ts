import { db } from "./db";
import { bootstrapAdminIfMissing } from "./auth";
import { ensureProviderDefaults } from "./providers/bootstrap";

let bootstrapPromise: Promise<void> | null = null;

async function runBootstrap(): Promise<void> {
  await bootstrapAdminIfMissing();
  await ensureProviderDefaults();

  const leadCount = await db.lead.count();
  if (leadCount > 0) return;

  await db.lead.createMany({
    data: [
      {
        source: "MOCK",
        name: "Hartford Plumbing Co",
        industryType: "Plumbing",
        phone: "(860) 555-1201",
        website: "https://hartfordplumbing.example.com",
        address1: "120 Main Street",
        city: "Hartford",
        county: "Hartford",
        state: "CT",
        zip: "06103",
        qualified: true,
        qualificationScore: 100,
      },
      {
        source: "MOCK",
        name: "New Haven Dental Group",
        industryType: "Dental",
        phone: "(203) 555-2004",
        website: "https://newhavendental.example.com",
        address1: "88 Elm Street",
        city: "New Haven",
        county: "New Haven",
        state: "CT",
        zip: "06510",
        qualified: true,
        qualificationScore: 100,
      },
      {
        source: "CT_REGISTRY",
        name: "Bridgeport Logistics LLC",
        industryType: "LLC",
        address1: "40 Water Street",
        city: "Bridgeport",
        county: "Fairfield",
        state: "CT",
        zip: "06604",
        qualified: false,
        qualificationScore: 40,
      },
    ],
  });
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

