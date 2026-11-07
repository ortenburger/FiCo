import {
  buildWeeklyWrappedStory,
  isoWeekOf,
  type CashflowPortInput,
  type EmergencyShieldPortInput,
  type MicroHabitPortInput,
  type SavingsPortInput,
  type StreakSnapshotPortInput,
  type WeeklyWrappedStory,
} from "./weekly-story.js";

export type {
  CashflowPortInput,
  EmergencyShieldPortInput,
  MicroHabitPortInput,
  SavingsPortInput,
  StreakSnapshotPortInput,
  WeeklyWrappedStory,
};

/**
 * Weekly Money Wrapped generator (GAMIFICATION.md §5/§3).
 *
 * Pure orchestration over injected ports — no DB, no network, no `new Date()`.
 * Tests inject fakes; the production wiring (BullMQ job) glues Prisma/ledger
 * calls into the same interface.
 *
 * UNITS: EUR cents everywhere except `agenticHighlight.projectionEur`
 * (whole EUR, spec-mandated name) — documented in weekly-story.ts.
 *
 * CRON CADENCE — runs every SUNDAY AFTERNOON (Sunday-only gate below):
 * There is no repeatable-job/scheduler pattern in this package yet
 * (index.ts only registers catch Workers, no recurrence). Text-based
 * checklist until a scheduler lands:
 *   1. Add a repeatable BullMQ job, e.g. weeklyQueue.add("weekly-wrapped", {},
 *      { repeat: { pattern: "0 15 15 * * 7" } }) — 15:15 on Sunday (cron dow 7/0).
 *   2. In the Worker handler: const { weekNumber, year } = isoWeekOf(now);
 *      then call generateWeeklySummary(deps, job.data.userId, now) per active user;
 *      the Sunday gate keeps manual/out-of-window invocations safe.
 *   3. Enqueue per-user payout jobs (idempotent via payweekHash) rather than
 *      one giant fan-out, so retries stay cheap.
 *   4. Egon Demo user seeded by demo-seed.ts (Topic 10) must be in the user list.
 */

/** Row matching the WeeklySummary Prisma model (GAMIFICATION.md §8). */
export type WeeklySummaryRow = {
  userId: string;
  weekNumber: number;
  year: number;
  /** Weekly savings total (EUR CENTS — divide by 100 for the Decimal(12,2) column). */
  savingsTotal: number;
  /** Lifetime fees avoided / boss damage (EUR CENTS — divide by 100). */
  feesAvoided: number;
  /** Ritual-week XP earned (from the streak snapshot). */
  xpEarned: number;
  microHabitStory: WeeklyWrappedStory;
};

export type WeeklySummaryPorts = {
  /** Topic 2 port: current streak state (weeks, XP gained this ritual week). */
  getStreakSnapshot(userId: string): Promise<StreakSnapshotPortInput>;
  /** Ledger/AISP port: weekly cashflow totals for the payweek bucket. */
  getWeeklyCashflow(userId: string, year: number, weekNumber: number): Promise<CashflowPortInput>;
  /** Shield port: 3-month emergency shield progress. */
  getEmergencyShield(userId: string): Promise<EmergencyShieldPortInput>;
  /** Ledger port: lifetime fees avoided (boss damage) + boss label. */
  getSavingsSummary(userId: string, year: number, weekNumber: number): Promise<SavingsPortInput>;
  /** Topic 6 port: this week's agentic micro-habit highlight, or null. */
  getMicroHabitHighlight(
    userId: string,
    year: number,
    weekNumber: number,
  ): Promise<MicroHabitPortInput | null>;
  /** Persistence port: find the stored summary for (userId, week, year). */
  findWeeklySummary(
    userId: string,
    year: number,
    weekNumber: number,
  ): Promise<WeeklySummaryRow | null>;
  /** Persistence port: upsert the summary row (idempotency enforced via payweekHash). */
  saveWeeklySummary(row: WeeklySummaryRow): Promise<void>;
};

export type GenerateWeeklySummaryResult = {
  weeklySummaryRow: WeeklySummaryRow;
  story: WeeklyWrappedStory;
  /** Whether this call created the row or replayed an existing one (idempotent). */
  status: "CREATED" | "EXISTING";
};

/**
 * generateWeeklySummary(deps, userId, now) → { weeklySummaryRow, story }.
 *
 * Idempotent per (userId, ISO week, year): if a summary already exists for the
 * payweek, the stored row/story is returned as-is (status: "EXISTING") without
 * re-creating or re-scoring. Note the gate: cron runs Sunday afternoon only —
 * any other weekday throws so stray invocations cannot mint off-cadence stories.
 */
export async function generateWeeklySummary(
  deps: WeeklySummaryPorts,
  userId: string,
  now: Date,
): Promise<GenerateWeeklySummaryResult> {
  if (now.getUTCDay() !== 0) {
    throw new Error(
      `Weekly Money Wrapped runs Sunday afternoons only (got utc day ${now.getUTCDay()})`,
    );
  }

  const { weekNumber, year } = isoWeekOf(now);

  const existing = await deps.findWeeklySummary(userId, year, weekNumber);
  if (existing) {
    return { weeklySummaryRow: existing, story: existing.microHabitStory, status: "EXISTING" };
  }

  const [streak, cashflow, shield, savings, microHabit] = await Promise.all([
    deps.getStreakSnapshot(userId),
    deps.getWeeklyCashflow(userId, year, weekNumber),
    deps.getEmergencyShield(userId),
    deps.getSavingsSummary(userId, year, weekNumber),
    deps.getMicroHabitHighlight(userId, year, weekNumber),
  ]);

  const story = buildWeeklyWrappedStory({ userId, now, streak, cashflow, shield, savings, microHabit });

  const weeklySummaryRow: WeeklySummaryRow = {
    userId,
    weekNumber,
    year,
    // Weekly savings = ledger/agentic savings port for this payweek.
    savingsTotal: savings.weeklySavingsCents,
    feesAvoided: savings.lifetimeFeesAvoidedCents,
    xpEarned: streak.xpGainedThisWeek,
    microHabitStory: story,
  };

  await deps.saveWeeklySummary(weeklySummaryRow);
  return { weeklySummaryRow, story, status: "CREATED" };
}
