/**
 * Seed for the demo voice-intake user.
 *
 * The frontend talks to a fixed user id (see app/src/App.tsx DEMO_USER_ID).
 * Without this user every profile and document route answers 404, which makes
 * the ElevenLabs client tools look broken even when the contract is correct.
 *
 * Run: pnpm --filter @fico/db seed
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";

async function main(): Promise<void> {
  const user = await prisma.user.upsert({
    where: { id: DEMO_USER_ID },
    update: {},
    create: {
      id: DEMO_USER_ID,
      email: "demo@fico.local",
      passwordHash: "demo-not-a-real-hash",
      subscriptionTier: "FREE",
    },
  });

  // The document presign route requires an existing policy to attach the
  // uploaded file to, otherwise it answers "No insurance policy found".
  const policy = await prisma.insurancePolicy.findFirst({
    where: { userId: user.id },
  });

  if (!policy) {
    await prisma.insurancePolicy.create({
      data: {
        userId: user.id,
        providerName: "Demo Versicherung",
        policyType: "TERM_LIFE",
        costStructure: "GROSS_STANDARD",
        monthlyPremium: new Prisma.Decimal(45),
        startDate: new Date("2020-01-01"),
      },
    });
  }

  console.log(`Seeded demo user ${user.id}`);
  console.log(`  email: ${user.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
