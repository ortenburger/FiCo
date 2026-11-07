/**
 * Resilience4j-style circuit breaker for finexpert / F&B egress.
 * External calls MUST run in detached workers — never on request threads.
 */
export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";
export interface CircuitBreakerOptions {
    failureThreshold?: number;
    resetTimeoutMs?: number;
    halfOpenMaxCalls?: number;
    now?: () => number;
}
export declare class CircuitOpenError extends Error {
    readonly resumeAt: number;
    constructor(resumeAt: number);
}
export declare class CircuitBreaker {
    private state;
    private failures;
    private openedAt;
    private halfOpenInFlight;
    private readonly failureThreshold;
    private readonly resetTimeoutMs;
    private readonly halfOpenMaxCalls;
    private readonly now;
    constructor(opts?: CircuitBreakerOptions);
    getState(): CircuitState;
    exec<T>(fn: () => Promise<T>): Promise<T>;
    private maybeTransitionToHalfOpen;
    private onSuccess;
    private onFailure;
}
/** Exponential backoff delay (ms) with full jitter */
export declare function exponentialBackoffMs(attempt: number, baseMs?: number, maxMs?: number): number;
//# sourceMappingURL=circuit-breaker.d.ts.map