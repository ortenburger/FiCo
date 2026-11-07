import type { AispAdapterName, AispConnector } from "./adapter.js";
import { StubAispConnector } from "./adapter.js";
import { FinapiConnector } from "./finapi-client.js";
import { TinkConnector } from "./tink-client.js";
import { WealthapiConnector } from "./wealthapi-client.js";

export interface OpenFinanceCredentials {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
}

/**
 * Build a read-only AISP/wealth connector by adapter name.
 * Never returns a PISP-capable client.
 */
export function createAispConnector(
  name: AispAdapterName,
  credentials?: OpenFinanceCredentials,
): AispConnector {
  if (!credentials?.clientId || !credentials.clientSecret) {
    return new StubAispConnector(name);
  }

  switch (name) {
    case "FINAPI":
      return new FinapiConnector(credentials);
    case "TINK":
      return new TinkConnector(credentials);
    case "WEALTHAPI":
      return new WealthapiConnector(credentials);
    default: {
      const _exhaustive: never = name;
      throw new Error(`Unknown AISP adapter: ${_exhaustive}`);
    }
  }
}
