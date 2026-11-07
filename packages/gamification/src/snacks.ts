/**
 * Financial Snacks engine (GAMIFICATION.md §5): contextual delivery gating,
 * quiz evaluation and the TER compound simulator math.
 *
 * Pure functions only — persistence of `completedSnacks` lives in the
 * gamification profile (Topic 1's `GamificationProfileData.completedSnacks`
 * is a plain string[] of snack ids; this module consumes/produces exactly that).
 * No DB, no wall clock: `now` must be injected by the caller.
 */
import { DEFAULT_SNACKS } from "./snacks-content.js";

/** Re-exported so consumers get the catalog and the engine from one module. */
export { DEFAULT_SNACKS };

export type SnackCategory = "INVESTING" | "INSURANCE" | "ALTERSVORSORGE" | "HABITS";

/**
 * Journey stages (GAMIFICATION.md §6 chapters). A snack is offered once the
 * user has *reached* its stage, i.e. earlier stages' content stays available.
 */
export type JourneyStage = "ONBOARDING" | "FOUNDATION" | "FEE_SLAYER" | "WEALTH_ENGINE";

export type SnackContentStep = {
  heading: string;
  body: string;
  bullets?: string[];
};

export type SnackQuizOption = {
  label: string;
  isCorrect: boolean;
};

export type SnackQuiz = {
  question: string;
  options: SnackQuizOption[];
};

/** Config for the interactive TER slider (Snack 2). */
export type SnackSimulator = {
  kind: "TER_SLIDER";
  terMinPct: number;
  terMaxPct: number;
  monthlyEur: number;
  years: number;
  /** Gross annual return in percent. */
  ratePct: number;
  baselineTerPct: number;
  compareTerPct: number;
};

export type FinancialSnack = {
  /** Stable id — this is what lands in the profile's `completedSnacks`. */
  id: string;
  slug: string;
  category: SnackCategory;
  /** Journey stage at which this snack becomes relevant. */
  stage: JourneyStage;
  title: string;
  /** The hook / "The Question" / "The Myth" shown on the card. */
  heroLine: string;
  steps: SnackContentStep[];
  quiz: SnackQuiz;
  /** XP for a correct answer. Default 25; a wrong answer is always −5. */
  xpReward: number;
  simulator?: SnackSimulator;
};

// ---------------------------------------------------------------------------
// Quiz evaluation
// ---------------------------------------------------------------------------

export type QuizAnswerResult = {
  correct: boolean;
  /**
   * Raw XP delta: `snack.xpReward` for correct, −5 for wrong. The clamping to
   * a >= 0 total happens at award application in the core engine, not here.
   */
  xpDelta: number;
};

export const XP_PER_WRONG_ANSWER = -5;

export function evaluateQuizAnswer(snack: FinancialSnack, answerIndex: number): QuizAnswerResult {
  const option = snack.quiz.options[answerIndex];
  const correct = option?.isCorrect === true;
  return {
    correct,
    xpDelta: correct ? snack.xpReward : XP_PER_WRONG_ANSWER,
  };
}

// ---------------------------------------------------------------------------
// Contextual delivery
// ---------------------------------------------------------------------------

const STAGE_RANK: Record<JourneyStage, number> = {
  ONBOARDING: 0,
  FOUNDATION: 1,
  FEE_SLAYER: 2,
  WEALTH_ENGINE: 3,
};

/** Default cooldown between two snack deliveries: 20h (weekly-cadence friendly). */
export const SNACK_COOLDOWN_MS = 20 * 60 * 60 * 1000;

/** Observable user state the snack engine gates on (flags are monotonic). */
export type SnackUserContext = {
  connectedBank: boolean;
  scannedPolicy?: boolean;
  openedAltersvorsorgedepot?: boolean;
  /** Snack ids already completed — integration point: profile.completedSnacks. */
  completedSnacks: string[];
  /** Epoch ms of the last delivered snack, or null when none delivered yet. */
  lastSnackAt?: number | null;
  /** Injected clock (epoch ms) — never `new Date()` inside this module. */
  now: number;
};

/**
 * Map observable flags to the furthest journey stage reached. Flags are
 * monotonic, so the highest implied stage wins.
 */
export function deriveJourneyStage(
  ctx: Pick<SnackUserContext, "connectedBank"> & {
    scannedPolicy?: boolean;
    openedAltersvorsorgedepot?: boolean;
  },
): JourneyStage {
  if (ctx.openedAltersvorsorgedepot) return "WEALTH_ENGINE";
  if (ctx.scannedPolicy) return "FEE_SLAYER";
  if (ctx.connectedBank) return "FOUNDATION";
  return "ONBOARDING";
}

/**
 * Pick the next snack for the user's current journey stage.
 *
 * Rules:
 * - only snacks whose stage is reached (rank <= user stage rank);
 * - never a snack already in `completedSnacks` (no repeats);
 * - null while the cooldown after the last delivery is still running;
 * - deterministic pick: lowest stage rank first, then catalog order.
 *
 * Returns null when nothing is deliverable (empty result / cooldown).
 */
export function getContextualSnack(
  userCtx: SnackUserContext,
  catalog: readonly FinancialSnack[] = DEFAULT_SNACKS,
  cooldownMs: number = SNACK_COOLDOWN_MS,
): FinancialSnack | null {
  if (
    userCtx.lastSnackAt != null &&
    userCtx.now - userCtx.lastSnackAt < cooldownMs
  ) {
    return null;
  }

  const userRank = STAGE_RANK[deriveJourneyStage(userCtx)];
  const completed = new Set(userCtx.completedSnacks);

  let best: { snack: FinancialSnack; rank: number; order: number } | null = null;
  for (let order = 0; order < catalog.length; order++) {
    const snack = catalog[order]!;
    const rank = STAGE_RANK[snack.stage];
    if (rank > userRank) continue; // stage not reached yet
    if (completed.has(snack.id)) continue; // no repeats
    if (!best || rank < best.rank) {
      best = { snack, rank, order };
    }
  }
  return best?.snack ?? null;
}

/**
 * Record a snack completion — the value this returns is what the caller
 * persists into `profile.completedSnacks`. Idempotent and non-mutating.
 */
export function completeSnack(completed: readonly string[], snackId: string): string[] {
  if (completed.includes(snackId)) return [...completed];
  return [...completed, snackId];
}

// ---------------------------------------------------------------------------
// TER compound simulator (Snack 2)
// ---------------------------------------------------------------------------

export type TerOutcome = {
  terPct: number;
  /** Final wealth in EUR, net of the TER, principled on monthly compounding. */
  finalWealthEur: number;
  /** Total money put in: monthlyEur × months. */
  totalContributionsEur: number;
  /** Gross − net final wealth: the lifetime fee drag in EUR. */
  feeDragEur: number;
};

export type CompoundCompareResult = {
  a: TerOutcome;
  b: TerOutcome;
  /** finalWealth(a) − finalWealth(b) — the "damage" the TER delta caused. */
  deltaEur: number;
  /** Same horizon with zero fees, as reference for the fee drag. */
  grossWealthEur: number;
  months: number;
};

/**
 * Future value of an end-of-month contribution plan at a *net* annual rate
 * (`netRatePct`). Zero-rate fallback: plain summed contributions. Pure.
 */
export function futureWealthEur(monthlyEur: number, netRatePct: number, years: number): number {
  const months = Math.round(years * 12);
  const r = netRatePct / 1200;
  if (r === 0) return monthlyEur * months;
  return monthlyEur * ((Math.pow(1 + r, months) - 1) / r);
}

/**
 * Compare two TERs over the same plan. Canonical math: 7% gross return per
 * year, TER charged monthly, i.e. a net annual rate of `ratePct − terPct`
 * compounded with monthly granularity.
 *
 * Note: GAMIFICATION.md §5 quotes ≈ €335k (0.20% TER) vs ≈ €212k (1.80% TER)
 * for €200/month × 35y. The €335k figure matches this model (€343.5k, within
 * ~2.5%); the €212k figure matches a fee-wedge approximation at 1.50% TER, not
 * monthly compounding at 1.80% (€237.6k). Flagged to the orchestrator — this
 * module uses monthly compounding as canonical because it is financially sound.
 */
export function compoundCompare(
  monthlyEur: number,
  terAPct: number,
  terBPct: number,
  years: number,
  ratePct: number,
): CompoundCompareResult {
  const months = Math.round(years * 12);
  const grossWealthEur = futureWealthEur(monthlyEur, ratePct, years);
  const outcome = (terPct: number): TerOutcome => {
    const finalWealthEur = futureWealthEur(monthlyEur, ratePct - terPct, years);
    return {
      terPct,
      finalWealthEur,
      totalContributionsEur: monthlyEur * months,
      feeDragEur: grossWealthEur - finalWealthEur,
    };
  };
  const a = outcome(terAPct);
  const b = outcome(terBPct);
  return { a, b, deltaEur: a.finalWealthEur - b.finalWealthEur, grossWealthEur, months };
}
