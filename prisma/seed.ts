import bcrypt from "bcryptjs";
import { Prisma, PrismaClient } from "@prisma/client";
import { getAdminPassword } from "../lib/env";
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

