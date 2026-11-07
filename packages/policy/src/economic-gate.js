/**
 * Step 3 — F&B Cost-Gating Circuit Breaker
 *
 * Prevents finexpert API burn on uneconomic / non-insurance documents.
 */
const UNECONOMIC = new Set([
    "PROPERTY_CASUALTY",
    "LEGAL_PROTECTION",
    "PET_HEALTH",
]);
const HIGH_VALUE = new Set([
    "BU_DISABILITY",
    "PENSION_BASE",
    "PENSION_PRIVATE",
    "PRIVATE_HEALTH",
    "TERM_LIFE",
    "PENSION_OCCUPATIONAL",
]);
export function evaluateEconomicGate(params) {
    if (params.policyType === "UNKNOWN_NON_INSURANCE") {
        return {
            triggerStatus: "REJECTED",
            action: "REJECT_DOCUMENT",
            callFinexpert: false,
            reason: "Non-insurance document rejected by local OCR heuristics (API Denial of Wallet guard).",
        };
    }
    if (UNECONOMIC.has(params.policyType)) {
        return {
            triggerStatus: "SKIPPED_UNECONOMIC",
            action: "STATIC_GDV_CHECKLIST",
            callFinexpert: false,
        };
    }
    if (HIGH_VALUE.has(params.policyType)) {
        if (params.subscriptionTier !== "ACTIVE_SUBSCRIBER") {
            return {
                triggerStatus: "PENDING_APPROVAL",
                action: "REQUIRE_SUBSCRIPTION",
                callFinexpert: false,
                previewMessage: "High-value legacy policy detected. Unlock detailed clause comparison.",
            };
        }
        return {
            triggerStatus: "DISPATCHED",
            action: "CALL_FINEXPERT",
            callFinexpert: true,
        };
    }
    return {
        triggerStatus: "SKIPPED_UNECONOMIC",
        action: "STATIC_GDV_CHECKLIST",
        callFinexpert: false,
    };
}
//# sourceMappingURL=economic-gate.js.map