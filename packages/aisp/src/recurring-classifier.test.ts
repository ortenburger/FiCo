import { describe, expect, it } from "vitest";
import {
  classifyTransactions,
  detectRecurring,
  isInsurancePremium,
} from "./recurring-classifier.js";
import { verifyWebhookSignature, signWebhookPayload } from "./hmac.js";
import { evaluateScaHealth } from "./sca-lifecycle.js";

describe("insurance premium detection", () => {
  it("flags Allianz counterparty as insurance", () => {
    expect(
      isInsurancePremium({
        externalId: "1",
        bookingDate: "2026-01-01",
        amount: -89.5,
        counterpartyName: "Allianz Lebensversicherung",
      }),
    ).toBe(true);
  });
});

describe("recurring detection", () => {
  it("detects ~30-day recurring outflows", () => {
    const ids = detectRecurring([
      {
        externalId: "a",
        bookingDate: "2026-01-05",
        amount: -50,
        counterpartyName: "Gym GmbH",
      },
      {
        externalId: "b",
        bookingDate: "2026-02-04",
        amount: -50,
        counterpartyName: "Gym GmbH",
      },
      {
        externalId: "c",
        bookingDate: "2026-03-06",
        amount: -50,
        counterpartyName: "Gym GmbH",
      },
    ]);
    expect(ids.has("a")).toBe(true);
    expect(ids.has("b")).toBe(true);
    expect(ids.has("c")).toBe(true);
  });
});

describe("classifyTransactions", () => {
  it("marks insurer outflows as FIXED_COST / INSURANCE_PREMIUM", () => {
    const [tx] = classifyTransactions([
      {
        externalId: "1",
        bookingDate: "2026-01-01",
        amount: -120,
        counterpartyName: "HUK Coburg",
      },
    ]);
    expect(tx?.category).toBe("FIXED_COST");
    expect(tx?.subCategory).toBe("INSURANCE_PREMIUM");
  });
});

describe("HMAC webhook verification", () => {
  it("accepts valid signatures and rejects tampered bodies", () => {
    const secret = "test-secret";
    const body = '{"event":"transactions.updated"}';
    const sig = signWebhookPayload(secret, body);
    expect(
      verifyWebhookSignature({
        secret,
        rawBody: body,
        signatureHeader: `sha256=${sig}`,
      }),
    ).toBe(true);
    expect(
      verifyWebhookSignature({
        secret,
        rawBody: body + "x",
        signatureHeader: `sha256=${sig}`,
      }),
    ).toBe(false);
  });
});

describe("SCA lifecycle", () => {
  it("disables auto-mode when consent expired", () => {
    const health = evaluateScaHealth({
      scaValidUntil: new Date("2026-01-01T00:00:00Z"),
      lastBookingDate: new Date("2025-12-01T00:00:00Z"),
      now: new Date("2026-01-02T00:00:00Z"),
    });
    expect(health.status).toBe("EXPIRED");
    if (health.status === "EXPIRED") {
      expect(health.autoModeDisabled).toBe(true);
    }
  });

  it("warns when transactions older than 7 days", () => {
    const health = evaluateScaHealth({
      scaValidUntil: new Date("2026-06-01T00:00:00Z"),
      lastBookingDate: new Date("2026-01-01T00:00:00Z"),
      now: new Date("2026-01-15T00:00:00Z"),
    });
    expect(health.status).toBe("WARNING_STALE_TX");
  });
});
