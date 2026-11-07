import { AnalyticsConnector } from "./analytics.js";
import { AuthConnector } from "./auth.js";
import { ContractsConnector } from "./contracts.js";
import { EnrichmentConnector } from "./enrichment.js";
import {
  FinanzminingHttp,
  type FinanzminingHttpConfig,
} from "./http.js";
import { PredictionsConnector } from "./predictions.js";

/**
 * Facade over finanzmining / cashbuzz connectors used by FiCo:
 * analytics, predictions, contract identification (+ enrichment pipeline).
 */
export class FinanzminingPlatform {
  readonly http: FinanzminingHttp;
  readonly auth: AuthConnector;
  readonly analytics: AnalyticsConnector;
  readonly predictions: PredictionsConnector;
  readonly contracts: ContractsConnector;
  readonly enrichment: EnrichmentConnector;

  constructor(private readonly config: FinanzminingHttpConfig) {
    this.http = new FinanzminingHttp(config);
    this.auth = new AuthConnector(config);
    this.analytics = new AnalyticsConnector(this.http);
    this.predictions = new PredictionsConnector(this.http);
    this.contracts = new ContractsConnector(this.http);
    this.enrichment = new EnrichmentConnector(this.http);
  }

  /** Return a platform instance bound to a user bearer token. */
  withUserToken(token: string): FinanzminingPlatform {
    return new FinanzminingPlatform({
      ...this.config,
      userAccessToken: token,
    });
  }
}

export function createFinanzminingPlatform(
  config: FinanzminingHttpConfig,
): FinanzminingPlatform {
  if (!config.apiKey) {
    throw new Error("FINNANZMINING_API_KEY (x-api-Key) is required");
  }
  return new FinanzminingPlatform(config);
}

/**
 * End-to-end pipeline: push txs → categorize → fetch contracts/subscriptions
 * → pull statistics & predicted cashflows.
 */
export async function runContractIdentificationPipeline(
  platform: FinanzminingPlatform,
  input: {
    accounts?: unknown[];
    transactions?: unknown[];
    waitMs?: number;
  },
): Promise<{
  contracts: Awaited<ReturnType<ContractsConnector["listContracts"]>>;
  subscriptions: Awaited<ReturnType<ContractsConnector["listSubscriptions"]>>;
  statistics: Awaited<ReturnType<AnalyticsConnector["getStatistics"]>>;
  predictedCashflows: Awaited<
    ReturnType<PredictionsConnector["listPredictedContractCashflows"]>
  >;
}> {
  if (input.accounts?.length) {
    await platform.enrichment.uploadAccounts(input.accounts);
  }
  if (input.transactions?.length) {
    await platform.enrichment.uploadTransactions(input.transactions);
  }
  await platform.enrichment.startCategorization({
    subscriptions_only: false,
  });

  if (input.waitMs && input.waitMs > 0) {
    await new Promise((r) => setTimeout(r, input.waitMs));
  }

  const [contracts, subscriptions, statistics, predictedCashflows] =
    await Promise.all([
      platform.contracts.listContracts({ perPage: 100 }),
      platform.contracts.listSubscriptions({ perPage: 100 }),
      platform.analytics.getStatistics(),
      platform.predictions.listPredictedContractCashflows({ perPage: 100 }),
    ]);

  return { contracts, subscriptions, statistics, predictedCashflows };
}
