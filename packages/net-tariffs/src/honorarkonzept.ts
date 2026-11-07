import { compareNetAdvantage } from "./compare.js";
import { filterCatalog, HONORARKONZEPT_SEED } from "./catalog-seed.js";
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

export const HONORARKONZEPT_PORTAL = "https://www.honorarkonzept.de/start.html";
export const HONORARKONZEPT_NETTOPRODUKTE =
  "https://www.honorarkonzept.de/nettoprodukte.html";

/**
 * HonorarKonzept GmbH — Nettoprodukte / Honorar partner connector.
 * @see https://www.honorarkonzept.de/start.html
 *
 * Partner portal APIs are not publicly documented; live calls use partner
 * credentials when configured, otherwise curated catalog + deep-links.
 */
export class HonorarkonzeptConnector implements NetTariffConnector {
  readonly provider = "HONORARKONZEPT" as const;
  private readonly http: NetTariffHttp;

  constructor(config: Partial<NetTariffPartnerConfig> = {}) {
    this.http = new NetTariffHttp({
      baseUrl: config.baseUrl ?? "https://partner.honorarkonzept.de/api/v1",
      partnerLicenseKey: config.partnerLicenseKey,
      apiKey: config.apiKey,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      fetchImpl: config.fetchImpl,
    });
  }

  partnerPortalUrl(): string {
    return HONORARKONZEPT_PORTAL;
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
            remote.products.map((p) => ({ ...p, provider: "HONORARKONZEPT", isNet: true })),
            query,
          );
        }
      } catch {
        // fall through to seed catalog
      }
    }
    return filterCatalog(HONORARKONZEPT_SEED, query);
  }

  compareAdvantage(
    request: NetAdvantageCompareRequest,
  ): Promise<NetAdvantageCompareResult> {
    // Mirrors HonorarKonzept finanzmathematischer Vergleichsrechner positioning
    return Promise.resolve(compareNetAdvantage(request, "ADVISORY_FEE"));
  }

  async handoffApplication(
    draft: NetApplicationDraft,
  ): Promise<NetApplicationHandoff> {
    if (draft.provider !== "HONORARKONZEPT") {
      throw new Error("Application provider mismatch for HonorarKonzept");
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
            provider: "HONORARKONZEPT",
          };
        }
      } catch {
        // fall through to deep-link handoff
      }
    }

    const params = new URLSearchParams({
      productId: draft.productId,
      email: draft.applicant.email,
      source: "fico",
    });
    return {
      applicationId: `hk-handoff-${crypto.randomUUID()}`,
      status: "HANDED_OFF_TO_PARTNER",
      partnerDeepLink: `${HONORARKONZEPT_NETTOPRODUKTE}?${params}`,
      provider: "HONORARKONZEPT",
    };
  }
}
