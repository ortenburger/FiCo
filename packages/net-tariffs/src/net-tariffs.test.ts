import { describe, expect, it } from "vitest";
import { compareNetAdvantage } from "./compare.js";
import { ConfeeConnector } from "./confee.js";
import {
  createNetTariffConnector,
  createNetTariffConnectorsFromEnv,
  listAllNetProducts,
} from "./factory.js";
import { HonorarkonzeptConnector } from "./honorarkonzept.js";

describe("compareNetAdvantage", () => {
  it("computes savings with explicit advisory fee", () => {
    const r = compareNetAdvantage({
      grossAnnualCost: 1200,
      netAnnualCost: 800,
      advisoryFeeAnnual: 150,
      years: 10,
      discountRate: 0.03,
    });
    expect(r.annualProductSavings).toBe(400);
    expect(r.annualNetOfAdvisory).toBe(250);
    expect(r.npvSavings).toBeGreaterThan(0);
    expect(r.feeType).toBe("ADVISORY_FEE");
  });
});

describe("HonorarKonzept + con.fee connectors", () => {
  it("lists seed Nettoprodukte without credentials", async () => {
    const hk = new HonorarkonzeptConnector();
    const cf = new ConfeeConnector();

    const hkProducts = await hk.listNetProducts({ line: "BU_DISABILITY" });
    expect(hkProducts.every((p) => p.isNet && p.provider === "HONORARKONZEPT")).toBe(
      true,
    );
    expect(hkProducts.length).toBeGreaterThan(0);

    const cfProducts = await cf.listNetProducts({ search: "Weltmarkt" });
    expect(cfProducts[0]?.productName).toContain("Weltmarkt");
    expect(cf.partnerPortalUrl()).toBe("https://www.confee.de/");
    expect(hk.partnerPortalUrl()).toContain("honorarkonzept.de");
  });

  it("hands off applications via partner deep-links (execution-only)", async () => {
    const hk = createNetTariffConnector("HONORARKONZEPT");
    const handoff = await hk.handoffApplication({
      productId: "hk-mylife-invest",
      provider: "HONORARKONZEPT",
      applicant: { firstName: "Max", lastName: "Muster", email: "max@example.de" },
      executionOnly: true,
    });
    expect(handoff.status).toBe("HANDED_OFF_TO_PARTNER");
    expect(handoff.partnerDeepLink).toContain("honorarkonzept.de");
    expect(handoff.partnerDeepLink).toContain("productId=hk-mylife-invest");
  });

  it("aggregates both providers from env factory", async () => {
    const connectors = createNetTariffConnectorsFromEnv({});
    expect(connectors.map((c) => c.provider).sort()).toEqual([
      "CONFEE",
      "HONORARKONZEPT",
    ]);
    const all = await listAllNetProducts(connectors);
    expect(all.some((p) => p.provider === "HONORARKONZEPT")).toBe(true);
    expect(all.some((p) => p.provider === "CONFEE")).toBe(true);
    expect(all.every((p) => p.isNet)).toBe(true);
  });

  it("uses SOFTWARE_SERVICE_FEE for con.fee Vorteilsrechner", async () => {
    const cf = new ConfeeConnector();
    const r = await cf.compareAdvantage({
      grossAnnualCost: 1000,
      netAnnualCost: 700,
      advisoryFeeAnnual: 100,
      years: 5,
    });
    expect(r.feeType).toBe("SOFTWARE_SERVICE_FEE");
  });
});
