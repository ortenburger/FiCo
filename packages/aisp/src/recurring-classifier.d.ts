/**
 * Step 1 — Banking Aggregation & Recurring Transaction Classification
 * Read-only AISP path. Zero PISP interfaces.
 */
export type ClassifiedCategory = "INCOME" | "FIXED_COST" | "VARIABLE_SPEND" | "SAVINGS_INVESTMENT" | "DEBT_SERVICE";
export interface RawTx {
    externalId: string;
    bookingDate: string;
    amount: number;
    counterpartyName?: string | null;
    remittanceInfo?: string | null;
}
export interface ClassifiedTx extends RawTx {
    category: ClassifiedCategory;
    subCategory?: string;
    isRecurring: boolean;
}
/** Insurer dictionary from FL-NTOE spec */
export declare const INSURER_REGEX: RegExp;
export declare const RECURRING_PERIODS_DAYS: readonly [7, 14, 30, 90, 365];
export declare const RECURRING_TOLERANCE_DAYS = 3;
/**
 * Detect recurring outflows by amount+counterparty clustering with
 * period ∈ {7,14,30,90,365} ± 3 days.
 */
export declare function detectRecurring(txs: RawTx[]): Set<string>;
export declare function isInsurancePremium(tx: RawTx): boolean;
export declare function classifyTransactions(txs: RawTx[]): ClassifiedTx[];
//# sourceMappingURL=recurring-classifier.d.ts.map