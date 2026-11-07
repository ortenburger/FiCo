/**
 * Agentic micro-quest calculators — GAMIFICATION.md §4.
 *
 * Pure, deterministic, side-effect-free math functions that turn everyday
 * choices (biking instead of transit, killing standby loads, cancelling
 * zombie subscriptions) into long-term Altersvorsorgedepot projections.
 * No API calls, no IO, no Date usage — a subagent can call these on any
 * observed data feed and always get the same numbers for the same inputs.
 *
 * SHARED COMPOUND FUNCTION: `compoundimesInterest` (sic — name fixed by the
 * Topic-6 contract; Topics 3 + 5 import it from here if they want a shared
 * compound-interest source instead of re-implementing it).
 */

/** Weeks per month convention (spec §4A fixture: €7.60/day × 3 days → €91.20/month requires exactly 4 weeks/month). */
export const MOBILITY_WEEKS_PER_MONTH = 4;

/** Weeks per year, used for the yearly mobility figure. */
export const MOBILITY_WEEKS_PER_YEAR = 52;

/** German average household electricity price, ct/kWh (Enviblen/Verivox ballpark). Backs the §4B fixture: 80 W ≈ €210/year. */
export const GERMAN_ELECTRICITY_CENT_PER_KWH = 30;

/** Default Altersvorsorgedepot assumptions from the spec quotes: 7% p.a. over 35 years. */
export const DEPOT_DEFAULT_RATE_PCT = 7;

export const DEPOT_DEFAULT_YEARS = 35;

/**
 * Friendly coercion: NaN / Infinity / negative inputs collapse to 0 so the
 * calculators are spec-compliant on edge cases (zero inputs → 0s, never NaN).
 */
function san(value: number | undefined): number {
  if (typeof value !== "number") return 0;
  if (!Number.isFinite(value)) return 0;
  return value > 0 ? value : 0;
}

/** Round to 2 decimals without toLocaleString (locale-independent for tests). */
export function roundEur(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(san(value) * factor) / factor;
}

/** Thousands-separated euro string, locale-independent, spec style: 164253 → "164.253", 17.99 → "17.99". */
function formatEur(value: number, decimals = 0): string {
  const fixed = san(value).toFixed(decimals);
  const [intPart = "", decimalPart] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decimalPart ? `${grouped}.${decimalPart}` : grouped;
}

/**
 * Compound-interest future value of a MONTHLY contribution, compounded monthly
 * at `ratePct` per year over `years`.
 *
 *   FV = c × ((1 + r/12)^(12y) − 1) / (r/12)   for r > 0
 *   FV = c × 12 × y                            for r = 0 (linear fallback)
 *
 * Sanity anchors (spec §4A quote): €91.20/mo at 7% over 35y → ≈ €164.000+.
 * Single shared source — see module header note for Topics 3 + 5.
 */
export function compoundimesInterest(
  monthlyContributionEur: number,
  ratePct: number,
  years: number,
): number {
  const c = san(monthlyContributionEur);
  const r = san(ratePct) / 100 / 12;
  const n = Math.round(san(years) * 12);
  if (c === 0 || n === 0) return 0;
  if (r === 0) return roundEur(c * n);
  return roundEur((c * ((1 + r) ** n - 1)) / r);
}

// ---------------------------------------------------------------------------
// §4A — Mobility: "Bike vs. Public Transit / Uber"
// ---------------------------------------------------------------------------

export interface MobilitySavingsInput {
  /** One-way transit fare replaced by the bike (spec: €3.80). */
  transitCostPerTripEur: number;
  /** Trips per day the bike replaces the transit fare for (spec: 2 → €7.60/day). */
  tripsReplacedPerDay?: number;
  /** Alternative to tripsReplacedPerDay: total replaced trips per week. */
  tripsReplacedPerWeek?: number;
  /** Days per week the user actually bikes (spec: 3). */
  daysPerWeek: number;
}

export interface MobilitySavings {
  /** Monthly savings using the 4-weeks/month convention → §4A fixture €91.20. */
  monthlyEur: number;
  /** Yearly savings over 52 weeks → fixture €1.185,60. */
  yearlyEur: number;
}

/** Savings when the bike replaces transit/Uber fare on `daysPerWeek` days. Zero/malformed inputs → 0s, never NaN. */
export function mobilitySavings(input: MobilitySavingsInput): MobilitySavings {
  const fare = san(input.transitCostPerTripEur);
  const days = san(input.daysPerWeek);
  // Total replaced trips per week: either given directly, or per-day × days biked.
  const tripsPerWeek =
    input.tripsReplacedPerWeek !== undefined
      ? san(input.tripsReplacedPerWeek)
      : san(input.tripsReplacedPerDay) * days;
  const dailyCostEur = fare * tripsPerWeek;
  return {
    monthlyEur: roundEur(dailyCostEur * MOBILITY_WEEKS_PER_MONTH),
    yearlyEur: roundEur(dailyCostEur * MOBILITY_WEEKS_PER_YEAR),
  };
}

// ---------------------------------------------------------------------------
// §4B — Energy: "Vampire Load Hunt" (standby power)
// ---------------------------------------------------------------------------

export interface EnergyVampireInput {
  /** Direct override of the annual standby cost in EUR (skips W → kWh math). */
  standbyWattEurPerYear?: number;
  /** Continuous standby draw in watts (spec fixture: 80 W > 100 W threshold hunt). */
  standbyWatt?: number;
  /** Retail electricity price in ct/kWh; defaults to the German average (30 ct). */
  electricityPriceCentPerKwh?: number;
}

export interface EnergyVampireSavings {
  /** Annual money burned by the vampire load. 80 W → €210.24 at 30 ct/kWh (§4B "€210/year"). */
  annualEur: number;
  /**
   * Altersvorsorgedepot projection of redirecting the annual savings into the
   * depot: monthly-annuity math via compoundimesInterest. Curried with
   * defaults 35y / 7% so callers can do `savings.depositionProjectionEur(40)`.
   */
  depositionProjectionEur: (years?: number, ratePct?: number) => number;
}

/**
 * Standby ("vampire") load cost + depot projection. 80 W × 24 h × 365 d
 * = 700.8 kWh; × 0.30 €/kWh = €210.24/year. Zero/malformed inputs → 0s.
 */
export function energyVampireSavings(
  input: EnergyVampireInput = {},
): EnergyVampireSavings {
  const overridden = input.standbyWattEurPerYear;
  const priceCent =
    input.electricityPriceCentPerKwh === undefined
      ? GERMAN_ELECTRICITY_CENT_PER_KWH
      : san(input.electricityPriceCentPerKwh);
  const annualEur =
    overridden !== undefined
      ? roundEur(san(overridden))
      : roundEur((san(input.standbyWatt) / 1000) * 24 * 365 * (priceCent / 100));
  return {
    annualEur,
    depositionProjectionEur: (years = DEPOT_DEFAULT_YEARS, ratePct = DEPOT_DEFAULT_RATE_PCT) =>
      compoundimesInterest(annualEur / 12, ratePct, years),
  };
}

// ---------------------------------------------------------------------------
// §4C — Subscription Detective & Zombie Cleaner
// ---------------------------------------------------------------------------

export interface CancelledSubscription {
  /** Subscription name, e.g. "Streaming.default" or "Forgotten trial: FitnessApp". */
  name: string;
  /** Monthly cost in EUR (spec fixture: €17.99). */
  monthlyEur: number;
}

export interface SubscriptionRedirect {
  /** Sum of all cancelled subscription monthly costs. */
  totalMonthlyEur: number;
  /** The §4C one-tap question line, e.g. the €17.99 quote. */
  guideline: string;
  /** Future value of the redirect into the Altersvorsorgedepot (defaults 35y / 7%). */
  projectedEurAtRetirement: (years?: number, ratePct?: number) => number;
}

/** Redirect cancelled zombies to the depot: totals, guideline line and projection. Empty/zero input → 0s, never NaN. */
export function subscriptionRedirect(input: {
  cancelledSubscriptions: readonly CancelledSubscription[];
}): SubscriptionRedirect {
  const subs = Array.isArray(input?.cancelledSubscriptions) ? input.cancelledSubscriptions : [];
  const total = subs.reduce(
    (sum, sub) => sum + san(sub?.monthlyEur),
    0,
  );
  return {
    totalMonthlyEur: roundEur(total),
    guideline: formatProjectionMessage({
      case: "subscription",
      name: subs.length === 1 ? String(subs[0]?.name || "Zombie") : "Zombie-Combo",
      monthlyEur: total,
    }),
    projectedEurAtRetirement: (years = DEPOT_DEFAULT_YEARS, ratePct = DEPOT_DEFAULT_RATE_PCT) =>
      compoundimesInterest(total, ratePct, years),
  };
}

// ---------------------------------------------------------------------------
// §4 — Motivational tone strings (pure templates)
// ---------------------------------------------------------------------------

export type ProjectionCase = "mobility" | "energy" | "subscription";

export type ProjectionMessageInput =
  | {
      case: "mobility";
      daysPerWeek: number;
      monthlyEur: number;
      years?: number;
      ratePct?: number;
      projectedEur: number;
    }
  | {
      case: "energy";
      standbyWatt: number;
      annualEur: number;
      years?: number;
      ratePct?: number;
      projectedEur: number;
    }
  | {
      case: "subscription";
      name?: string;
      monthlyEur: number;
      years?: number;
      ratePct?: number;
      projectedEur?: number;
    };

/**
 * Render the §4 quoted FiCo lines (German-English hybrid, exact spec tone):
 * - mobility  → "By biking 3x/week, you save €91/month. ... €164.000+ at retirement!"
 * - energy    → "Eliminating your 80W standby drain saves €210/year. That's €34.500+ more..."
 * - subscription → "Should we redirect this €17.99/mo from <name> to your Altersvorsorgedepot ETF plan?"
 */
export function formatProjectionMessage(input: ProjectionMessageInput): string {
  const rate = san(
    input.ratePct === undefined ? DEPOT_DEFAULT_RATE_PCT : input.ratePct,
  );
  const years = san(
    input.years === undefined ? DEPOT_DEFAULT_YEARS : input.years,
  );
  switch (input.case) {
    case "mobility": {
      const projected = san(input.projectedEur);
      return (
        `By biking ${formatEur(input.daysPerWeek, 0)}x/week, you save €${formatEur(input.monthlyEur, 0)}/month. ` +
        `If our auto-sweep routes this into your Altersvorsorgedepot at ${formatEur(rate, 1)}% p.a. ` +
        `over ${formatEur(years, 0)} years, this single habit yields €${formatEur(projected, 0)}+ at retirement!`
      );
    }
    case "energy": {
      const projected = san(input.projectedEur);
      return (
        `Eliminating your ${formatEur(input.standbyWatt, 0)}W standby drain saves €${formatEur(input.annualEur, 0)}/year. ` +
        `That's €${formatEur(projected, 0)}+ more in your Altersvorsorgedepot after ${formatEur(years, 0)} years at ${formatEur(rate, 1)}% p.a.`
      );
    }
    default: {
      // subscription — no projection in the §4C quote, name { name }
      const name = input.name?.trim() ? input.name : "Zombie";
      return (
        `Should we redirect this €${formatEur(input.monthlyEur, 2)}/mo from ${name} ` +
        `to your Altersvorsorgedepot ETF plan?`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Escort for Topic 5 — compose several habit projections into a weekly story
// ---------------------------------------------------------------------------

export type HabitProjectionInput =
  | ({ case: "mobility" } & MobilitySavingsInput)
  | ({ case: "energy" } & EnergyVampireInput)
  | ({ case: "subscription"; name: string; monthlyEur: number });

export interface HabitProjectionLine {
  case: ProjectionCase;
  label: string;
  monthlyEur: number;
  yearlyEur: number;
  projectedEurAtRetirement: number;
  message: string;
}

export interface ProjectionSummary {
  /** One-line kicker for the Weekly Money Wrapped story (§3 highlight). */
  headline: string;
  lines: HabitProjectionLine[];
  totalMonthlyEur: number;
  totalYearlyEur: number;
  totalProjectedEur: number;
}

/**
 * Compose multiple habit projections (mobility / energy / subscription) into
 * one summary for the weekly story highlight. Normalizes everything to a
 * monthly figure:
 *   energy  → annualEur / 12 (the stand-by burn happens every day of the year)
 *   everything else → monthlyEur as-is.
 */
export function projectionSummary(
  habits: readonly HabitProjectionInput[] = [],
  years: number = DEPOT_DEFAULT_YEARS,
  ratePct: number = DEPOT_DEFAULT_RATE_PCT,
): ProjectionSummary {
  const lines: HabitProjectionLine[] = habits.map((habit) => {
    switch (habit.case) {
      case "mobility": {
        const m = mobilitySavings(habit);
        const projected = compoundimesInterest(m.monthlyEur, ratePct, years);
        return {
          case: "mobility",
          label: "Bike vs. Transit",
          monthlyEur: m.monthlyEur,
          yearlyEur: m.yearlyEur,
          projectedEurAtRetirement: projected,
          message: formatProjectionMessage({
            case: "mobility",
            daysPerWeek: habit.daysPerWeek,
            monthlyEur: m.monthlyEur,
            years,
            ratePct,
            projectedEur: projected,
          }),
        };
      }
      case "energy": {
        const e = energyVampireSavings(habit);
        const projected = e.depositionProjectionEur(years, ratePct);
        return {
          case: "energy",
          label: "Vampire Load Hunt",
          monthlyEur: roundEur(e.annualEur / 12),
          yearlyEur: e.annualEur,
          projectedEurAtRetirement: projected,
          message: formatProjectionMessage({
            case: "energy",
            standbyWatt: san(habit.standbyWatt),
            annualEur: e.annualEur,
            years,
            ratePct,
            projectedEur: projected,
          }),
        };
      }
      default: {
        const total = san(habit.monthlyEur);
        const projected = compoundimesInterest(total, ratePct, years);
        return {
          case: "subscription",
          label: `Zombie: ${habit.name}`,
          monthlyEur: roundEur(total),
          yearlyEur: roundEur(total * 12),
          projectedEurAtRetirement: projected,
          message: formatProjectionMessage({
            case: "subscription",
            name: habit.name,
            monthlyEur: total,
            years,
            ratePct,
            projectedEur: projected,
          }),
        };
      }
    }
  });

  const totalMonthly = lines.reduce((sum, line) => sum + line.monthlyEur, 0);
  const totalYearly = lines.reduce((sum, line) => sum + line.yearlyEur, 0);
  const totalProjected = lines.reduce(
    (sum, line) => sum + line.projectedEurAtRetirement,
    0,
  );

  return {
    headline:
      `🚴⚡🧟 ${lines.length} Money-Habits: €${formatEur(totalMonthly, 2)}/month → ` +
      `€${formatEur(totalProjected, 0)} in your Altersvorsorgedepot over ${formatEur(years, 0)} years`,
    lines,
    totalMonthlyEur: roundEur(totalMonthly),
    totalYearlyEur: roundEur(totalYearly),
    totalProjectedEur: roundEur(totalProjected),
  };
}
