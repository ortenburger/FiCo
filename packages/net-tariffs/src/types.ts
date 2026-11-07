/**
 * Shared net-tariff (Nettotarif / Honorar) product model.
 * Used by HonorarKonzept and con.fee partner connectors.
 */

export type NetTariffProviderId = "HONORARKONZEPT" | "CONFEE";

export type NetProductLine =
  | "TERM_LIFE"
  | "BU_DISABILITY"
  | "PRIVATE_HEALTH"
  | "PENSION_BASE"
  | "PENSION_PRIVATE"
  | "PENSION_OCCUPATIONAL"
  | "PROPERTY_CASUALTY"
  | "LEGAL_PROTECTION"
  | "INVESTMENT_WRAPPER"
  | "OTHER";

export interface NetProduct {
  id: string;
  provider: NetTariffProviderId;
  carrierName: string;
  productName: string;
  tariffCode?: string;
  line: NetProductLine;
  /** True = commission-free / Nettotarif */
  isNet: true;
  /** Monthly or annual admin TER estimate when known (percent) */
  estimatedTerPct?: number;
  notes?: string;
  partnerDeepLink?: string;
}

export interface NetCatalogQuery {
  line?: NetProductLine;
  carrierName?: string;
  search?: string;
  limit?: number;
}

export interface NetAdvantageCompareRequest {
  /** Legacy / gross annual premium or cost */
  grossAnnualCost: number;
  /** Candidate net annual product cost (premium only, excl. advisory fee) */
  netAnnualCost: number;
  /** Transparent advisory / software fee billed to client (€ / year) */
  advisoryFeeAnnual: number;
  years: number;
  discountRate?: number;
}

export interface NetAdvantageCompareResult {
  annualProductSavings: number;
  annualNetOfAdvisory: number;
  npvSavings: number;
  breakEvenYears: number | null;
  /** Explicit § 34d fee — never a kickback */
  feeType: "ADVISORY_FEE" | "SOFTWARE_SERVICE_FEE";
}

export interface NetApplicationDraft {
  productId: string;
  provider: NetTariffProviderId;
  applicant: {
    firstName: string;
    lastName: string;
    email: string;
    birthDate?: string;
  };
  insuredSum?: number;
  monthlyPremium?: number;
  /** Outbound partner portal / application deep-link only — user completes manually */
  executionOnly: true;
}

export interface NetApplicationHandoff {
  applicationId: string;
  status: "HANDED_OFF_TO_PARTNER";
  partnerDeepLink: string;
  provider: NetTariffProviderId;
}

export interface NetTariffPartnerConfig {
  baseUrl: string;
  partnerLicenseKey?: string;
  apiKey?: string;
  clientId?: string;
  clientSecret?: string;
  fetchImpl?: typeof fetch;
}

export interface NetTariffConnector {
  readonly provider: NetTariffProviderId;
  listNetProducts(query?: NetCatalogQuery): Promise<NetProduct[]>;
  compareAdvantage(
    request: NetAdvantageCompareRequest,
  ): Promise<NetAdvantageCompareResult>;
  handoffApplication(
    draft: NetApplicationDraft,
  ): Promise<NetApplicationHandoff>;
  partnerPortalUrl(): string;
}
