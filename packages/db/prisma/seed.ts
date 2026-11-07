/**
 * Rich demo account for voice-agent + gamification demos.
 *
 * Fixed id matches app DEMO_USER_ID:
 *   00000000-0000-4000-8000-000000000001
 *
 * Run: pnpm --filter @fico/db seed
 */
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";

function d(n: number | string): Prisma.Decimal {
  return new Prisma.Decimal(n);
}

function monthsAgo(n: number): Date {
  const dt = new Date();
  dt.setUTCDate(1);
  dt.setUTCMonth(dt.getUTCMonth() - n);
  return dt;
}

function isoDate(dt: Date): Date {
  return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
}

async function main(): Promise<void> {
  // Wipe prior demo graph for idempotent re-seed (keep other users)
  await prisma.weeklySummary.deleteMany({ where: { userId: DEMO_USER_ID } });
  await prisma.userGamificationProfile.deleteMany({ where: { userId: DEMO_USER_ID } });
  await prisma.advisoryFeeInvoice.deleteMany({ where: { userId: DEMO_USER_ID } });
  await prisma.policySwitchCase.deleteMany({ where: { userId: DEMO_USER_ID } });
  await prisma.fbSynopsisRun.deleteMany({
    where: { policy: { userId: DEMO_USER_ID } },
  });
  await prisma.ledgerLine.deleteMany({
    where: { journalEntry: { userId: DEMO_USER_ID } },
  });
  await prisma.journalEntry.deleteMany({ where: { userId: DEMO_USER_ID } });
  await prisma.transaction.deleteMany({
    where: { account: { userId: DEMO_USER_ID } },
  });
  await prisma.allocationProfile.deleteMany({ where: { userId: DEMO_USER_ID } });
  await prisma.userProfile.deleteMany({ where: { userId: DEMO_USER_ID } });
  await prisma.insurancePolicy.deleteMany({ where: { userId: DEMO_USER_ID } });
  await prisma.account.deleteMany({ where: { userId: DEMO_USER_ID } });
  await prisma.bankConsent.deleteMany({ where: { userId: DEMO_USER_ID } });

  const user = await prisma.user.upsert({
    where: { id: DEMO_USER_ID },
    update: {
      email: "lena.demo@fico.local",
      subscriptionTier: "ACTIVE_SUBSCRIBER",
      passwordHash: "demo-not-a-real-hash",
    },
    create: {
      id: DEMO_USER_ID,
      email: "lena.demo@fico.local",
      passwordHash: "demo-not-a-real-hash",
      subscriptionTier: "ACTIVE_SUBSCRIBER",
    },
  });

  await prisma.userProfile.upsert({
    where: { userId: user.id },
    update: {
      grossMonthlyIncome: d(4200),
      maritalStatus: "SINGLE",
    },
    create: {
      userId: user.id,
      grossMonthlyIncome: d(4200),
      maritalStatus: "SINGLE",
    },
  });

  const institution = await prisma.financialInstitution.upsert({
    where: { id: "00000000-0000-4000-8000-0000000000a1" },
    update: { name: "Demo Bank (finAPI)", adapter: "FINAPI" },
    create: {
      id: "00000000-0000-4000-8000-0000000000a1",
      name: "Demo Bank (finAPI)",
      bic: "DEUTDEFFXXX",
      adapter: "FINAPI",
    },
  });

  const consent = await prisma.bankConsent.create({
    data: {
      userId: user.id,
      institutionId: institution.id,
      externalConsentId: "demo-consent-finapi-001",
      scaValidUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 80),
      status: "ACTIVE",
    },
  });

  const checking = await prisma.account.create({
    data: {
      id: "00000000-0000-4000-8000-0000000000b1",
      userId: user.id,
      consentId: consent.id,
      type: "CHECKING",
      iban: "DE89370400440532013000",
      currency: "EUR",
      balanceAmount: d(2840.55),
      balanceUpdatedAt: new Date(),
      version: 1,
    },
  });

  const savings = await prisma.account.create({
    data: {
      id: "00000000-0000-4000-8000-0000000000b2",
      userId: user.id,
      consentId: consent.id,
      type: "SAVINGS",
      iban: "DE12500105170648489890",
      currency: "EUR",
      balanceAmount: d(6100.0),
      balanceUpdatedAt: new Date(),
      version: 1,
    },
  });

  const depot = await prisma.account.create({
    data: {
      id: "00000000-0000-4000-8000-0000000000b3",
      userId: user.id,
      consentId: consent.id,
      type: "DEPOT",
      currency: "EUR",
      balanceAmount: d(12450.0),
      balanceUpdatedAt: new Date(),
      version: 1,
    },
  });

  await prisma.allocationProfile.create({
    data: {
      userId: user.id,
      targetBufferMonths: d(3.0),
      currentBufferTargetAmount: d(5400),
      emergencyFundAccountId: savings.id,
      targetEquityRatio: d(0.7),
      rebalancingThresholdPct: d(0.05),
    },
  });

  // Recurring insurance premiums + salary over last 3 months
  const recurring: Array<{
    externalId: string;
    offsetDays: number;
    amount: number;
    name: string;
    category: "INCOME" | "FIXED_COST" | "VARIABLE_SPEND";
    sub?: string;
  }> = [];

  for (let m = 0; m < 3; m++) {
    const base = monthsAgo(m);
    recurring.push(
      {
        externalId: `salary-${m}`,
        offsetDays: 28,
        amount: 3200,
        name: "Arbeitgeber GmbH Gehalt",
        category: "INCOME",
      },
      {
        externalId: `allianz-bu-${m}`,
        offsetDays: 5,
        amount: -89.5,
        name: "Allianz Lebensversicherung",
        category: "FIXED_COST",
        sub: "INSURANCE_PREMIUM",
      },
      {
        externalId: `ergo-rente-${m}`,
        offsetDays: 8,
        amount: -145.0,
        name: "ERGO Vorsorge",
        category: "FIXED_COST",
        sub: "INSURANCE_PREMIUM",
      },
      {
        externalId: `huk-haft-${m}`,
        offsetDays: 12,
        amount: -12.4,
        name: "HUK Coburg",
        category: "FIXED_COST",
        sub: "INSURANCE_PREMIUM",
      },
      {
        externalId: `rent-${m}`,
        offsetDays: 1,
        amount: -980,
        name: "Wohnung Miete",
        category: "FIXED_COST",
      },
      {
        externalId: `gym-${m}`,
        offsetDays: 3,
        amount: -39.9,
        name: "Fitness First",
        category: "FIXED_COST",
      },
    );
    void base;
  }

  // Add a few variable spends on checking
  for (let i = 0; i < 8; i++) {
    recurring.push({
      externalId: `var-${i}`,
      offsetDays: 10 + i * 2,
      amount: -(18 + i * 3.5),
      name: i % 2 === 0 ? "REWE" : "DB Fernverkehr",
      category: "VARIABLE_SPEND",
    });
  }

  for (const tx of recurring) {
    const booking = isoDate(new Date(Date.now() - tx.offsetDays * 86400000));
    await prisma.transaction.create({
      data: {
        accountId: checking.id,
        externalId: tx.externalId,
        bookingDate: booking,
        valueDate: booking,
        amount: d(tx.amount),
        currency: "EUR",
        counterpartyName: tx.name,
        remittanceInfo: tx.sub ?? tx.name,
        category: tx.category,
        subCategory: tx.sub,
        isRecurring: tx.category === "FIXED_COST" || tx.category === "INCOME",
      },
    });
  }

  // Legacy gross BU — the "fee boss"
  const buPolicy = await prisma.insurancePolicy.create({
    data: {
      id: "00000000-0000-4000-8000-0000000000d1",
      userId: user.id,
      providerName: "Allianz Lebensversicherung",
      policyNumber: "BU-1999-S-88421",
      policyType: "BU_DISABILITY",
      costStructure: "COMMISSION_ZILLMERIZED",
      monthlyPremium: d(89.5),
      startDate: new Date("2016-03-01"),
      estimatedCommissionAlphaPct: d(4.2),
      documentStatus: "PARSED",
      rawDocumentS3Key: `users/${user.id}/policies/bu-demo.pdf`,
    },
  });

  const pensionPolicy = await prisma.insurancePolicy.create({
    data: {
      id: "00000000-0000-4000-8000-0000000000d2",
      userId: user.id,
      providerName: "ERGO Vorsorge",
      policyNumber: "RV-2018-4421",
      policyType: "PENSION_PRIVATE",
      costStructure: "GROSS_STANDARD",
      monthlyPremium: d(145),
      startDate: new Date("2018-06-15"),
      guaranteedInterestRate: d(0.9),
      estimatedCommissionAlphaPct: d(3.5),
      documentStatus: "PARSED",
    },
  });

  await prisma.insurancePolicy.create({
    data: {
      id: "00000000-0000-4000-8000-0000000000d3",
      userId: user.id,
      providerName: "HUK Coburg",
      policyNumber: "PHV-77881",
      policyType: "PROPERTY_CASUALTY",
      costStructure: "GROSS_STANDARD",
      monthlyPremium: d(12.4),
      startDate: new Date("2022-01-01"),
      documentStatus: "PARSED",
    },
  });

  await prisma.fbSynopsisRun.create({
    data: {
      policyId: buPolicy.id,
      triggerStatus: "COMPLETED",
      inputPayload: {
        source_tariff: {
          company_id: 102,
          tariff_code: "BU-1999-S",
          generation: 1999,
        },
        target_tariffs: [
          { company_id: 405, tariff_code: "BV10-NETTO", is_net: true },
        ],
        criteria_profile: "VERBRAUCHERSCHUTZ_STANDARD",
      },
      rawSynopsisResponse: {
        source_annual_cost: 1074,
        target_annual_cost: 720,
        clause_scores: [
          { clause_id: "AU", source_score: 78, target_score: 82 },
          { clause_id: "Prognose", source_score: 70, target_score: 68 },
        ],
      },
      scoreDeltaJson: {
        annualSavings: 354,
        regressions: ["Prognose"],
      },
      estimatedCostReductionRiy: d(0.35),
      executedAt: new Date(),
    },
  });

  await prisma.policySwitchCase.create({
    data: {
      userId: user.id,
      sourcePolicyId: buPolicy.id,
      targetCarrierRef: "CONFEE:BV10-NETTO",
      status: "SYNOPSIS_COMPLETE",
      cancellationLetterAllowed: false,
    },
  });

  await prisma.advisoryFeeInvoice.create({
    data: {
      userId: user.id,
      amountEur: d(149),
      feeType: "ADVISORY_FEE",
      description: "FiCo Jahresabo — transparente Honorarberatung (§ 34d)",
    },
  });

  // Journal sample: emergency-fund top-up (checking → savings)
  await prisma.journalEntry.create({
    data: {
      userId: user.id,
      description: "Demo Notgroschen-Auffüllung",
      reference: "SEED-BUFFER",
      status: "POSTED",
      lines: {
        create: [
          {
            accountId: savings.id,
            debit: d(500),
            credit: d(0),
            memo: "Tagesgeld +500",
          },
          {
            accountId: checking.id,
            debit: d(0),
            credit: d(500),
            memo: "Giro −500",
          },
        ],
      },
    },
  });

  // Gamification snacks (global catalog)
  const snacks = [
    {
      slug: "ter-drag-101",
      category: "INVESTING",
      title: "Warum 1,8% TER teuer ist",
      content: {
        seconds: 90,
        body: "Aktive Fonds mit 1,8% TER fressen über 30 Jahre einen Großteil der Rendite. Breite Marktindizes senken den Drag.",
      },
      quiz: {
        question: "Was senkt Portfolio-Drag am stärksten?",
        options: ["Häufiges Traden", "Niedrige TER", "Mehr Einzelaktien"],
        answerIndex: 1,
      },
      xpReward: 25,
    },
    {
      slug: "emergency-buffer",
      category: "HABITS",
      title: "Der 3-Monats-Schild",
      content: {
        seconds: 90,
        body: "Fixkosten × 3 Monate auf Tagesgeld schützt vor Dispo-Fallen — FiCo Waterfall priorisiert genau das.",
      },
      quiz: {
        question: "Wohin fließt Free Cash Flow zuerst, wenn der Puffer fehlt?",
        options: ["Aktien", "Notgroschen", "Krypto"],
        answerIndex: 1,
      },
      xpReward: 25,
    },
    {
      slug: "netto-vs-brutto-bu",
      category: "INSURANCE",
      title: "BU Brutto vs Netto",
      content: {
        seconds: 90,
        body: "Zillmerisierte BU-Tarife belasten die ersten Jahre. Nettotarife + transparentes Honorar trennen Produkt und Beratung.",
      },
      quiz: {
        question: "Was ist bei Nettotarifen die Vergütung?",
        options: ["Versteckte Provision", "Explizites Honorar", "Kickback"],
        answerIndex: 1,
      },
      xpReward: 30,
    },
  ] as const;

  for (const snack of snacks) {
    await prisma.financialSnack.upsert({
      where: { slug: snack.slug },
      update: {
        title: snack.title,
        category: snack.category,
        content: snack.content,
        quiz: snack.quiz,
        xpReward: snack.xpReward,
      },
      create: { ...snack },
    });
  }

  await prisma.userGamificationProfile.create({
    data: {
      userId: user.id,
      currentStreakWeeks: 6,
      longestStreakWeeks: 6,
      lastCheckInDate: new Date(),
      streakFreezeCount: 2,
      totalXp: 780,
      currentLevel: 4,
      completedSnacks: ["ter-drag-101", "emergency-buffer"],
      badges: ["BRONZE_FLAME", "FEE_AUDIT_UNLOCKED", "FIRST_VAULT_UPLOAD"],
    },
  });

  await prisma.weeklySummary.create({
    data: {
      userId: user.id,
      weekNumber: 45,
      year: 2026,
      savingsTotal: d(620),
      feesAvoided: d(380),
      xpEarned: 150,
      microHabitStory: {
        headline: "Weekly Money Wrapped",
        streakWeeks: 6,
        cashflow: {
          income: 3200,
          fixedCosts: 1266.8,
          discretionary: 210,
          surplus: 620,
        },
        emergencyShieldPct: 78,
        bossDamage: {
          name: "Allianz Gross Policy Monster",
          feesAvoidedEur: 380,
        },
        habit:
          "4× Rad statt ÖPNV (−€15,20). Compounded in Altersvorsorgedepot ≈ +€27k langfristig.",
        quest: "Prüfe BU-Nettotarif via con.fee / HonorarKonzept (Deep-Link).",
      },
    },
  });

  console.log("Seeded FiCo demo account");
  console.log(`  userId:   ${user.id}`);
  console.log(`  email:    ${user.email}`);
  console.log(`  name:     Lena Demo (persona)`);
  console.log(`  accounts: checking=${checking.balanceAmount} savings=${savings.balanceAmount} depot=${depot.balanceAmount}`);
  console.log(`  policies: BU/Allianz, ERGO Rente, HUK PHV`);
  console.log(`  gamification: L4 / 780 XP / 6-week streak`);
  console.log(`  depot=${depot.id} pension=${pensionPolicy.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
