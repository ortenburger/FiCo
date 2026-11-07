/**
 * Resilience4j-style circuit breaker for finexpert / F&B egress.
 * External calls MUST run in detached workers — never on request threads.
 */
export class CircuitOpenError extends Error {
    resumeAt;
    constructor(resumeAt) {
        super(`Circuit open until ${new Date(resumeAt).toISOString()}`);
        this.resumeAt = resumeAt;
        this.name = "CircuitOpenError";
    }
}
export class CircuitBreaker {
    state = "CLOSED";
    failures = 0;
    openedAt = 0;
    halfOpenInFlight = 0;
    failureThreshold;
    resetTimeoutMs;
    halfOpenMaxCalls;
    now;
    constructor(opts = {}) {
        this.failureThreshold = opts.failureThreshold ?? 5;
        this.resetTimeoutMs = opts.resetTimeoutMs ?? 30_000;
        this.halfOpenMaxCalls = opts.halfOpenMaxCalls ?? 1;
        this.now = opts.now ?? Date.now;
    }
    getState() {
        this.maybeTransitionToHalfOpen();
        return this.state;
    }
    async exec(fn) {
        this.maybeTransitionToHalfOpen();
        if (this.state === "OPEN") {
            throw new CircuitOpenError(this.openedAt + this.resetTimeoutMs);
        }
        if (this.state === "HALF_OPEN") {
            if (this.halfOpenInFlight >= this.halfOpenMaxCalls) {
                throw new CircuitOpenError(this.openedAt + this.resetTimeoutMs);
            }
            this.halfOpenInFlight++;
        }
        try {
            const result = await fn();
            this.onSuccess();
            return result;
        }
        catch (err) {
            this.onFailure();
            throw err;
        }
        finally {
            if (this.state === "HALF_OPEN" || this.halfOpenInFlight > 0) {
                this.halfOpenInFlight = Math.max(0, this.halfOpenInFlight - 1);
            }
        }
    }
    maybeTransitionToHalfOpen() {
        if (this.state === "OPEN" &&
            this.now() - this.openedAt >= this.resetTimeoutMs) {
            this.state = "HALF_OPEN";
            this.halfOpenInFlight = 0;
        }
    }
    onSuccess() {
        this.failures = 0;
        this.state = "CLOSED";
    }
    onFailure() {
        this.failures++;
        if (this.state === "HALF_OPEN" || this.failures >= this.failureThreshold) {
            this.state = "OPEN";
            this.openedAt = this.now();
        }
    }
}
/** Exponential backoff delay (ms) with full jitter */
export function exponentialBackoffMs(attempt, baseMs = 200, maxMs = 10_000) {
    const cap = Math.min(maxMs, baseMs * 2 ** attempt);
    return Math.floor(Math.random() * cap);
}
//# sourceMappingURL=circuit-breaker.js.map