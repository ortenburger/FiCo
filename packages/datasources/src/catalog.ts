/**
 * Canonical datasource registry for FiCo.
 *
 * Open Finance (AISP): finAPI, Tink, wealthAPI
 * finexpert Schnittstellen (https://www.finexpert.de/schnittstellen/):
 *   blau direkt, BCA AG, Franke & Bornberg, TAA, REST API, MVP-Systeme
 * Net-tariff partners:
 *   HonorarKonzept (https://www.honorarkonzept.de/start.html)
 *   con.fee (https://www.confee.de/)
 */

export type DatasourceDomain =
  | "OPEN_FINANCE"
  | "WEALTH"
  | "INSURANCE_BROKER"
  | "TARIFF_COMPARISON"
  | "MVP_SYNC"
  | "ANALYTICS"
  | "NET_TARIFF";

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
  | "MVP"
  // finanzmining / cashbuzz platform
  | "FINNANZMINING"
  // Nettotarif / Honorar partners
  | "HONORARKONZEPT"
  | "CONFEE";

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
  FINNANZMINING: {
    id: "FINNANZMINING",
    displayName: "finanzmining (cashbuzz)",
    vendor: "Cashbuzz GmbH / finanzmining.de",
    domain: "ANALYTICS",
    docsUrl: "https://finanzmining.de",
    auth: ["API_KEY"],
    envPrefix: "FINNANZMINING",
    capabilities: [
      "analytics.statistics",
      "analytics.insights",
      "analytics.affinities",
      "analytics.attributes",
      "analytics.finance_groups",
      "predictions.transactions",
      "predictions.insights",
      "contracts.identify",
      "subscriptions.detect",
      "enrichment.categorization",
      "enrichment.documents",
      "aisp.accounts.push",
      "aisp.transactions.push",
    ],
    readOnly: true,
    notes:
      "cashbuzz platform API (api.cashbuzz.io/v01). Analytics, predictions, contract/subscription identification. Cashback/voucher surfaces intentionally not wired (§ 48b VAG).",
  },
  HONORARKONZEPT: {
    id: "HONORARKONZEPT",
    displayName: "HonorarKonzept",
    vendor: "HonorarKonzept GmbH",
    domain: "NET_TARIFF",
    docsUrl: "https://www.honorarkonzept.de/start.html",
    auth: ["PARTNER_LICENSE", "API_KEY"],
    envPrefix: "HONORARKONZEPT",
    capabilities: [
      "net.tariffs.catalog",
      "net.tariffs.compare",
      "net.tariffs.application_handoff",
      "net.mylife_invest",
      "honorar.coaching",
    ],
    readOnly: false,
    notes:
      "Nettoprodukte + Honorarplattform (myLife Invest, Allianz Netto, panel carriers). Advisory fee only — no kickbacks (§ 48b VAG).",
  },
  CONFEE: {
    id: "CONFEE",
    displayName: "con.fee",
    vendor: "con.fee AG",
    domain: "NET_TARIFF",
    docsUrl: "https://www.confee.de/",
    auth: ["PARTNER_LICENSE", "API_KEY"],
    envPrefix: "CONFEE",
    capabilities: [
      "net.tariffs.catalog",
      "net.tariffs.compare",
      "net.tariffs.application_handoff",
      "net.weltmarkt_police",
      "net.shu_panel",
      "vorteilsrechner",
    ],
    readOnly: false,
    notes:
      "300+ Nettotarife (Leben/SHU/Rechtsschutz), Vorteilsrechner, Netto-Depotplattform. Depot kickback settlement not wired (§ 48b VAG).",
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

export const ANALYTICS_DATASOURCES: DatasourceId[] = ["FINNANZMINING"];

export const NET_TARIFF_DATASOURCES: DatasourceId[] = [
  "HONORARKONZEPT",
  "CONFEE",
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
