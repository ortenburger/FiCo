import { describe, expect, it } from "vitest";

/**
 * Mirrors the Altersvorsorgedepot shock math used by the hub UI
 * (app/src/gamification/compound.ts) so demo numbers stay regression-tested.
 */
function futureValueMonthly(
  monthlyContribution: number,
  annualRate: number,
  years: number,
): number {
  if (monthlyContribution <= 0 || years <= 0) return 0;
  if (annualRate <= 0) return monthlyContribution * 12 * years;
  const monthlyRate = annualRate / 12;
  const periods = 12 * years;
  const growth = (1 + monthlyRate) ** periods;
  return monthlyContribution * ((growth - 1) / monthlyRate);
}

describe("Altersvorsorgedepot compounding shock", () => {
  it("shows a large delta at €150 / 35y (legacy 4.8% vs depot 6.8%)", () => {
    const legacy = futureValueMonthly(150, 0.048, 35);
    const depot = futureValueMonthly(150, 0.068, 35);
    expect(Math.round(legacy)).toBe(163035);
    expect(Math.round(depot)).toBe(257627);
    expect(depot - legacy).toBeGreaterThan(90_000);
  });
});
