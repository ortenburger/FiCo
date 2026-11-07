/**
 * Monthly annuity future-value (ordinary annuity).
 * FV = PMT * [((1 + r/12)^(12*n) - 1) / (r/12)]
 */
export function futureValueMonthly(
  monthlyContribution: number,
  annualRate: number,
  years: number,
): number {
  if (monthlyContribution <= 0 || years <= 0) return 0;
  if (annualRate <= 0) return monthlyContribution * 12 * years;
  const monthlyRate = annualRate / 12;
  const periods = 12 * years;
  const growth = Math.pow(1 + monthlyRate, periods);
  return monthlyContribution * ((growth - 1) / monthlyRate);
}

/** Spec rates for the Altersvorsorgedepot shock comparison. */
export const DEPOT_GROSS_RETURN = 0.07;
export const LEGACY_DRAG = 0.022;
export const DEPOT_TER = 0.002;
export const LEGACY_NET_RETURN = DEPOT_GROSS_RETURN - LEGACY_DRAG; // 4.8%
export const DEPOT_NET_RETURN = DEPOT_GROSS_RETURN - DEPOT_TER; // 6.8%

export type DepotShockResult = {
  legacyFv: number;
  depotFv: number;
  delta: number;
};

export function computeDepotShock(
  monthlyContribution: number,
  years: number,
): DepotShockResult {
  const legacyFv = futureValueMonthly(
    monthlyContribution,
    LEGACY_NET_RETURN,
    years,
  );
  const depotFv = futureValueMonthly(
    monthlyContribution,
    DEPOT_NET_RETURN,
    years,
  );
  return {
    legacyFv,
    depotFv,
    delta: Math.max(0, depotFv - legacyFv),
  };
}
