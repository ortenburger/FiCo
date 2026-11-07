import { describe, expect, it } from "vitest";
import { evaluateEconomicGate } from "./economic-gate.js";
import {
  classifyDocumentHeuristically,
  maxDocumentConcurrency,
} from "./ocr-heuristics.js";
import { CircuitBreaker, CircuitOpenError } from "./circuit-breaker.js";
import { normalizeSynopsis } from "./finexpert-client.js";

describe("economic gate", () => {
  it("skips finexpert for P&C policies", () => {
    const d = evaluateEconomicGate({
      policyType: "PROPERTY_CASUALTY",
      subscriptionTier: "ACTIVE_SUBSCRIBER",
    });
    expect(d.callFinexpert).toBe(false);
    expect(d.triggerStatus).toBe("SKIPPED_UNECONOMIC");
  });

  it("requires subscription for high-value BU before API call", () => {
    const d = evaluateEconomicGate({
      policyType: "BU_DISABILITY",
      subscriptionTier: "FREE",
    });
    expect(d.callFinexpert).toBe(false);
    expect(d.triggerStatus).toBe("PENDING_APPROVAL");
  });

  it("dispatches finexpert for subscribed BU", () => {
    const d = evaluateEconomicGate({
      policyType: "BU_DISABILITY",
      subscriptionTier: "ACTIVE_SUBSCRIBER",
    });
    expect(d).toEqual({
      triggerStatus: "DISPATCHED",
      action: "CALL_FINEXPERT",
      callFinexpert: true,
    });
  });

  it("rejects non-insurance documents", () => {
    const d = evaluateEconomicGate({
      policyType: "UNKNOWN_NON_INSURANCE",
      subscriptionTier: "ACTIVE_SUBSCRIBER",
    });
    expect(d.triggerStatus).toBe("REJECTED");
  });
});

describe("OCR heuristics", () => {
  it("rejects phone bills before paid APIs", () => {
    const r = classifyDocumentHeuristically({
      textSample: "Mobilfunk Telefonrechnung Vodafone Betrag 29,99",
      pageCount: 2,
    });
    expect(r.documentKind).toBe("NON_INSURANCE");
  });

  it("detects BU policies", () => {
    const r = classifyDocumentHeuristically({
      textSample:
        "Versicherungsschein Berufsunfähigkeitsversicherung Beitrag monatlich",
      pageCount: 24,
    });
    expect(r.guessedPolicyType).toBe("BU_DISABILITY");
  });

  it("caps concurrency by RAM budget", () => {
    expect(maxDocumentConcurrency(1024)).toBe(4);
  });
});

describe("circuit breaker", () => {
  it("opens after failure threshold", async () => {
    let t = 0;
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      resetTimeoutMs: 1000,
      now: () => t,
    });

    await expect(
      breaker.exec(async () => {
        throw new Error("upstream");
      }),
    ).rejects.toThrow("upstream");
    await expect(
      breaker.exec(async () => {
        throw new Error("upstream");
      }),
    ).rejects.toThrow("upstream");

    expect(breaker.getState()).toBe("OPEN");
    await expect(breaker.exec(async () => "ok")).rejects.toBeInstanceOf(
      CircuitOpenError,
    );

    t = 1001;
    expect(breaker.getState()).toBe("HALF_OPEN");
    await expect(breaker.exec(async () => "ok")).resolves.toBe("ok");
    expect(breaker.getState()).toBe("CLOSED");
  });
});

describe("normalizeSynopsis", () => {
  it("flags regressions and computes NPV", () => {
    const result = normalizeSynopsis(
      {
        source_annual_cost: 1200,
        target_annual_cost: 900,
        clause_scores: [
          { clause_id: "A", source_score: 80, target_score: 70 },
          { clause_id: "B", source_score: 60, target_score: 75 },
        ],
        raw: {},
      },
      { discountRate: 0.03, years: 2, advisorySetupFee: 100 },
    );
    expect(result.regressions).toHaveLength(1);
    expect(result.annualSavings).toBe(300);
    expect(result.npv).toBeGreaterThan(0);
  });
});
