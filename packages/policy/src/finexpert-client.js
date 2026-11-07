import { CircuitBreaker, CircuitOpenError, exponentialBackoffMs, } from "./circuit-breaker.js";
/**
 * Normalize synopsis + compute financial arbitrage & regression flags.
 */
export function normalizeSynopsis(response, params) {
    const regressions = response.clause_scores.filter((c) => c.target_score < c.source_score);
    const annualSavings = response.source_annual_cost - response.target_annual_cost;
    let npv = 0;
    for (let t = 1; t <= params.years; t++) {
        npv += annualSavings / (1 + params.discountRate) ** t;
    }
    npv -= params.advisorySetupFee;
    return { regressions, annualSavings, npv };
}
export class FinexpertClient {
    config;
    fetchImpl;
    maxRetries;
    breaker;
    accessToken = null;
    constructor(config) {
        this.config = config;
        this.fetchImpl = config.fetchImpl ?? fetch;
        this.maxRetries = config.maxRetries ?? 4;
        this.breaker = config.circuitBreaker ?? new CircuitBreaker();
    }
    /**
     * OAuth2 client-credentials + synopsis call with backoff + circuit breaker.
     * MUST be invoked from a background worker, never a request thread.
     */
    async createSynopsis(payload) {
        return this.breaker.exec(() => this.createSynopsisWithRetry(payload));
    }
    async createSynopsisWithRetry(payload) {
        let lastErr;
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                const token = await this.getToken();
                const res = await this.fetchImpl(`${this.config.baseUrl}/synopsis`, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(payload),
                });
                if (!res.ok) {
                    throw new Error(`finexpert synopsis HTTP ${res.status}`);
                }
                const raw = (await res.json());
                return {
                    source_annual_cost: Number(raw.source_annual_cost ?? 0),
                    target_annual_cost: Number(raw.target_annual_cost ?? 0),
                    clause_scores: Array.isArray(raw.clause_scores)
                        ? raw.clause_scores
                        : [],
                    raw,
                };
            }
            catch (err) {
                if (err instanceof CircuitOpenError)
                    throw err;
                lastErr = err;
                if (attempt < this.maxRetries) {
                    await sleep(exponentialBackoffMs(attempt));
                }
            }
        }
        throw lastErr;
    }
    async getToken() {
        if (this.accessToken)
            return this.accessToken;
        const res = await this.fetchImpl(`${this.config.baseUrl}/oauth/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                grant_type: "client_credentials",
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret,
            }),
        });
        if (!res.ok)
            throw new Error(`finexpert token HTTP ${res.status}`);
        const body = (await res.json());
        if (!body.access_token)
            throw new Error("finexpert token missing");
        this.accessToken = body.access_token;
        return this.accessToken;
    }
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
//# sourceMappingURL=finexpert-client.js.map