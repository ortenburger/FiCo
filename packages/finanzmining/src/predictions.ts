import type { FinanzminingHttp } from "./http.js";
import type {
  FinanzminingInsight,
  FinanzminingTransaction,
  InsightQuery,
  PageablePaging,
  TransactionSearchQuery,
} from "./types.js";

/**
 * Predictions connector — forecasted transactions + insight time-series.
 * cashbuzz: GET /transactions?only_predicted=true, GET /insights/...
 */
export class PredictionsConnector {
  constructor(private readonly http: FinanzminingHttp) {}

  /**
   * Fetch predicted / projected transactions from the analytics engine.
   */
  async listPredictedTransactions(
    query: Omit<TransactionSearchQuery, "only_predicted"> = {},
  ): Promise<{
    transactions: FinanzminingTransaction[];
    paging?: PageablePaging;
  }> {
    const result = await this.http.get<{
      transactions?: FinanzminingTransaction[];
      paging?: PageablePaging;
    }>("/transactions", { ...query, only_predicted: true });
    return {
      transactions: result.transactions ?? [],
      paging: result.paging,
    };
  }

  /**
   * Generic insight retrieval used for P&L / liquidity / subscription forecasts.
   * Discover available insight names via AnalyticsConnector.listInsightDescriptions().
   */
  getPredictedInsight(
    section: string,
    group: string,
    name: string,
    query: InsightQuery = {},
  ): Promise<FinanzminingInsight | FinanzminingInsight[]> {
    return this.http.get(
      `/insights/${encodeURIComponent(section)}/${encodeURIComponent(group)}/${encodeURIComponent(name)}`,
      { ...query },
    );
  }

  /**
   * Upcoming subscription/contract cashflows approximated from predicted txs
   * that already carry subscription_id / org_id enrichment.
   */
  async listPredictedContractCashflows(params?: {
    minBankBookingDate?: string;
    maxBankBookingDate?: string;
    perPage?: number;
  }): Promise<FinanzminingTransaction[]> {
    const { transactions } = await this.listPredictedTransactions({
      minBankBookingDate: params?.minBankBookingDate,
      maxBankBookingDate: params?.maxBankBookingDate,
      perPage: params?.perPage ?? 200,
    });
    return transactions.filter(
      (t) => Boolean(t.subscription_id || t.org_id || t.predicted),
    );
  }
}
