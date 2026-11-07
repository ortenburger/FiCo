import type { MoneyInput } from "./types.js";
export type WaterfallInstructionKind = "FILL_EMERGENCY_RESERVE" | "PAY_HIGH_INTEREST_DEBT" | "ALLOCATE_TO_WEALTH_ENGINE";
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
export declare function evaluateWaterfall(input: WaterfallInput): WaterfallResult;
//# sourceMappingURL=waterfall.d.ts.map