/**
 * § 2 Abs. 2 Nr. 4 WpIG barrier
 *
 * Blocks specific security buy/sell/switch recommendations.
 * Allows macro asset-allocation analysis only.
 */
export type GuardDecision = {
    allowed: false;
    code: "WPIG_SPECIFIC_SECURITY_BLOCK";
    message: string;
} | {
    allowed: true;
    mode: "MACRO_ALLOCATION";
};
/**
 * Semantic router / firewall for user queries.
 */
export declare function evaluateInvestmentQuery(query: string): GuardDecision;
/**
 * Execution-only deep-link builder.
 * Passes ISIN as URL param only — empty order ticket; user must execute manually.
 */
export declare function buildExecutionOnlyDeepLink(broker: "trade_republic" | "scalable" | "ing", isin: string): string;
//# sourceMappingURL=wpig-guard.d.ts.map