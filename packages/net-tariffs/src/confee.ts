import { compareNetAdvantage } from "./compare.js";
import { CONFEE_SEED, filterCatalog } from "./catalog-seed.js";
import { NetTariffHttp } from "./http.js";
import type {
  NetAdvantageCompareRequest,
  NetAdvantageCompareResult,
  NetApplicationDraft,
  NetApplicationHandoff,
  NetCatalogQuery,
  NetProduct,
  NetTariffConnector,
  NetTariffPartnerConfig,
} from "./types.js";

export const CONFEE_PORTAL = "https://www.confee.de/";
export const CONFEE_PRODUCTS = "https://www.confee.de/produkte/";
export const CONFEE_PARTNER = "https://www.confee.de/partner-werden";

/**
 * con.fee AG — provisionsfreie Nettotarife / Honorar partner connector.
 * @see https://www.confee.de/
 *
 * Offers 300+ net life/SHU/Rechtsschutz tariffs + Vorteilsrechner.
 * Kickbackabrechnung on depot platforms is NOT exposed (§ 48b VAG).
 */
export class ConfeeConnector implements NetTariffConnector {
  readonly provider = "CONFEE" as const;
  private readonly http: NetTariffHttp;

  constructor(config: Partial<NetTariffPartnerConfig> = {}) {
    this.http = new NetTariffHttp({
      baseUrl: config.baseUrl ?? "https://partner.confee.de/api/v1",
      partnerLicenseKey: config.partnerLicenseKey,
      apiKey: config.apiKey,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      fetchImpl: config.fetchImpl,
    });
  }

  partnerPortalUrl(): string {
    return CONFEE_PORTAL;
  }

  async listNetProducts(query: NetCatalogQuery = {}): Promise<NetProduct[]> {
    if (this.http.hasCredentials) {
      try {
        const remote = await this.http.request<{ products?: NetProduct[] }>(
          "GET",
          "/net-products",
          {
            query: {
              line: query.line,
              carrier: query.carrierName,
              q: query.search,
            },
          },
        );
        if (remote.products?.length) {
          return filterCatalog(
            remote.products.map((p) => ({ ...p, provider: "CONFEE", isNet: true })),
            query,
          );
        }
      } catch {
        // fall through
      }
    }
    return filterCatalog(CONFEE_SEED, query);
  }

  /**
   * con.fee Check — Kosten- und Renditevorteilsrechner.
   * Fee billed as transparent software/advisory service only.
   */
  compareAdvantage(
    request: NetAdvantageCompareRequest,
  ): Promise<NetAdvantageCompareResult> {
    return Promise.resolve(compareNetAdvantage(request, "SOFTWARE_SERVICE_FEE"));
  }

  async handoffApplication(
    draft: NetApplicationDraft,
  ): Promise<NetApplicationHandoff> {
    if (draft.provider !== "CONFEE") {
      throw new Error("Application provider mismatch for con.fee");
    }

    if (this.http.hasCredentials) {
      try {
        const res = await this.http.request<{
          applicationId?: string;
          deepLink?: string;
        }>("POST", "/applications", { body: draft });
        if (res.applicationId && res.deepLink) {
          return {
            applicationId: res.applicationId,
            status: "HANDED_OFF_TO_PARTNER",
            partnerDeepLink: res.deepLink,
            provider: "CONFEE",
          };
        }
      } catch {
        // fall through
      }
    }

    const params = new URLSearchParams({
      productId: draft.productId,
      email: draft.applicant.email,
      source: "fico",
    });
    return {
      applicationId: `cf-handoff-${crypto.randomUUID()}`,
      status: "HANDED_OFF_TO_PARTNER",
      partnerDeepLink: `${CONFEE_PRODUCTS}?${params}`,
      provider: "CONFEE",
    };
  }
}
