import {
  ALL_DATASOURCE_IDS,
  DATASOURCES,
  type DatasourceId,
} from "./catalog.js";

export type EnvMap = Record<string, string | undefined>;

export interface DatasourceCredentials {
  baseUrl?: string;
  clientId?: string;
  clientSecret?: string;
  apiKey?: string;
  partnerLicenseKey?: string;
  webhookSecret?: string;
}

/**
 * Resolve credentials from process.env using each datasource's envPrefix.
 * Example: FINAPI → FINAPI_BASE_URL, FINAPI_CLIENT_ID, FINAPI_CLIENT_SECRET, …
 */
export function credentialsFromEnv(
  id: DatasourceId,
  env: EnvMap = process.env as EnvMap,
): DatasourceCredentials {
  const prefix = DATASOURCES[id].envPrefix;
  return {
    baseUrl: env[`${prefix}_BASE_URL`],
    clientId: env[`${prefix}_CLIENT_ID`],
    clientSecret: env[`${prefix}_CLIENT_SECRET`],
    apiKey: env[`${prefix}_API_KEY`],
    partnerLicenseKey: env[`${prefix}_PARTNER_LICENSE_KEY`],
    webhookSecret: env[`${prefix}_WEBHOOK_SECRET`],
  };
}

export function configuredDatasourceIds(
  env: EnvMap = process.env as EnvMap,
): DatasourceId[] {
  return ALL_DATASOURCE_IDS.filter((id) => {
    const c = credentialsFromEnv(id, env);
    return Boolean(
      c.clientId || c.apiKey || c.partnerLicenseKey || c.webhookSecret,
    );
  });
}

/** Default public / sandbox base URLs (override via *_BASE_URL). */
export const DEFAULT_BASE_URLS: Record<DatasourceId, string> = {
  FINAPI: "https://sandbox.finapi.io",
  TINK: "https://api.tink.com",
  WEALTHAPI: "https://api.wealthapi.eu",
  FINEXPERT_REST: "https://api.finexpert.de/api/v1",
  BLAU_DIREKT: "https://api.finexpert.de/api/v1/blau-direkt",
  BCA: "https://api.finexpert.de/api/v1/bca",
  FRANKE_BORNBERG: "https://api.finexpert.de/api/v1/fb",
  TAA: "https://api.finexpert.de/api/v1/taa",
  MVP: "https://api.finexpert.de/api/v1/mvp",
};

export function resolveBaseUrl(
  id: DatasourceId,
  env: EnvMap = process.env as EnvMap,
): string {
  return credentialsFromEnv(id, env).baseUrl ?? DEFAULT_BASE_URLS[id];
}
