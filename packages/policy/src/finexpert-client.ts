import {
  CircuitBreaker,
  CircuitOpenError,
  exponentialBackoffMs,
} from "./circuit-breaker.js";

export interface FinexpertTariffRef {
  company_id: number;
  tariff_code: string;
  generation?: number;
  is_net?: boolean;
}

export interface SynopsisRequest {
  source_tariff: FinexpertTariffRef;
  target_tariffs: FinexpertTariffRef[];
  criteria_profile: string;
}

export interface SynopsisClauseScore {
  clause_id: string;
  source_score: number;
  target_score: number;
}

export interface SynopsisResponse {
  source_annual_cost: number;
  target_annual_cost: number;
  clause_scores: SynopsisClauseScore[];
  raw: unknown;
}

export interface FinexpertClientConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  circuitBreaker?: CircuitBreaker;
}

export interface ScoreDeltaResult {
  regressions: SynopsisClauseScore[];
  annualSavings: number;
  npv: number;
}

/**
 * Normalize synopsis + compute financial arbitrage & regression flags.
 */
export function normalizeSynopsis(
  response: SynopsisResponse,
  params: { discountRate: number; years: number; advisorySetupFee: number },
): ScoreDeltaResult {
  const regressions = response.clause_scores.filter(
    (c) => c.target_score < c.source_score,
  );
  const annualSavings =
    response.source_annual_cost - response.target_annual_cost;

  let npv = 0;
  for (let t = 1; t <= params.years; t++) {
    npv += annualSavings / (1 + params.discountRate) ** t;
  }
  npv -= params.advisorySetupFee;

  return { regressions, annualSavings, npv };
}

export class FinexpertClient {
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly breaker: CircuitBreaker;
  private accessToken: string | null = null;

  constructor(private readonly config: FinexpertClientConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.maxRetries = config.maxRetries ?? 4;
    this.breaker = config.circuitBreaker ?? new CircuitBreaker();
  }

  /**
   * OAuth2 client-credentials + synopsis call with backoff + circuit breaker.
   * MUST be invoked from a background worker, never a request thread.
   */
  async createSynopsis(payload: SynopsisRequest): Promise<SynopsisResponse> {
    return this.breaker.exec(() => this.createSynopsisWithRetry(payload));
  }

  private async createSynopsisWithRetry(
    payload: SynopsisRequest,
  ): Promise<SynopsisResponse> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const token = await this.getToken();
        const res = await this.fetchImpl(
          `${this.config.baseUrl}/synopsis`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          },
        );
        if (!res.ok) {
          throw new Error(`finexpert synopsis HTTP ${res.status}`);
        }
        const raw = (await res.json()) as Record<string, unknown>;
        return {
          source_annual_cost: Number(raw.source_annual_cost ?? 0),
          target_annual_cost: Number(raw.target_annual_cost ?? 0),
          clause_scores: Array.isArray(raw.clause_scores)
            ? (raw.clause_scores as SynopsisClauseScore[])
            : [],
          raw,
        };
      } catch (err) {
        if (err instanceof CircuitOpenError) throw err;
        lastErr = err;
        if (attempt < this.maxRetries) {
          await sleep(exponentialBackoffMs(attempt));
        }
      }
    }
    throw lastErr;
  }

  private async getToken(): Promise<string> {
    if (this.accessToken) return this.accessToken;
    const res = await this.fetchImpl(`${this.config.baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }),
    });
    if (!res.ok) throw new Error(`finexpert token HTTP ${res.status}`);
    const body = (await res.json()) as { access_token?: string };
    if (!body.access_token) throw new Error("finexpert token missing");
    this.accessToken = body.access_token;
    return this.accessToken;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
