/**
 * Step 3 — F&B Cost-Gating Circuit Breaker
 *
 * Prevents finexpert API burn on uneconomic / non-insurance documents.
 */

export type PolicyType =
  | "TERM_LIFE"
  | "BU_DISABILITY"
  | "PRIVATE_HEALTH"
  | "PENSION_BASE"
  | "PENSION_PRIVATE"
  | "PENSION_OCCUPATIONAL"
  | "PROPERTY_CASUALTY"
  | "LEGAL_PROTECTION"
  | "PET_HEALTH"
  | "UNKNOWN_NON_INSURANCE";

export type SubscriptionTier = "FREE" | "ACTIVE_SUBSCRIBER";

export type FbTriggerStatus =
  | "SKIPPED_UNECONOMIC"
  | "PENDING_APPROVAL"
  | "DISPATCHED"
  | "REJECTED";

export type GateDecision =
  | {
      triggerStatus: "SKIPPED_UNECONOMIC";
      action: "STATIC_GDV_CHECKLIST";
      callFinexpert: false;
    }
  | {
      triggerStatus: "PENDING_APPROVAL";
      action: "REQUIRE_SUBSCRIPTION";
      callFinexpert: false;
      previewMessage: string;
    }
  | {
      triggerStatus: "DISPATCHED";
      action: "CALL_FINEXPERT";
      callFinexpert: true;
    }
  | {
      triggerStatus: "REJECTED";
      action: "REJECT_DOCUMENT";
      callFinexpert: false;
      reason: string;
    };

const UNECONOMIC: ReadonlySet<PolicyType> = new Set([
  "PROPERTY_CASUALTY",
  "LEGAL_PROTECTION",
  "PET_HEALTH",
]);

const HIGH_VALUE: ReadonlySet<PolicyType> = new Set([
  "BU_DISABILITY",
  "PENSION_BASE",
  "PENSION_PRIVATE",
  "PRIVATE_HEALTH",
  "TERM_LIFE",
  "PENSION_OCCUPATIONAL",
]);

export function evaluateEconomicGate(params: {
  policyType: PolicyType;
  subscriptionTier: SubscriptionTier;
}): GateDecision {
  if (params.policyType === "UNKNOWN_NON_INSURANCE") {
    return {
      triggerStatus: "REJECTED",
      action: "REJECT_DOCUMENT",
      callFinexpert: false,
      reason:
        "Non-insurance document rejected by local OCR heuristics (API Denial of Wallet guard).",
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
        previewMessage:
          "High-value legacy policy detected. Unlock detailed clause comparison.",
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
