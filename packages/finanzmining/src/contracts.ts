import type { FinanzminingHttp } from "./http.js";
import type {
  ContractSearchQuery,
  FinanzminingContract,
  FinanzminingSubscription,
  Organization,
  PageablePaging,
  SubscriptionSearchQuery,
} from "./types.js";

/**
 * Contract & subscription identification (cashbuzz Contracts / Subscriptions tags).
 * Detects contracts with org, customer_ident, contract_ident, tariff, periodicity.
 */
export class ContractsConnector {
  constructor(private readonly http: FinanzminingHttp) {}

  async listContracts(query: ContractSearchQuery = {}): Promise<{
    contracts: FinanzminingContract[];
    paging?: PageablePaging;
  }> {
    return this.http.get("/contracts", { ...query });
  }

  async listSubscriptions(query: SubscriptionSearchQuery = {}): Promise<{
    subscriptions: FinanzminingSubscription[];
    paging?: PageablePaging;
  }> {
    return this.http.get("/subscriptions", { ...query });
  }

  /**
   * Convenience: insurance-like contracts (uses class filters when provided).
   * Caller supplies cashbuzz class ids for Versicherung / Versicherungen.
   */
  async identifyInsuranceContracts(params?: {
    classes?: string;
    sub_classes?: string;
    org_id?: string;
    page?: number;
    perPage?: number;
  }): Promise<FinanzminingContract[]> {
    const result = await this.listContracts({
      classes: params?.classes,
      sub_classes: params?.sub_classes,
      org_id: params?.org_id,
      page: params?.page,
      perPage: params?.perPage ?? 100,
    });
    return result.contracts ?? [];
  }

  async getOrganization(orgId: string): Promise<Organization> {
    return this.http.get(`/descriptions/organizations/${encodeURIComponent(orgId)}`);
  }

  /**
   * Enrich contracts with organization display names for UI / policy matching.
   */
  async listContractsWithOrganizations(
    query: ContractSearchQuery = {},
  ): Promise<
    Array<FinanzminingContract & { organization?: Organization }>
  > {
    const { contracts } = await this.listContracts(query);
    const uniqueOrgIds = [...new Set(contracts.map((c) => c.org_id).filter(Boolean))];
    const orgs = new Map<string, Organization>();
    await Promise.all(
      uniqueOrgIds.map(async (id) => {
        try {
          orgs.set(id, await this.getOrganization(id));
        } catch {
          // org lookup is best-effort
        }
      }),
    );
    return contracts.map((c) => ({
      ...c,
      organization: orgs.get(c.org_id),
    }));
  }
}
