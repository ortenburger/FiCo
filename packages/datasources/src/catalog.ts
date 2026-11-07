/**
 * Canonical datasource registry for FiCo.
 *
 * Open Finance (AISP): finAPI, Tink, wealthAPI
 * finexpert Schnittstellen (https://www.finexpert.de/schnittstellen/):
 *   blau direkt, BCA AG, Franke & Bornberg, TAA, REST API, MVP-Systeme
 */

export type DatasourceDomain =
  | "OPEN_FINANCE"
  | "WEALTH"
  | "INSURANCE_BROKER"
  | "TARIFF_COMPARISON"
  | "MVP_SYNC";

export type DatasourceId =
  // Open Finance / Wealth
  | "FINAPI"
  | "TINK"
  | "WEALTHAPI"
  // finexpert.de/schnittstellen (all)
  | "FINEXPERT_REST"
  | "BLAU_DIREKT"
  | "BCA"
  | "FRANKE_BORNBERG"
  | "TAA"
  | "MVP";

export type AuthScheme =
  | "OAUTH2_CLIENT_CREDENTIALS"
  | "OAUTH2_AUTHORIZATION_CODE"
  | "API_KEY"
  | "HMAC_WEBHOOK"
  | "PARTNER_LICENSE";

export interface DatasourceDefinition {
  id: DatasourceId;
  displayName: string;
  vendor: string;
  domain: DatasourceDomain;
  /** Official product / docs URL */
  docsUrl: string;
  auth: AuthScheme[];
  /** Env var prefix for credentials, e.g. FINAPI → FINAPI_CLIENT_ID */
  envPrefix: string;
  capabilities: readonly string[];
  /** Never compile PISP into Open Finance adapters */
  readOnly: boolean;
  notes?: string;
}

export const DATASOURCES: Record<DatasourceId, DatasourceDefinition> = {
  FINAPI: {
    id: "FINAPI",
    displayName: "finAPI",
    vendor: "finAPI GmbH",
    domain: "OPEN_FINANCE",
    docsUrl: "https://documentation.finapi.io/",
    auth: ["OAUTH2_CLIENT_CREDENTIALS", "HMAC_WEBHOOK"],
    envPrefix: "FINAPI",
    capabilities: [
      "aisp.accounts",
      "aisp.transactions",
      "aisp.consents",
      "webhooks",
    ],
    readOnly: true,
    notes: "ZAG-compliant AISP. No PISP interfaces compiled into FiCo binaries.",
  },
  TINK: {
    id: "TINK",
    displayName: "Tink",
    vendor: "Tink AB (Visa)",
    domain: "OPEN_FINANCE",
    docsUrl: "https://docs.tink.com/",
    auth: ["OAUTH2_CLIENT_CREDENTIALS", "OAUTH2_AUTHORIZATION_CODE"],
    envPrefix: "TINK",
    capabilities: [
      "aisp.accounts",
      "aisp.transactions",
      "aisp.consents",
      "account_verification",
    ],
    readOnly: true,
    notes: "PSD2 AISP connector. Read-only account aggregation only.",
  },
  WEALTHAPI: {
    id: "WEALTHAPI",
    displayName: "wealthAPI",
    vendor: "wealthAPI",
    domain: "WEALTH",
    docsUrl: "https://www.wealthapi.eu/",
    auth: ["OAUTH2_CLIENT_CREDENTIALS"],
    envPrefix: "WEALTHAPI",
    capabilities: ["depot.snapshots", "securities.holdings", "depot.transactions"],
    readOnly: true,
    notes: "Depot / securities ingestion. No execution / order placement.",
  },
  FINEXPERT_REST: {
    id: "FINEXPERT_REST",
    displayName: "finexpert REST API",
    vendor: "finexpert",
    domain: "INSURANCE_BROKER",
    docsUrl: "https://www.finexpert.de/schnittstellen/",
    auth: ["OAUTH2_CLIENT_CREDENTIALS"],
    envPrefix: "FINEXPERT",
    capabilities: [
      "kunden.read",
      "kunden.write",
      "risikocheck",
      "webhooks",
      "sandbox",
    ],
    readOnly: false,
    notes:
      "Open REST/JSON API with OAuth 2.0, webhooks, and sandbox. Hub for custom closing flows.",
  },
  BLAU_DIREKT: {
    id: "BLAU_DIREKT",
    displayName: "blau direkt",
    vendor: "blau direkt / finexpert",
    domain: "INSURANCE_BROKER",
    docsUrl: "https://www.finexpert.de/schnittstellen/",
    auth: ["PARTNER_LICENSE", "OAUTH2_CLIENT_CREDENTIALS"],
    envPrefix: "BLAU_DIREKT",
    capabilities: [
      "bestand.sync",
      "mvp.import",
      "abschlussstrecke",
      "two_way_sync",
    ],
    readOnly: false,
    notes:
      "Native two-way integration with leading DE broker pool. Exclusive partner license for blau direkt brokers.",
  },
  BCA: {
    id: "BCA",
    displayName: "BCA AG",
    vendor: "BCA AG / finexpert",
    domain: "INSURANCE_BROKER",
    docsUrl: "https://www.finexpert.de/schnittstellen/",
    auth: ["PARTNER_LICENSE", "OAUTH2_CLIENT_CREDENTIALS"],
    envPrefix: "BCA",
    capabilities: [
      "bestand.sync",
      "kunden.verwaltung",
      "dokumentenfluss",
      "beratungsstrecke",
    ],
    readOnly: false,
    notes:
      "Full BCA system integration — inventory, CRM, and document flow embedded in advisory path.",
  },
  FRANKE_BORNBERG: {
    id: "FRANKE_BORNBERG",
    displayName: "Franke & Bornberg (fb>vertragscheck)",
    vendor: "Franke und Bornberg / finexpert",
    domain: "TARIFF_COMPARISON",
    docsUrl: "https://www.finexpert.de/schnittstellen/",
    auth: ["OAUTH2_CLIENT_CREDENTIALS", "API_KEY"],
    envPrefix: "FB",
    capabilities: [
      "synopsis",
      "vertragscheck",
      "tariff.scoring",
      "sparten.bu_rente_komposit_kranken_gewerbe",
    ],
    readOnly: true,
    notes:
      "Optional add-on. Gated behind economic gate + active subscription. 300+ products across lines.",
  },
  TAA: {
    id: "TAA",
    displayName: "TAA-Schnittstelle",
    vendor: "TAA / finexpert",
    domain: "TARIFF_COMPARISON",
    docsUrl: "https://www.finexpert.de/schnittstellen/",
    auth: ["OAUTH2_CLIENT_CREDENTIALS", "API_KEY"],
    envPrefix: "TAA",
    capabilities: [
      "tarifrechner",
      "vergleich.results",
      "beratungskonzept.import",
    ],
    readOnly: true,
    notes:
      "Tariff calculator results imported into finexpert advisory concept automatically.",
  },
  MVP: {
    id: "MVP",
    displayName: "MVP-Systeme",
    vendor: "finexpert (MVP sync)",
    domain: "MVP_SYNC",
    docsUrl: "https://www.finexpert.de/schnittstellen/",
    auth: ["OAUTH2_CLIENT_CREDENTIALS", "API_KEY"],
    envPrefix: "MVP",
    capabilities: [
      "kunden.sync",
      "bestand.changes",
      "neukunden.aufnahme",
    ],
    readOnly: false,
    notes:
      "Sync with common Maklerverwaltungsprogramme — avoids double entry / inconsistency.",
  },
};

export const ALL_DATASOURCE_IDS = Object.keys(DATASOURCES) as DatasourceId[];

export const OPEN_FINANCE_DATASOURCES: DatasourceId[] = ["FINAPI", "TINK", "WEALTHAPI"];

export const FINEXPERT_SCHNITTSTELLEN: DatasourceId[] = [
  "FINEXPERT_REST",
  "BLAU_DIREKT",
  "BCA",
  "FRANKE_BORNBERG",
  "TAA",
  "MVP",
];

export function getDatasource(id: DatasourceId): DatasourceDefinition {
  return DATASOURCES[id];
}

export function listDatasources(filter?: {
  domain?: DatasourceDomain;
  readOnly?: boolean;
}): DatasourceDefinition[] {
  return ALL_DATASOURCE_IDS.map((id) => DATASOURCES[id]).filter((ds) => {
    if (filter?.domain && ds.domain !== filter.domain) return false;
    if (filter?.readOnly !== undefined && ds.readOnly !== filter.readOnly) {
      return false;
    }
    return true;
  });
}

export function isKnownDatasource(value: string): value is DatasourceId {
  return value in DATASOURCES;
}
