/**
 * Seeds the four Financial Snacks of GAMIFICATION.md §5 into
 * `financial_snacks`. The canonical content lives in snacks.json next to this
 * script; this runner upserts by slug and never touches other tables.
 *
 * Run: pnpm --filter @fico/db exec tsx prisma/seed/snacks.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const prisma = new PrismaClient();

interface SnackSeed {
  slug: string;
  category: string;
  title: string;
  content: Prisma.InputJsonObject;
  quiz: Prisma.InputJsonObject;
  xpReward: number;
}

const seedPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "snacks.json");

async function main(): Promise<void> {
  const snacks = JSON.parse(readFileSync(seedPath, "utf8")) as SnackSeed[];

  for (const snack of snacks) {
    await prisma.financialSnack.upsert({
      where: { slug: snack.slug },
      update: {
        category: snack.category,
        title: snack.title,
        content: snack.content,
        quiz: snack.quiz,
        xpReward: snack.xpReward,
      },
      create: {
        slug: snack.slug,
        category: snack.category,
        title: snack.title,
        content: snack.content,
        quiz: snack.quiz,
        xpReward: snack.xpReward,
      },
    });
    console.log(`Seeded financial snack: ${snack.slug}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
