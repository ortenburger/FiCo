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

export class CircuitOpenError extends Error {
  constructor(public readonly resumeAt: number) {
    super(`Circuit open until ${new Date(resumeAt).toISOString()}`);
    this.name = "CircuitOpenError";
  }
}

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failures = 0;
  private openedAt = 0;
  private halfOpenInFlight = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly halfOpenMaxCalls: number;
  private readonly now: () => number;

  constructor(opts: CircuitBreakerOptions = {}) {
    this.failureThreshold = opts.failureThreshold ?? 5;
    this.resetTimeoutMs = opts.resetTimeoutMs ?? 30_000;
    this.halfOpenMaxCalls = opts.halfOpenMaxCalls ?? 1;
    this.now = opts.now ?? Date.now;
  }

  getState(): CircuitState {
    this.maybeTransitionToHalfOpen();
    return this.state;
  }

  async exec<T>(fn: () => Promise<T>): Promise<T> {
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
    } catch (err) {
      this.onFailure();
      throw err;
    } finally {
      if (this.state === "HALF_OPEN" || this.halfOpenInFlight > 0) {
        this.halfOpenInFlight = Math.max(0, this.halfOpenInFlight - 1);
      }
    }
  }

  private maybeTransitionToHalfOpen(): void {
    if (
      this.state === "OPEN" &&
      this.now() - this.openedAt >= this.resetTimeoutMs
    ) {
      this.state = "HALF_OPEN";
      this.halfOpenInFlight = 0;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = "CLOSED";
  }

  private onFailure(): void {
    this.failures++;
    if (this.state === "HALF_OPEN" || this.failures >= this.failureThreshold) {
      this.state = "OPEN";
      this.openedAt = this.now();
    }
  }
}

/** Exponential backoff delay (ms) with full jitter */
export function exponentialBackoffMs(
  attempt: number,
  baseMs = 200,
  maxMs = 10_000,
): number {
  const cap = Math.min(maxMs, baseMs * 2 ** attempt);
  return Math.floor(Math.random() * cap);
}
