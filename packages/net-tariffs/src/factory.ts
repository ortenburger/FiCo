import { ConfeeConnector } from "./confee.js";
import { HonorarkonzeptConnector } from "./honorarkonzept.js";
import type {
  NetCatalogQuery,
  NetProduct,
  NetTariffConnector,
  NetTariffPartnerConfig,
  NetTariffProviderId,
} from "./types.js";

export type EnvMap = Record<string, string | undefined>;

export function createNetTariffConnector(
  provider: NetTariffProviderId,
  config: Partial<NetTariffPartnerConfig> = {},
): NetTariffConnector {
  switch (provider) {
    case "HONORARKONZEPT":
      return new HonorarkonzeptConnector(config);
    case "CONFEE":
      return new ConfeeConnector(config);
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unknown net-tariff provider: ${_exhaustive}`);
    }
  }
}

export function createNetTariffConnectorsFromEnv(
  env: EnvMap = process.env as EnvMap,
): NetTariffConnector[] {
  return [
    createNetTariffConnector("HONORARKONZEPT", {
      baseUrl: env.HONORARKONZEPT_BASE_URL,
      partnerLicenseKey: env.HONORARKONZEPT_PARTNER_LICENSE_KEY,
      apiKey: env.HONORARKONZEPT_API_KEY,
      clientId: env.HONORARKONZEPT_CLIENT_ID,
      clientSecret: env.HONORARKONZEPT_CLIENT_SECRET,
    }),
    createNetTariffConnector("CONFEE", {
      baseUrl: env.CONFEE_BASE_URL,
      partnerLicenseKey: env.CONFEE_PARTNER_LICENSE_KEY,
      apiKey: env.CONFEE_API_KEY,
      clientId: env.CONFEE_CLIENT_ID,
      clientSecret: env.CONFEE_CLIENT_SECRET,
    }),
  ];
}

/** Aggregate Nettoprodukte across HonorarKonzept + con.fee. */
export async function listAllNetProducts(
  connectors: NetTariffConnector[],
  query: NetCatalogQuery = {},
): Promise<NetProduct[]> {
  const batches = await Promise.all(
    connectors.map((c) => c.listNetProducts(query)),
  );
  return batches.flat();
}
