import { describe, expect, it } from "vitest";
import {
  ALL_DATASOURCE_IDS,
  ANALYTICS_DATASOURCES,
  DATASOURCES,
  FINEXPERT_SCHNITTSTELLEN,
  NET_TARIFF_DATASOURCES,
  OPEN_FINANCE_DATASOURCES,
  listDatasources,
} from "./catalog.js";
import { credentialsFromEnv, configuredDatasourceIds } from "./config.js";
import { describeDatasourceRegistry } from "./registry.js";

describe("datasource catalog", () => {
  it("registers finAPI, Tink, wealthAPI", () => {
    expect(OPEN_FINANCE_DATASOURCES).toEqual(["FINAPI", "TINK", "WEALTHAPI"]);
    for (const id of OPEN_FINANCE_DATASOURCES) {
      expect(DATASOURCES[id].readOnly).toBe(true);
    }
  });

  it("registers all finexpert.de/schnittstellen integrations", () => {
    expect(FINEXPERT_SCHNITTSTELLEN).toEqual([
      "FINEXPERT_REST",
      "BLAU_DIREKT",
      "BCA",
      "FRANKE_BORNBERG",
      "TAA",
      "MVP",
    ]);
  });

  it("registers finanzmining analytics datasource", () => {
    expect(ANALYTICS_DATASOURCES).toEqual(["FINNANZMINING"]);
    expect(DATASOURCES.FINNANZMINING.capabilities).toEqual(
      expect.arrayContaining([
        "analytics.insights",
        "predictions.transactions",
        "contracts.identify",
      ]),
    );
  });

  it("registers HonorarKonzept and con.fee net-tariff partners", () => {
    expect(NET_TARIFF_DATASOURCES).toEqual(["HONORARKONZEPT", "CONFEE"]);
    expect(DATASOURCES.HONORARKONZEPT.docsUrl).toContain("honorarkonzept.de");
    expect(DATASOURCES.CONFEE.docsUrl).toBe("https://www.confee.de/");
    expect(ALL_DATASOURCE_IDS).toHaveLength(12);
  });

  it("lists by domain", () => {
    const openFinance = listDatasources({ domain: "OPEN_FINANCE" });
    expect(openFinance.map((d) => d.id).sort()).toEqual(["FINAPI", "TINK"]);
    const net = listDatasources({ domain: "NET_TARIFF" });
    expect(net.map((d) => d.id).sort()).toEqual(["CONFEE", "HONORARKONZEPT"]);
  });

  it("resolves env credentials by prefix", () => {
    const env = {
      FINAPI_CLIENT_ID: "fin-id",
      FINAPI_CLIENT_SECRET: "fin-secret",
      TINK_CLIENT_ID: "tink-id",
      FB_API_KEY: "fb-key",
      FINNANZMINING_API_KEY: "cb-key",
      HONORARKONZEPT_PARTNER_LICENSE_KEY: "hk-lic",
      CONFEE_API_KEY: "cf-key",
    };
    expect(credentialsFromEnv("FINAPI", env).clientId).toBe("fin-id");
    expect(credentialsFromEnv("FRANKE_BORNBERG", env).apiKey).toBe("fb-key");
    expect(credentialsFromEnv("FINNANZMINING", env).apiKey).toBe("cb-key");
    expect(credentialsFromEnv("HONORARKONZEPT", env).partnerLicenseKey).toBe(
      "hk-lic",
    );
    expect(configuredDatasourceIds(env).sort()).toEqual([
      "CONFEE",
      "FINAPI",
      "FINNANZMINING",
      "FRANKE_BORNBERG",
      "HONORARKONZEPT",
      "TINK",
    ]);
  });

  it("describes full runtime registry", () => {
    const status = describeDatasourceRegistry({});
    expect(status).toHaveLength(12);
    expect(status.every((s) => s.configured === false)).toBe(true);
    expect(status.find((s) => s.id === "BLAU_DIREKT")?.displayName).toBe(
      "blau direkt",
    );
    expect(status.find((s) => s.id === "FINNANZMINING")?.baseUrl).toBe(
      "https://api.cashbuzz.io/v01",
    );
    expect(status.find((s) => s.id === "CONFEE")?.displayName).toBe("con.fee");
  });
});
