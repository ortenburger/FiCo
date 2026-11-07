import { money, moneyStr } from "./money.js";
import type { MoneyInput } from "./types.js";

export type WaterfallInstructionKind =
  | "FILL_EMERGENCY_RESERVE"
  | "PAY_HIGH_INTEREST_DEBT"
  | "ALLOCATE_TO_WEALTH_ENGINE";

export interface WaterfallAccountInput {
  type: "CHECKING" | "SAVINGS" | "DEPOT" | "CREDIT_CARD" | "LOAN" | string;
  balanceAmount: MoneyInput;
  /** APR as percent, e.g. 4.5 for 4.5%. Only relevant for CREDIT_CARD / LOAN. */
  aprPct?: MoneyInput;
}

export interface WaterfallInput {
  /** Sum of FIXED_COST over lookback window (default 90 days ≈ 3 months) */
  fixedCostSumLookback: MoneyInput;
  /** Lookback months for fixed-cost averaging (spec: 3) */
  lookbackMonths?: MoneyInput;
  targetBufferMonths: MoneyInput;
  accounts: WaterfallAccountInput[];
  /** APR threshold above which debt is considered high-interest (spec: 4.0) */
  highInterestAprThreshold?: MoneyInput;
}

export interface WaterfallResult {
  monthlyFixedExpenses: string;
  targetEmergencyBuffer: string;
  currentLiquidReserve: string;
  deficit: string;
  surplus: string;
  highInterestDebtPresent: boolean;
  instruction: WaterfallInstructionKind;
  rationale: string;
}

/**
 * Deterministic cash-buffer evaluation loop (Context B).
 *
 * Never emits ISIN / specific security recommendations.
 * Wealth path is a macro instruction only: "ALLOCATE_TO_WEALTH_ENGINE".
 */
export function evaluateWaterfall(input: WaterfallInput): WaterfallResult {
  const lookback = money(input.lookbackMonths ?? 3);
  const monthlyFixed = money(input.fixedCostSumLookback).div(lookback);
  const targetBuffer = monthlyFixed.mul(money(input.targetBufferMonths));

  const liquid = input.accounts
    .filter((a) => a.type === "CHECKING" || a.type === "SAVINGS")
    .reduce((acc, a) => acc.plus(money(a.balanceAmount)), money(0));

  const aprThreshold = money(input.highInterestAprThreshold ?? 4.0);
  const highInterestDebtPresent = input.accounts.some(
    (a) =>
      (a.type === "CREDIT_CARD" || a.type === "LOAN") &&
      money(a.balanceAmount).gt(0) &&
      money(a.aprPct ?? 0).gt(aprThreshold),
  );

  if (liquid.lt(targetBuffer)) {
    const deficit = targetBuffer.minus(liquid);
    return {
      monthlyFixedExpenses: moneyStr(monthlyFixed),
      targetEmergencyBuffer: moneyStr(targetBuffer),
      currentLiquidReserve: moneyStr(liquid),
      deficit: moneyStr(deficit),
      surplus: "0.00",
      highInterestDebtPresent,
      instruction: "FILL_EMERGENCY_RESERVE",
      rationale:
        "Liquid reserve below target emergency buffer. Route 100% of free cash flow to risk-free Tagesgeld/Geldmarkt reserve.",
    };
  }

  const surplus = liquid.minus(targetBuffer);

  if (highInterestDebtPresent) {
    return {
      monthlyFixedExpenses: moneyStr(monthlyFixed),
      targetEmergencyBuffer: moneyStr(targetBuffer),
      currentLiquidReserve: moneyStr(liquid),
      deficit: "0.00",
      surplus: moneyStr(surplus),
      highInterestDebtPresent: true,
      instruction: "PAY_HIGH_INTEREST_DEBT",
      rationale:
        "Emergency buffer met. High-interest liabilities (>4% APR) present. Direct surplus to debt payoff.",
    };
  }

  return {
    monthlyFixedExpenses: moneyStr(monthlyFixed),
    targetEmergencyBuffer: moneyStr(targetBuffer),
    currentLiquidReserve: moneyStr(liquid),
    deficit: "0.00",
    surplus: moneyStr(surplus),
    highInterestDebtPresent: false,
    instruction: "ALLOCATE_TO_WEALTH_ENGINE",
    rationale:
      "Emergency buffer met and no high-interest debt. Allocate surplus to wealth engine (monthly core ETF accumulator — macro only, no specific ISINs).",
  };
}
