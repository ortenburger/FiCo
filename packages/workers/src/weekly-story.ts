import { createHash } from "node:crypto";

/**
 * Pure story builder for the "Weekly Money Wrapped" recap (GAMIFICATION.md §3).
 *
 * UNITS — one convention, document once here:
 * Every money value in this module and its callers is EUR CENTS (integer),
 * except `agenticHighlight.projectionEur`, whose field name is mandated by
 * Gamification.md §3 and therefore carries whole EUR (number). The DB columns
 * on WeeklySummary (Prisma Decimal(12,2)) store EUR and the persistence
 * adapter converts cents -> EUR (`/ 100`) at write time.
 *
 * This module must stay side-effect free and deterministic: no `new Date()`,
 * no network, no DB. The job wrapper (generate-weekly-summary.ts) injects
 * everything.
 */

export type WeeklyWrappedStory = {
  /** Schema version of the story JSON, persisted in WeeklySummary.microHabitStory. */
  version: 1;
  /** Stable content hash of (userId, ISO week, year) — the idempotency key. */
  payweekHash: string;
  units: "EUR_CENTS";
  weekNumber: number;
  year: number;
  streakInfo: { weeks: number; xpGained: number };
  cashflowPulse: {
    income: number;
    fixedCosts: number;
    discretionary: number;
    surplus: number;
  };
  emergencyShield: {
    /** 0..100, integer. */
    percent: number;
    /** Net savings added to the shield this week (EUR cents, may be 0). */
    deltaThisWeek: number;
  };
  bossDamage: {
    /** Lifetime fees avoided (EUR cents) — running damage on the boss HP bar. */
    lifetimeFeesAvoided: number;
    /** Rendered §3 sentence, e.g. `You deal €380 damage to "Allianz Gross Policy Monster"!` */
    label: string;
  };
  agenticHighlight: { text: string; projectionEur: number };
};

/** Weekly leaderboard-style cashflow aggregates from the ledger/AISP port. */
export type CashflowPortInput = {
  incomeCents: number;
  fixedCostsCents: number;
  discretionaryCents: number;
};

export type EmergencyShieldPortInput = {
  /** 3-month target (EUR cents). */
  targetCents: number;
  /** Amount saved so far into the shield (EUR cents). */
  savedCents: number;
  /** Net savings added this week (EUR cents). */
  savedThisWeekCents: number;
};

export type SavingsPortInput = {
  /** Aggregated weekly savings (ledger plans + AISP swaps, EUR cents). */
  weeklySavingsCents: number;
  /** Lifetime fees avoided = boss damage (EUR cents). */
  lifetimeFeesAvoidedCents: number;
  /** Boss name used for the §3 damage line, e.g. "Allianz Gross Policy Monster". */
  bossName: string;
};

/** Local port type until Topic 2's `packages/gamification/src/streak.ts` lands. */
export type StreakSnapshotPortInput = {
  /** Consecutive completed Fri–Sun ritual buckets (§2). */
  weeks: number;
  /** XP earned this ritual week (check-ins + freezes + multipliers already applied). */
  xpGainedThisWeek: number;
};

/** Local port type until Topic 6's `packages/gamification/src/agents.ts` lands. */
export type MicroHabitPortInput = {
  agentKind: "MOBILITY" | "ENERGY" | "SUBSCRIPTION";
  /** One-line human summary with this period's saving, e.g. "You cycled 4 days ... (€15.20 saved)". */
  text: string;
  /** Rerun-safe monthly savings implied by the habit (EUR cents) — projection basis. */
  monthlySavingsCents: number;
};

/** Altersvorsorgedepot projection constants (§4): 7 % p.a., monthly compounding. */
export const PROJECTION_ANNUAL_RATE = 0.07;
export const PROJECTION_YEARS = 35;

/**
 * Future value of a fixed monthly deposit (EUR cents): FV = P * ((1+r)^n - 1) / r
 * where r = annualRate / 12 and n = years * 12. Matches the §4 wording.
 */
export function projectToRetirement(
  monthlyDepositCents: number,
  annualRate: number = PROJECTION_ANNUAL_RATE,
  years: number = PROJECTION_YEARS,
): number {
  if (monthlyDepositCents <= 0) return 0;
  const r = annualRate / 12;
  const n = years * 12;
  const factor = (Math.pow(1 + r, n) - 1) / r;
  return Math.round(monthlyDepositCents * factor);
}

export function euros(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}€${Math.floor(abs / 100).toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`;
}

/** Middleware Europe uses ISO weeks (Mon 00:00 local). Standard ISO 8601 algorithm. */
export function isoWeekOf(now: Date): { weekNumber: number; year: number } {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // Thursday of the same week defines the ISO year.
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day + 3);
  const year = date.getUTCFullYear();
  // Week 1 contains the year's first Thursday, i.e. 4 Jan.
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const weekNumber =
    1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return { weekNumber, year };
}

/** Stable idempotency fingerprint of a payweek. */
export function payweekHash(userId: string, year: number, weekNumber: number): string {
  return createHash("sha256")
    .update(`${userId}|${year}|${String(weekNumber).padStart(2, "0")}`)
    .digest("hex")
    .slice(0, 16);
}

function shieldPercent(input: EmergencyShieldPortInput): number {
  if (input.targetCents <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((input.savedCents / input.targetCents) * 100)));
}

export function buildWeeklyWrappedStory(args: {
  userId: string;
  now: Date;
  streak: StreakSnapshotPortInput;
  cashflow: CashflowPortInput;
  shield: EmergencyShieldPortInput;
  savings: SavingsPortInput;
  microHabit: MicroHabitPortInput | null;
}): WeeklyWrappedStory {
  const { weekNumber, year } = isoWeekOf(args.now);

  const surplus =
    args.cashflow.incomeCents -
    args.cashflow.fixedCostsCents -
    args.cashflow.discretionaryCents;

  const bossName = args.savings.bossName || "The Fee Monster";
  const defaultText =
    "No agentic micro-habit fired this week — your next micro-quest awaits 🌱";
  const highlight = args.microHabit;
  // projectToRetirement works in cents; the story field is whole EUR (§3 / UNITS above).
  const projectionEur = highlight
    ? Math.round(projectToRetirement(highlight.monthlySavingsCents) / 100)
    : 0;

  return {
    version: 1,
    payweekHash: payweekHash(args.userId, year, weekNumber),
    units: "EUR_CENTS",
    weekNumber,
    year,
    streakInfo: {
      weeks: args.streak.weeks,
      xpGained: args.streak.xpGainedThisWeek,
    },
    cashflowPulse: {
      income: args.cashflow.incomeCents,
      fixedCosts: args.cashflow.fixedCostsCents,
      discretionary: args.cashflow.discretionaryCents,
      surplus,
    },
    emergencyShield: {
      percent: shieldPercent(args.shield),
      deltaThisWeek: args.shield.savedThisWeekCents,
    },
    bossDamage: {
      lifetimeFeesAvoided: args.savings.lifetimeFeesAvoidedCents,
      label: `You deal ${euros(args.savings.lifetimeFeesAvoidedCents)} damage to "${bossName}"!`,
    },
    agenticHighlight: {
      text: highlight ? `${highlight.text} Compounded into Altersvorsorgedepot = ${euros(projectionEur)} at retirement!` : defaultText,
      // Whole EUR despite the spec-mandated `Eur` field name — see UNITS above.
      projectionEur,
    },
  };
}
