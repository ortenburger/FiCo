import { CircuitBreaker } from "./circuit-breaker.js";
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
export declare function normalizeSynopsis(response: SynopsisResponse, params: {
    discountRate: number;
    years: number;
    advisorySetupFee: number;
}): ScoreDeltaResult;
export declare class FinexpertClient {
    private readonly config;
    private readonly fetchImpl;
    private readonly maxRetries;
    private readonly breaker;
    private accessToken;
    constructor(config: FinexpertClientConfig);
    /**
     * OAuth2 client-credentials + synopsis call with backoff + circuit breaker.
     * MUST be invoked from a background worker, never a request thread.
     */
    createSynopsis(payload: SynopsisRequest): Promise<SynopsisResponse>;
    private createSynopsisWithRetry;
    private getToken;
}
//# sourceMappingURL=finexpert-client.d.ts.map