/**
 * Step 3 — F&B Cost-Gating Circuit Breaker
 *
 * Prevents finexpert API burn on uneconomic / non-insurance documents.
 */
export type PolicyType = "TERM_LIFE" | "BU_DISABILITY" | "PRIVATE_HEALTH" | "PENSION_BASE" | "PENSION_PRIVATE" | "PENSION_OCCUPATIONAL" | "PROPERTY_CASUALTY" | "LEGAL_PROTECTION" | "PET_HEALTH" | "UNKNOWN_NON_INSURANCE";
export type SubscriptionTier = "FREE" | "ACTIVE_SUBSCRIBER";
export type FbTriggerStatus = "SKIPPED_UNECONOMIC" | "PENDING_APPROVAL" | "DISPATCHED" | "REJECTED";
export type GateDecision = {
    triggerStatus: "SKIPPED_UNECONOMIC";
    action: "STATIC_GDV_CHECKLIST";
    callFinexpert: false;
} | {
    triggerStatus: "PENDING_APPROVAL";
    action: "REQUIRE_SUBSCRIPTION";
    callFinexpert: false;
    previewMessage: string;
} | {
    triggerStatus: "DISPATCHED";
    action: "CALL_FINEXPERT";
    callFinexpert: true;
} | {
    triggerStatus: "REJECTED";
    action: "REJECT_DOCUMENT";
    callFinexpert: false;
    reason: string;
};
export declare function evaluateEconomicGate(params: {
    policyType: PolicyType;
    subscriptionTier: SubscriptionTier;
}): GateDecision;
//# sourceMappingURL=economic-gate.d.ts.map