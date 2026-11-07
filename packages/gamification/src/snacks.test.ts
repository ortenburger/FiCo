/**
 * Tests for the Financial Snacks engine (GAMIFICATION.md §5).
 * Fully deterministic: ids and fixed epoch timestamps, no DB, no wall clock.
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_SNACKS,
  type FinancialSnack,
  SNACK_COOLDOWN_MS,
  type SnackUserContext,
  completeSnack,
  compoundCompare,
  deriveJourneyStage,
  evaluateQuizAnswer,
  futureWealthEur,
  getContextualSnack,
} from "./snacks.js";

const NOW = 1_762_000_000_000; // fixed epoch ms — no new Date() anywhere
const HOUR = 60 * 60 * 1000;

function ctx(overrides: Partial<SnackUserContext> = {}): SnackUserContext {
  return {
    connectedBank: false,
    completedSnacks: [],
    lastSnackAt: null,
    now: NOW,
    ...overrides,
  };
}

function bySlug(snack: FinancialSnack | null): string | null {
  return snack?.slug ?? null;
}

describe("evaluateQuizAnswer", () => {
  const snack = DEFAULT_SNACKS[0]!; // Snack 1, quiz exactly per GAMIFICATION.md §5

  it("awards +25 XP for the correct option", () => {
    const correctIndex = snack.quiz.options.findIndex((o) => o.isCorrect);
    expect(snack.quiz.options[1]!.isCorrect).toBe(true); // fixture sanity: B is correct
    expect(evaluateQuizAnswer(snack, correctIndex)).toEqual({ correct: true, xpDelta: 25 });
  });

  it("returns raw −5 XP for each wrong option", () => {
    expect(evaluateQuizAnswer(snack, 0)).toEqual({ correct: false, xpDelta: -5 });
    expect(evaluateQuizAnswer(snack, 2)).toEqual({ correct: false, xpDelta: -5 });
  });

  it("treats an out-of-range answer as wrong (−5, clamping happens at award time)", () => {
    expect(evaluateQuizAnswer(snack, 99)).toEqual({ correct: false, xpDelta: -5 });
    expect(evaluateQuizAnswer(snack, -1)).toEqual({ correct: false, xpDelta: -5 });
  });

  it("honours a custom xpReward", () => {
    const custom: FinancialSnack = { ...snack, xpReward: 40 };
    expect(evaluateQuizAnswer(custom, 1).xpDelta).toBe(40);
  });
});

describe("deriveJourneyStage", () => {
  it("maps observable flags monotonic to the furthest stage", () => {
    expect(deriveJourneyStage({ connectedBank: false })).toBe("ONBOARDING");
    expect(deriveJourneyStage({ connectedBank: true })).toBe("FOUNDATION");
    expect(deriveJourneyStage({ connectedBank: false, scannedPolicy: true })).toBe("FEE_SLAYER");
    expect(
      deriveJourneyStage({ connectedBank: true, scannedPolicy: true, openedAltersvorsorgedepot: true }),
    ).toBe("WEALTH_ENGINE");
  });
});

describe("getContextualSnack — delivery gating", () => {
  it("returns null for a fresh onboarding user (no snack unlocked)", () => {
    expect(bySlug(getContextualSnack(ctx()))).toBeNull();
  });

  it("delivers the first FOUNDATION snack once the bank is connected", () => {
    expect(bySlug(getContextualSnack(ctx({ connectedBank: true })))).toBe("etf-rebalancing-checkpoint");
  });

  it("delivers no repeats: completed snacks are skipped", () => {
    const done = ctx({ connectedBank: true, scannedPolicy: true, completedSnacks: ["snack_01_etf_rebalancing", "snack_02_silent_wealth_killer"] });
    expect(bySlug(getContextualSnack(done))).toBe("liability-demystified");
  });

  it("still delivers stage-1 content first for a user who skipped it (lowest stage rank wins)", () => {
    const skipped = ctx({ scannedPolicy: true });
    expect(bySlug(getContextualSnack(skipped))).toBe("etf-rebalancing-checkpoint");
  });

  it("returns null when everything reachable is completed (empty result)", () => {
    const allDone = ctx({
      connectedBank: true,
      scannedPolicy: true,
      openedAltersvorsorgedepot: true,
      completedSnacks: DEFAULT_SNACKS.map((s) => s.id),
    });
    expect(bySlug(getContextualSnack(allDone))).toBeNull();
  });

  it("returns null when nothing is left at the reached stage (next stage locked)", () => {
    const slayerDone = ctx({
      connectedBank: true,
      scannedPolicy: true,
      completedSnacks: ["snack_01_etf_rebalancing", "snack_02_silent_wealth_killer", "snack_03_privathaftpflicht"],
    });
    expect(bySlug(getContextualSnack(slayerDone))).toBeNull(); // WEALTH_ENGINE locked
  });

  it("ignores unknown ids in completedSnacks (integration is a plain string[])", () => {
    const noisy = ctx({ connectedBank: true, completedSnacks: ["some-quest-id", "garbage"] });
    expect(bySlug(getContextualSnack(noisy))).toBe("etf-rebalancing-checkpoint");
  });

  it("returns null while the cooldown after the last delivery is running", () => {
    const cooling = ctx({
      connectedBank: true,
      lastSnackAt: NOW - HOUR,
    });
    expect(bySlug(getContextualSnack(cooling))).toBeNull();
  });

  it("delivers again once the cooldown has passed", () => {
    const cooled = ctx({
      connectedBank: true,
      lastSnackAt: NOW - SNACK_COOLDOWN_MS - 1,
    });
    expect(bySlug(getContextualSnack(cooled))).toBe("etf-rebalancing-checkpoint");
  });

  it("honours a custom cooldown of 0 (no cooldown)", () => {
    const instant = ctx({ connectedBank: true, lastSnackAt: NOW });
    expect(bySlug(getContextualSnack(instant, DEFAULT_SNACKS, 0))).toBe("etf-rebalancing-checkpoint");
  });

  it("picks deterministically among equal-stage snacks (catalog order)", () => {
    const mk = (id: string, stage: FinancialSnack["stage"]): FinancialSnack => ({
      ...DEFAULT_SNACKS[0]!,
      id,
      slug: id,
      stage,
    });
    const catalog = [mk("b", "FOUNDATION"), mk("a", "FOUNDATION")];
    expect(bySlug(getContextualSnack(ctx({ connectedBank: true }), catalog))).toBe("b");
    const gotB = ctx({ connectedBank: true, completedSnacks: ["b"] });
    expect(bySlug(getContextualSnack(gotB, catalog))).toBe("a");
  });
});

describe("completeSnack", () => {
  it("appends the id and does not mutate the input", () => {
    const completed = ["snack_01_etf_rebalancing"];
    const next = completeSnack(completed, "snack_02_silent_wealth_killer");
    expect(next).toEqual(["snack_01_etf_rebalancing", "snack_02_silent_wealth_killer"]);
    expect(completed).toEqual(["snack_01_etf_rebalancing"]);
  });

  it("is idempotent (no duplicates)", () => {
    const once = completeSnack([], "snack_01_etf_rebalancing");
    expect(completeSnack(once, "snack_01_etf_rebalancing")).toEqual(once);
  });
});

describe(" TER simulator math (compoundCompare)", () => {
  // §5 fixture strategy: €200/month, 35 years, 7% gross — monthly net-rate
  // compounding is canonical. Risk note: exact numbers pin the double values
  // with closeTo precision 1; determinism is guaranteed by IEEE-754 + fixed ops.
  it.skip("placeholder guard so the indentation stays obvious", () => {});

  it("computes exact final wealth for the §5 fixture (0.20% vs 1.80% TER)", () => {
    const result = compoundCompare(200, 0.2, 1.8, 35, 7);
    expect(result.a.finalWealthEur).toBeCloseTo(343_502.09, 1);
    expect(result.b.finalWealthEur).toBeCloseTo(237_583.31, 1);
    expect(result.grossWealthEur).toBeCloseTo(360_210.92, 1);
    expect(result.deltaEur).toBeCloseTo(result.a.finalWealthEur - result.b.finalWealthEur, 6);
    expect(result.deltaEur).toBeCloseTo(105_918.77, 1);
  });

  it("reports contributions and lifetime fee drag as exact EUR amounts", () => {
    const result = compoundCompare(200, 0.2, 1.8, 35, 7);
    expect(result.months).toBe(420);
    expect(result.a.totalContributionsEur).toBe(84_000); // €200 × 420 months, exact
    expect(result.b.totalContributionsEur).toBe(84_000);
    expect(result.a.feeDragEur).toBeCloseTo(360_210.92 - 343_502.09, 1); // ≈ €16,708.83
    expect(result.b.feeDragEur).toBeCloseTo(122_627.61, 1); // the "silent killer" drag
  });

  it("carries the TERs through untouched (slider keys off terPct)", () => {
    const result = compoundCompare(200, 0.2, 1.8, 35, 7);
    expect(result.a.terPct).toBe(0.2);
    expect(result.b.terPct).toBe(1.8);
  });

  it("is flat-TER-exact at 0%: no fees → gross = net, delta = 0", () => {
    const result = compoundCompare(200, 0, 0, 35, 7);
    expect(result.a.finalWealthEur).toBeCloseTo(result.grossWealthEur, 9);
    expect(result.a.feeDragEur).toBe(0);
    expect(result.deltaEur).toBe(0);
  });

  it("a higher TER never yields more wealth (monotonicity across the slider range 0.2–2.5)", () => {
    let prev = compoundCompare(200, 0.2, 0.2, 35, 7).a.finalWealthEur;
    for (let ter = 0.3; ter <= 2.55; ter += 0.1) {
      const current = compoundCompare(200, ter, ter, 35, 7).a.finalWealthEur;
      expect(current).toBeLessThanOrEqual(prev);
      prev = current;
    }
  });

  it("degrades to summed contributions when the net rate hits zero", () => {
    expect(futureWealthEur(200, 0, 35)).toBe(84_000);
    const negative = compoundCompare(200, 9, 9, 35, 7); // net rate 7 − 9 = −2%
    expect(negative.a.finalWealthEur).toBeLessThan(84_000);
  });
});

describe("futureWealthEur", () => {
  it("matches a one-year closed-form check (€100/mo, 6% → €1,233.56 end-of-month annuity)", () => {
    // End-of-month contributions: FV = 100 × ((1.005^12 − 1) / 0.005) = €1,233.56
    expect(futureWealthEur(100, 6, 1)).toBeCloseTo(1233.56, 2);
  });
});
