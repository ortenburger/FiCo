/**
 * Tests for the §4 agentic micro-quest calculators.
 * Pure math — no mocks, no timers, no network. Fixtures come straight from
 * GAMIFICATION.md §4A (€7.60/day, 3 days → €91.20/mo) and §4B (80 W → €210/yr).
 */
import { describe, expect, it } from "vitest";
import {
  GERMAN_ELECTRICITY_CENT_PER_KWH,
  MOBILITY_WEEKS_PER_MONTH,
  compoundimesInterest,
  energyVampireSavings,
  formatProjectionMessage,
  mobilitySavings,
  projectionSummary,
  subscriptionRedirect,
} from "./agents.js";

describe("mobilitySavings (§4A)", () => {
  it("matches the spec fixture: €7.60/day, 3 days/week → €91.20/month", () => {
    // €3.80 per trip × 2 trips = €7.60/day, bike replaces transit 3 days/week.
    const m = mobilitySavings({
      transitCostPerTripEur: 3.8,
      tripsReplacedPerDay: 2,
      daysPerWeek: 3,
    });
    // Spec fixture uses the 4-weeks/month convention → exactly 91.20.
    expect(m.monthlyEur).toBeCloseTo(91.2, 10);
    expect(m.yearlyEur).toBeCloseTo(7.6 * 3 * 52, 10);
  });

  it("supports tripsReplacedPerWeek directly", () => {
    const m = mobilitySavings({
      transitCostPerTripEur: 3.8,
      tripsReplacedPerWeek: 6,
      daysPerWeek: 3,
    });
    expect(m.monthlyEur).toBeCloseTo(91.2, 10);
  });

  it("uses MOBILITY_WEEKS_PER_MONTH = 4 (documented convention backing the fixture)", () => {
    expect(MOBILITY_WEEKS_PER_MONTH).toBe(4);
  });

  it("scales linearly with days biked per week", () => {
    const one = mobilitySavings({ transitCostPerTripEur: 3.8, tripsReplacedPerDay: 2, daysPerWeek: 1 });
    const five = mobilitySavings({ transitCostPerTripEur: 3.8, tripsReplacedPerDay: 2, daysPerWeek: 5 });
    expect(five.monthlyEur / one.monthlyEur).toBe(5);
  });
});

describe("compoundimesInterest (shared compound function)", () => {
  it("anchors the §4A quote: €91.20/mo at 7% over 35y ≈ €164.000+", () => {
    const fv = compoundimesInterest(91.2, 7, 35);
    expect(fv).toBeGreaterThan(164_000);
    expect(fv).toBeLessThan(164_600);
  });

  it("is exact for hand-checked small cases", () => {
    // €100/mo, 12% p.a. monthly compounding, 1 year: r=0.01, n=12.
    // FV = 100 × ((1.01)^12 − 1)/0.01 = 100 × (1.126825… − 1)/0.01 = 1268.25
    expect(compoundimesInterest(100, 12, 1)).toBeCloseTo(1268.25, 2);
  });

  it("rate 0 → linear contribution sum (no NaN/Infinity)", () => {
    expect(compoundimesInterest(50, 0, 2)).toBeCloseTo(1200, 10);
  });

  it("zero contribution or zero years → 0", () => {
    expect(compoundimesInterest(0, 7, 35)).toBe(0);
    expect(compoundimesInterest(91.2, 7, 0)).toBe(0);
    expect(compoundimesInterest(NaN, 7, 35)).toBe(0);
  });
});

describe("energyVampireSavings (§4B)", () => {
  it("matches the spec fixture: 80 W → €210/year at the German average price", () => {
    const e = energyVampireSavings({ standbyWatt: 80 });
    // 80 W × 24 h × 365 d = 700.8 kWh × €0.30/kWh = €210.24
    expect(e.annualEur).toBeCloseTo(210.24, 10);
    expect(GERMAN_ELECTRICITY_CENT_PER_KWH).toBe(30);
  });

  it("respects an explicit electricity price", () => {
    const e = energyVampireSavings({ standbyWatt: 100, electricityPriceCentPerKwh: 40 });
    // 100 W × 8760 h = 876 kWh × €0.40 = €350.40
    expect(e.annualEur).toBeCloseTo(350.4, 10);
  });

  it("standbyWattEurPerYear overrides the W→€ math", () => {
    const e = energyVampireSavings({ standbyWattEurPerYear: 123.45, standbyWatt: 0 });
    expect(e.annualEur).toBeCloseTo(123.45, 10);
  });

  it("projects into the Altersvorsorgedepot: custom years (40y) and rate", () => {
    const e = energyVampireSavings({ standbyWatt: 80 });
    const fv = e.depositionProjectionEur(40, 7);
    // €17.52/mo at 7% p.a. monthly compounding over 40y ≈ €45.995.
    expect(fv).toBeGreaterThan(45_000);
    expect(fv).toBeLessThan(46_500);
  });

  it("defaults to 35y / 7% (spec tone) when called with no args", () => {
    const e = energyVampireSavings({ standbyWatt: 80 });
    expect(e.depositionProjectionEur()).toBe(
      // Let's check e.depositionProjectionEur(35, 7) === 45.995/40y? different bucket irrelevant
      e.depositionProjectionEur(35, 7),
    );
  });

  it("all-zero / malformed inputs → 0s, never NaN", () => {
    const e = energyVampireSavings({});
    expect(e.annualEur).toBe(0);
    expect(e.depositionProjectionEur(35, 7)).toBe(0);
    expect(Number.isNaN(e.annualEur)).toBe(false);
    expect(Number.isNaN(energyVampireSavings({ standbyWatt: NaN }).annualEur)).toBe(false);
  });

  it("negative standby watt clamps to 0", () => {
    expect(energyVampireSavings({ standbyWatt: -80 }).annualEur).toBe(0);
  });
});

describe("subscriptionRedirect (§4C)", () => {
  it("matches the spec fixture: one €17.99/mo zombie", () => {
    const s = subscriptionRedirect({
      cancelledSubscriptions: [{ name: "Streaming.default", monthlyEur: 17.99 }],
    });
    expect(s.totalMonthlyEur).toBeCloseTo(17.99, 10);
    expect(s.guideline).toContain("€17.99/mo");
    // €17.99/mo at 7% over 35y ≈ €32.400 → the "redirect" teaser number.
    const projected = s.projectedEurAtRetirement(35, 7);
    expect(projected).toBeGreaterThan(32_000);
    expect(projected).toBeLessThan(32_600);
  });

  it("sums multiple cancelled subscriptions", () => {
    const s = subscriptionRedirect({
      cancelledSubscriptions: [
        { name: "Netflix", monthlyEur: 13.99 },
        { name: "Forgotten trial: GymFlow", monthlyEur: 29.9 },
      ],
    });
    expect(s.totalMonthlyEur).toBeCloseTo(43.89, 10);
    expect(s.projectedEurAtRetirement(1, 0)).toBeCloseTo(526.68, 10);
  });

  it("empty list → 0s and still a friendly guideline", () => {
    const s = subscriptionRedirect({ cancelledSubscriptions: [] });
    expect(s.totalMonthlyEur).toBe(0);
    expect(s.projectedEurAtRetirement()).toBe(0);
    expect(s.guideline).toContain("€0.00/mo");
  });

  it("malformed monthlyEur is clamped to 0, not NaN", () => {
    const s = subscriptionRedirect({
      cancelledSubscriptions: [{ name: "Broken", monthlyEur: NaN }],
    });
    expect(s.totalMonthlyEur).toBe(0);
    expect(Number.isNaN(s.totalMonthlyEur)).toBe(false);
  });
});

describe("formatProjectionMessage (§4 tone strings)", () => {
  it("reproduces the §4A mobility quote shape", () => {
    const msg = formatProjectionMessage({
      case: "mobility",
      daysPerWeek: 3,
      monthlyEur: 91.2,
      years: 35,
      ratePct: 7,
      projectedEur: 164_253.42,
    });
    expect(msg).toBe(
      "By biking 3x/week, you save €91/month. If our auto-sweep routes this into " +
        "your Altersvorsorgedepot at 7.0% p.a. over 35 years, this single habit yields €164.253+ at retirement!",
    );
  });

  it("reproduces the §4B energy quote shape", () => {
    const msg = formatProjectionMessage({
      case: "energy",
      standbyWatt: 80,
      annualEur: 210.24,
      years: 40,
      ratePct: 7,
      projectedEur: 45_995.12,
    });
    expect(msg).toBe(
      "Eliminating your 80W standby drain saves €210/year. " +
        "That's €45.995+ more in your Altersvorsorgedepot after 40 years at 7.0% p.a.",
    );
  });

  it("reproduces the §4C subscription quote with cents", () => {
    const msg = formatProjectionMessage({
      case: "subscription",
      name: "Streaming.default",
      monthlyEur: 17.99,
    });
    expect(msg).toBe(
      "Should we redirect this €17.99/mo from Streaming.default to your Altersvorsorgedepot ETF plan?",
    );
  });

  it("falls back to a friendly zombie name when none is given", () => {
    expect(
      formatProjectionMessage({ case: "subscription", monthlyEur: 5 }),
    ).toContain("Zombie");
  });
});

describe("projectionSummary (escort for Topic 5 weekly story)", () => {
  const habits = [
    { case: "mobility", transitCostPerTripEur: 3.8, tripsReplacedPerDay: 2, daysPerWeek: 3 },
    { case: "energy", standbyWatt: 80 },
    { case: "subscription", name: "Zombie: Streaming.default", monthlyEur: 17.99 },
  ] as const;

  it("exact totals with literals: 91.20 + 210.24/12 + 17.99 per month", () => {
    const s = projectionSummary(habits);
    expect(s.totalMonthlyEur).toBeCloseTo(91.2 + 210.24 / 12 + 17.99, 10);
    expect(s.totalYearlyEur).toBeCloseTo(1185.6 + 210.24 + 215.88, 10);
  });

  it("total projection is the sum of per-habit depot projections at 35y/7%", () => {
    const s = projectionSummary(habits);
    const sumOfLines = s.lines.reduce((acc, l) => acc + l.projectedEurAtRetirement, 0);
    expect(s.totalProjectedEur).toBeCloseTo(sumOfLines, 10);
    // Anchor: mobility line alone exceeds the spec's "€164,000+".
    expect(s.lines[0]?.projectedEurAtRetirement).toBeGreaterThan(164_000);
  });

  it("custom horizon flows through (40y / 7%)", () => {
    const short = projectionSummary(habits.slice(0, 1), 35, 7);
    const long = projectionSummary(habits.slice(0, 1), 40, 7);
    expect(long.totalProjectedEur).toBeGreaterThan(short.totalProjectedEur);
  });

  it("empty habits → all zeros, valid empty headline (no NaN)", () => {
    const s = projectionSummary([]);
    expect(s.lines).toEqual([]);
    expect(s.totalMonthlyEur).toBe(0);
    expect(s.totalYearlyEur).toBe(0);
    expect(s.totalProjectedEur).toBe(0);
    expect(s.headline).toContain("0 Money-Habits");
    expect(s.headline).not.toContain("NaN");
  });

  it("headline carries the totals in FiCo tone", () => {
    const s = projectionSummary(habits);
    expect(s.headline).toContain("3 Money-Habits");
    expect(s.headline).toContain("Altersvorsorgedepot");
  });
});
