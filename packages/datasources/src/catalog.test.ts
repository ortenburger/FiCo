import { describe, expect, it } from "vitest";
import {
  ALL_DATASOURCE_IDS,
  DATASOURCES,
  FINEXPERT_SCHNITTSTELLEN,
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
    expect(ALL_DATASOURCE_IDS).toHaveLength(9);
  });

  it("lists by domain", () => {
    const openFinance = listDatasources({ domain: "OPEN_FINANCE" });
    expect(openFinance.map((d) => d.id).sort()).toEqual(["FINAPI", "TINK"]);
  });

  it("resolves env credentials by prefix", () => {
    const env = {
      FINAPI_CLIENT_ID: "fin-id",
      FINAPI_CLIENT_SECRET: "fin-secret",
      TINK_CLIENT_ID: "tink-id",
      FB_API_KEY: "fb-key",
    };
    expect(credentialsFromEnv("FINAPI", env).clientId).toBe("fin-id");
    expect(credentialsFromEnv("FRANKE_BORNBERG", env).apiKey).toBe("fb-key");
    expect(configuredDatasourceIds(env).sort()).toEqual([
      "FINAPI",
      "FRANKE_BORNBERG",
      "TINK",
    ]);
  });

  it("describes full runtime registry", () => {
    const status = describeDatasourceRegistry({});
    expect(status).toHaveLength(9);
    expect(status.every((s) => s.configured === false)).toBe(true);
    expect(status.find((s) => s.id === "BLAU_DIREKT")?.displayName).toBe(
      "blau direkt",
    );
  });
});
