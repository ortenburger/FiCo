import { describe, expect, it } from "vitest";
import { createAispConnector } from "./factory.js";
import { FinapiConnector } from "./finapi-client.js";
import { TinkConnector } from "./tink-client.js";
import { WealthapiConnector } from "./wealthapi-client.js";

describe("createAispConnector", () => {
  const creds = {
    baseUrl: "https://example.test",
    clientId: "id",
    clientSecret: "secret",
  };

  it("builds finAPI, Tink, and wealthAPI connectors", () => {
    expect(createAispConnector("FINAPI", creds)).toBeInstanceOf(FinapiConnector);
    expect(createAispConnector("TINK", creds)).toBeInstanceOf(TinkConnector);
    expect(createAispConnector("WEALTHAPI", creds)).toBeInstanceOf(
      WealthapiConnector,
    );
  });

  it("exposes only read-only AISP methods", () => {
    const c = createAispConnector("FINAPI", creds);
    expect("fetchAccounts" in c).toBe(true);
    expect("fetchTransactions" in c).toBe(true);
    expect("initiatePayment" in c).toBe(false);
  });
});
