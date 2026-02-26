/**
 * Database Circuit Breaker
 *
 * Prevents cascading failures when the database is degraded by failing fast
 * after repeated transient failures in a short time window.
 */

import * as Sentry from '@sentry/nextjs';

export type DbCircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface DbCircuitBreakerConfig {
  failureThreshold: number;
  failureWindow: number;
  resetTimeout: number;
  halfOpenRequests: number;
}

export interface DbCircuitStats {
  state: DbCircuitState;
  failuresInWindow: number;
  openedAt: number | null;
  halfOpenInFlight: number;
}

export class DbCircuitOpenError extends Error {
  readonly statusCode = 503;
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super('Database temporarily unavailable');
    this.name = 'DbCircuitOpenError';
    this.retryAfterMs = retryAfterMs;
  }
}

class DbCircuitBreaker {
  private state: DbCircuitState = 'CLOSED';
  private failureTimestamps: number[] = [];
  private openedAt: number | null = null;
  private halfOpenInFlight = 0;

  constructor(private readonly config: DbCircuitBreakerConfig) {}

  async execute<T>(
    operation: () => Promise<T>,
    options: { shouldCountFailure: (error: unknown) => boolean }
  ): Promise<T> {
    this.assertCanExecute();

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      const shouldCount = options.shouldCountFailure(error);
      if (shouldCount) {
        this.onCountedFailure();
      } else if (this.state === 'HALF_OPEN') {
        // Non-transient probe failures should not keep global DB traffic throttled.
        this.failureTimestamps = [];
        this.transitionTo('CLOSED');
      }
      throw error;
    } finally {
      if (this.state === 'HALF_OPEN' && this.halfOpenInFlight > 0) {
        this.halfOpenInFlight -= 1;
      }
    }
  }

  private assertCanExecute(): void {
    const now = Date.now();

    if (this.state === 'OPEN') {
      if (!this.openedAt || now - this.openedAt < this.config.resetTimeout) {
        throw new DbCircuitOpenError(this.getRetryAfterMs(now));
      }

      this.transitionTo('HALF_OPEN');
    }

    if (this.state === 'HALF_OPEN') {
      if (this.halfOpenInFlight >= this.config.halfOpenRequests) {
        throw new DbCircuitOpenError(this.getRetryAfterMs(now));
      }
      this.halfOpenInFlight += 1;
    }
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.failureTimestamps = [];
      this.transitionTo('CLOSED');
      return;
    }

    if (this.state === 'CLOSED') {
      this.pruneOldFailures(Date.now());
    }
  }

  private onCountedFailure(): void {
    const now = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.openedAt = now;
      this.failureTimestamps = [now];
      this.transitionTo('OPEN');
      return;
    }

    if (this.state === 'CLOSED') {
      this.pruneOldFailures(now);
      this.failureTimestamps.push(now);

      if (this.failureTimestamps.length >= this.config.failureThreshold) {
        this.openedAt = now;
        this.transitionTo('OPEN');
      }
    }
  }

  private pruneOldFailures(now: number): void {
    const cutoff = now - this.config.failureWindow;
    this.failureTimestamps = this.failureTimestamps.filter(ts => ts > cutoff);
  }

  private getRetryAfterMs(now: number): number {
    if (!this.openedAt) {
      return this.config.resetTimeout;
    }

    return Math.max(0, this.config.resetTimeout - (now - this.openedAt));
  }

  private transitionTo(nextState: DbCircuitState): void {
    const previousState = this.state;
    this.state = nextState;

    if (nextState === 'OPEN') {
      this.halfOpenInFlight = 0;
      Sentry.captureMessage('Database circuit breaker opened', {
        level: 'warning',
        tags: { component: 'db-circuit-breaker', transition: 'open' },
        extra: { previousState, stats: this.getStats() },
      });
      return;
    }

    if (nextState === 'CLOSED') {
      this.openedAt = null;
      this.halfOpenInFlight = 0;
      Sentry.captureMessage('Database circuit breaker closed', {
        level: 'info',
        tags: { component: 'db-circuit-breaker', transition: 'close' },
        extra: { previousState, stats: this.getStats() },
      });
    }
  }

  getStats(): DbCircuitStats {
    this.pruneOldFailures(Date.now());

    return {
      state: this.state,
      failuresInWindow: this.failureTimestamps.length,
      openedAt: this.openedAt,
      halfOpenInFlight: this.halfOpenInFlight,
    };
  }

  reset(): void {
    this.state = 'CLOSED';
    this.failureTimestamps = [];
    this.openedAt = null;
    this.halfOpenInFlight = 0;
  }
}

export const dbCircuitBreaker = new DbCircuitBreaker({
  failureThreshold: 5,
  failureWindow: 30_000,
  resetTimeout: 10_000,
  halfOpenRequests: 1,
});
