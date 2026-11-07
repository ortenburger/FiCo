import type { FastifyInstance } from "fastify";
import { prisma, Prisma } from "@fico/db";
import { evaluateWaterfall } from "@fico/ledger";
import { z } from "zod";

export const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";

function money(value: Prisma.Decimal | number | string): string {
  return new Prisma.Decimal(value).toFixed(2);
}

/**
 * Demo snapshot for voice + gamification UI.
 * Returns contracts, cash accounts, waterfall suggestion, XP/streak, weekly wrap.
 */
export async function registerDemoRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/demo/snapshot", async (req, reply) => {
    const q = z
      .object({ userId: z.string().uuid().default(DEMO_USER_ID) })
      .parse(req.query);

    const user = await prisma.user.findUnique({
      where: { id: q.userId },
      include: {
        userProfile: true,
        accounts: true,
        policies: {
          include: { synopsisRuns: { orderBy: { createdAt: "desc" }, take: 1 } },
        },
        allocationProfile: true,
        gamificationProfile: true,
        weeklySummaries: { orderBy: { createdAt: "desc" }, take: 1 },
        policySwitchCases: true,
      },
    });

    if (!user) {
      return reply.code(404).send({
        error: "Demo user not found",
        hint: "Run: pnpm --filter @fico/db seed",
      });
    }

    const txs = await prisma.transaction.findMany({
      where: { account: { userId: user.id } },
      orderBy: { bookingDate: "desc" },
      take: 40,
    });

    const fixedCostSum = txs
      .filter((t) => t.category === "FIXED_COST")
      .reduce((acc, t) => acc.plus(t.amount.abs()), new Prisma.Decimal(0));

    const liquidAccounts = user.accounts.filter(
      (a) => a.type === "CHECKING" || a.type === "SAVINGS",
    );

    const waterfall = evaluateWaterfall({
      fixedCostSumLookback: fixedCostSum.toString(),
      lookbackMonths: 3,
      targetBufferMonths:
        user.allocationProfile?.targetBufferMonths.toString() ?? "3",
      accounts: liquidAccounts.map((a) => ({
        type: a.type,
        balanceAmount: a.balanceAmount.toString(),
      })),
    });

    const snacks = await prisma.financialSnack.findMany({
      orderBy: { createdAt: "asc" },
    });

    const gamification = user.gamificationProfile;
    const weekly = user.weeklySummaries[0];

    const bossPolicy = user.policies.find((p) => p.policyType === "BU_DISABILITY");
    const synopsis = bossPolicy?.synopsisRuns[0];
    const annualGross = bossPolicy
      ? Number(bossPolicy.monthlyPremium) * 12
      : 0;
    const annualNetHint =
      synopsis?.scoreDeltaJson &&
      typeof synopsis.scoreDeltaJson === "object" &&
      synopsis.scoreDeltaJson !== null &&
      "annualSavings" in synopsis.scoreDeltaJson
        ? annualGross - Number((synopsis.scoreDeltaJson as { annualSavings: number }).annualSavings)
        : annualGross * 0.67;

    return {
      persona: {
        userId: user.id,
        email: user.email,
        displayName: "Lena Demo",
        age: 29,
        city: "Stuttgart",
        subscriptionTier: user.subscriptionTier,
        grossMonthlyIncome: user.userProfile
          ? money(user.userProfile.grossMonthlyIncome)
          : null,
        maritalStatus: user.userProfile?.maritalStatus ?? null,
        tagline:
          "Junior Product Designer · will Altersvorsorge & BU endlich verstehen",
      },
      accounts: user.accounts.map((a) => ({
        id: a.id,
        type: a.type,
        iban: a.iban,
        balanceAmount: money(a.balanceAmount),
        currency: a.currency,
      })),
      transactions: txs.map((t) => ({
        bookingDate: t.bookingDate.toISOString().slice(0, 10),
        amount: money(t.amount),
        counterpartyName: t.counterpartyName,
        category: t.category,
        subCategory: t.subCategory,
        isRecurring: t.isRecurring,
      })),
      policies: user.policies.map((p) => ({
        id: p.id,
        providerName: p.providerName,
        policyNumber: p.policyNumber,
        policyType: p.policyType,
        costStructure: p.costStructure,
        monthlyPremium: money(p.monthlyPremium),
        startDate: p.startDate.toISOString().slice(0, 10),
        documentStatus: p.documentStatus,
        estimatedCommissionAlphaPct: p.estimatedCommissionAlphaPct
          ? money(p.estimatedCommissionAlphaPct)
          : null,
        latestSynopsis: p.synopsisRuns[0]
          ? {
              triggerStatus: p.synopsisRuns[0].triggerStatus,
              scoreDeltaJson: p.synopsisRuns[0].scoreDeltaJson,
            }
          : null,
      })),
      waterfall,
      bossFight: bossPolicy
        ? {
            name: "Allianz Gross Policy Monster",
            policyId: bossPolicy.id,
            monthlyPremium: money(bossPolicy.monthlyPremium),
            annualGross: annualGross.toFixed(2),
            annualNetHint: annualNetHint.toFixed(2),
            annualSavingsHint: (annualGross - annualNetHint).toFixed(2),
            switchStatus: user.policySwitchCases[0]?.status ?? "DRAFT",
            quest:
              "Vergleiche Nettotarif (con.fee / HonorarKonzept) — Kündigung erst nach POLICY_ISSUED.",
          }
        : null,
      gamification: gamification
        ? {
            currentStreakWeeks: gamification.currentStreakWeeks,
            longestStreakWeeks: gamification.longestStreakWeeks,
            streakFreezeCount: gamification.streakFreezeCount,
            totalXp: gamification.totalXp,
            currentLevel: gamification.currentLevel,
            completedSnacks: gamification.completedSnacks,
            badges: Array.isArray(gamification.badges)
              ? (gamification.badges as string[])
              : [],
            flame:
              gamification.currentStreakWeeks >= 52
                ? "DIAMOND"
                : gamification.currentStreakWeeks >= 26
                  ? "GOLD"
                  : gamification.currentStreakWeeks >= 12
                    ? "SILVER"
                    : gamification.currentStreakWeeks >= 4
                      ? "BRONZE"
                      : "SPARK",
          }
        : null,
      weeklyWrapped: weekly
        ? {
            weekNumber: weekly.weekNumber,
            year: weekly.year,
            savingsTotal: money(weekly.savingsTotal),
            feesAvoided: money(weekly.feesAvoided),
            xpEarned: weekly.xpEarned,
            story: weekly.microHabitStory,
          }
        : null,
      snacks: snacks.map((s) => ({
        slug: s.slug,
        category: s.category,
        title: s.title,
        xpReward: s.xpReward,
        content: s.content,
        quiz: s.quiz,
        completed:
          Array.isArray(gamification?.completedSnacks) &&
          (gamification!.completedSnacks as string[]).includes(s.slug),
      })),
      voiceHints: [
        "Frage: Wie steht mein Notgroschen-Puffer?",
        "Frage: Zeig mir Nettotarife für BU.",
        "Frage: Vergleich Brutto 1074 vs Netto 720 bei 149€ Honorar.",
        "Frage: Was steht in meiner Allianz-Police?",
      ],
    };
  });

  app.post("/v1/demo/check-in", async (req, reply) => {
    const body = z
      .object({
        userId: z.string().uuid().default(DEMO_USER_ID),
        snackSlug: z.string().optional(),
      })
      .parse(req.body);

    const profile = await prisma.userGamificationProfile.findUnique({
      where: { userId: body.userId },
    });
    if (!profile) {
      return reply.code(404).send({ error: "Gamification profile missing — seed first" });
    }

    let xpGain = 50;
    const completed = Array.isArray(profile.completedSnacks)
      ? [...(profile.completedSnacks as string[])]
      : [];

    if (body.snackSlug && !completed.includes(body.snackSlug)) {
      const snack = await prisma.financialSnack.findUnique({
        where: { slug: body.snackSlug },
      });
      if (snack) {
        completed.push(snack.slug);
        xpGain += snack.xpReward;
      }
    }

    const nextXp = profile.totalXp + xpGain;
    const nextLevel = Math.max(1, Math.floor(nextXp / 200) + 1);
    const nextStreak = profile.currentStreakWeeks + 1;

    const updated = await prisma.userGamificationProfile.update({
      where: { userId: body.userId },
      data: {
        totalXp: nextXp,
        currentLevel: nextLevel,
        currentStreakWeeks: nextStreak,
        longestStreakWeeks: Math.max(profile.longestStreakWeeks, nextStreak),
        lastCheckInDate: new Date(),
        completedSnacks: completed,
      },
    });

    return {
      xpGain,
      totalXp: updated.totalXp,
      currentLevel: updated.currentLevel,
      currentStreakWeeks: updated.currentStreakWeeks,
      completedSnacks: updated.completedSnacks,
    };
  });
}
