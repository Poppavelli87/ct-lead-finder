import bcrypt from "bcryptjs";
import { LeadSource, Prisma, PrismaClient } from "@prisma/client";
import { getAdminPassword } from "../lib/env";
import { computeQualificationScore, isQualifiedLead } from "../lib/qualification";
import { PROVIDER_DEFAULTS } from "../lib/providers/constants";

const prisma = new PrismaClient();

async function main() {
  const adminPassword = getAdminPassword();
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await prisma.user.upsert({
    where: { username: "admin" },
    update: { passwordHash },
    create: {
      username: "admin",
      passwordHash,
    },
  });

  for (const provider of PROVIDER_DEFAULTS) {
    await prisma.provider.upsert({
      where: { slug: provider.slug },
      update: {
        name: provider.name,
        baseUrl: provider.baseUrl,
        endpoints: provider.endpoints as Prisma.InputJsonValue,
        rateLimitPerSec: provider.rateLimitPerSec,
        timeoutMs: provider.timeoutMs,
        defaultCostPerCall: provider.defaultCostPerCall,
      },
      create: {
        name: provider.name,
        slug: provider.slug,
        enabled: provider.enabled,
        baseUrl: provider.baseUrl,
        endpoints: provider.endpoints as Prisma.InputJsonValue,
        rateLimitPerSec: provider.rateLimitPerSec,
        timeoutMs: provider.timeoutMs,
        defaultCostPerCall: provider.defaultCostPerCall,
      },
    });
  }

  const demoLeads = [
    {
      source: LeadSource.MOCK,
      name: "Hartford Roofing Group",
      industryType: "Roofing",
      phone: "(860) 555-1337",
      website: "https://hartfordroofing.example.com",
      address1: "210 Asylum St",
      city: "Hartford",
      county: "Hartford",
      state: "CT",
      zip: "06103",
    },
    {
      source: LeadSource.MOCK,
      name: "Mystic Marine Service",
      industryType: "Marine Service",
      phone: "(860) 555-9801",
      website: "https://mysticmarine.example.com",
      address1: "45 Harbor Ave",
      city: "Mystic",
      county: "New London",
      state: "CT",
      zip: "06355",
    },
    {
      source: LeadSource.CT_REGISTRY,
      name: "Norwalk New Ventures LLC",
      industryType: "LLC",
      address1: "11 Wall St",
      city: "Norwalk",
      county: "Fairfield",
      state: "CT",
      zip: "06850",
    },
  ];

  for (const lead of demoLeads) {
    const qualificationScore = computeQualificationScore(lead);
    const qualified = isQualifiedLead(lead);

    await prisma.lead.upsert({
      where: {
        id: `seed_${lead.name.replace(/[^A-Za-z0-9]/g, "").toLowerCase()}`,
      },
      update: {
        ...lead,
        qualificationScore,
        qualified,
      },
      create: {
        id: `seed_${lead.name.replace(/[^A-Za-z0-9]/g, "").toLowerCase()}`,
        ...lead,
        qualificationScore,
        qualified,
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

