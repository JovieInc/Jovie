/**
 * Circuit Breaker for Spotify API
 *
 * Implements the circuit breaker pattern to prevent cascading failures
 * when the Spotify API is experiencing issues.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Failing fast, requests rejected immediately
 * - HALF_OPEN: Testing if service has recovered
 *
 * Security considerations:
 * - Server-only module
 * - Prevents DoS amplification when Spotify is down
 * - Logs state transitions for monitoring
 */

import 'server-only';

import * as Sentry from '@sentry/nextjs';

// ============================================================================
// Types
// ============================================================================

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  /** Provider identifier used in logs and alerts. Default: external-service */
  name: string;
  /** Number of failures before opening circuit. Default: 10 */
  failureThreshold: number;
  /** Time in ms before attempting recovery. Default: 60000 (60s) */
  resetTimeout: number;
  /** Number of successful calls to close circuit. Default: 2 */
  successThreshold: number;
  /** Time window in ms to track failures. Default: 120000 (2min) */
  failureWindow: number;
  /**
   * Minimum number of requests within the failure window before the
   * circuit can trip open. Prevents the breaker from opening during
   * low-traffic periods where a handful of transient errors would
   * otherwise exceed the failure threshold. Default: 20
   */
  minimumRequestCount: number;
  /**
   * Optional predicate to classify errors. Return false to exclude
   * an error from the failure count (e.g. rate-limit 429 responses).
   * When omitted, all errors count as failures.
   */
  shouldCount?: (error: unknown) => boolean;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  lastStateChange: number;
  totalFailures: number;
  totalSuccesses: number;
  requestsInWindow: number;
}

// ============================================================================
// Environment Configuration
// ============================================================================

/**
 * Parse an environment variable as a number with a fallback.
 */
function parseEnvNumber(envVar: string | undefined, fallback: number): number {
  if (!envVar) return fallback;
  const parsed = Number.parseInt(envVar, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * Create circuit breaker config from environment variables.
 * Environment variables allow runtime tuning without code changes.
 *
 * Environment variables:
 * - CIRCUIT_BREAKER_FAILURE_THRESHOLD: failures to open (default: 10)
 * - CIRCUIT_BREAKER_RESET_TIMEOUT_MS: ms before recovery attempt (default: 60000)
 * - CIRCUIT_BREAKER_SUCCESS_THRESHOLD: successes to close (default: 2)
 * - CIRCUIT_BREAKER_FAILURE_WINDOW_MS: failure tracking window (default: 120000)
 * - CIRCUIT_BREAKER_MIN_REQUEST_COUNT: min requests before tripping (default: 20)
 */
function createDefaultConfig(): CircuitBreakerConfig {
  return {
    name: 'external-service',
    failureThreshold: parseEnvNumber(
      process.env['CIRCUIT_BREAKER_FAILURE_THRESHOLD'],
      10
    ),
    resetTimeout: parseEnvNumber(
      process.env['CIRCUIT_BREAKER_RESET_TIMEOUT_MS'],
      60_000
    ),
    successThreshold: parseEnvNumber(
      process.env['CIRCUIT_BREAKER_SUCCESS_THRESHOLD'],
      2
    ),
    failureWindow: parseEnvNumber(
      process.env['CIRCUIT_BREAKER_FAILURE_WINDOW_MS'],
      120_000
    ),
    minimumRequestCount: parseEnvNumber(
      process.env['CIRCUIT_BREAKER_MIN_REQUEST_COUNT'],
      20
    ),
  };
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: CircuitBreakerConfig = createDefaultConfig();

// ============================================================================
// Circuit Breaker Implementation
// ============================================================================

/**
 * Circuit Breaker for external service calls.
 *
 * Usage:
 * ```typescript
 * const breaker = new CircuitBreaker({ failureThreshold: 10 });
 *
 * try {
 *   const result = await breaker.execute(() => fetchFromSpotify());
 * } catch (error) {
 *   if (error instanceof CircuitOpenError) {
 *     // Circuit is open, service is likely down
 *   }
 * }
 * ```
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures: number = 0;
  private successes: number = 0;
  private lastFailureTime: number | null = null;
  private lastStateChange: number = Date.now();
  private failureTimestamps: number[] = [];
  private requestTimestamps: number[] = [];

  // Lifetime stats
  private totalFailures: number = 0;
  private totalSuccesses: number = 0;

  private readonly config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute a function with circuit breaker protection.
   *
   * @param fn - The async function to execute
   * @returns The result of the function
   * @throws CircuitOpenError if circuit is open
   * @throws The original error if function fails
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit should allow request
    if (!this.canExecute()) {
      throw new CircuitOpenError(
        `Circuit breaker is ${this.state}. Service unavailable.`,
        this.getStats()
      );
    }

    // Track every request for minimumRequestCount enforcement
    this.requestTimestamps.push(Date.now());

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      // Only count errors that the config considers real failures.
      // Rate-limit (429) responses are excluded so they don't trip the breaker.
      if (!this.config.shouldCount || this.config.shouldCount(error)) {
        this.onFailure();
      }
      throw error;
    }
  }

  /**
   * Check if the circuit allows execution.
   * Note: May transition state from OPEN to HALF_OPEN if reset timeout has elapsed.
   */
  canExecute(): boolean {
    const now = Date.now();

    switch (this.state) {
      case 'CLOSED':
        return true;

      case 'OPEN':
        // Check if reset timeout has elapsed
        if (now - this.lastStateChange >= this.config.resetTimeout) {
          this.transitionTo('HALF_OPEN');
          return true;
        }
        return false;

      case 'HALF_OPEN':
        return true;
    }
  }

  /**
   * Record a successful call.
   */
  private onSuccess(): void {
    this.totalSuccesses++;

    switch (this.state) {
      case 'HALF_OPEN':
        this.successes++;
        if (this.successes >= this.config.successThreshold) {
          this.transitionTo('CLOSED');
        }
        break;

      case 'CLOSED':
        // Clear failure timestamps outside the window
        this.clearOldFailures();
        break;
    }
  }

  /**
   * Record a failed call.
   *
   * Concurrency note: JavaScript is single-threaded within an event loop tick,
   * but async operations can interleave between await points. To ensure
   * deterministic behavior:
   * 1. We capture state at the start of the operation
   * 2. All state mutations happen synchronously within this method
   * 3. State checks and transitions are atomic relative to other callbacks
   */
  private onFailure(): void {
    // Capture current state for atomic decision making
    const currentState = this.state;
    const now = Date.now();

    // Synchronous state updates
    this.totalFailures++;
    this.lastFailureTime = now;
    this.failureTimestamps.push(now);

    switch (currentState) {
      case 'HALF_OPEN':
        // Any failure in half-open state re-opens the circuit
        this.transitionTo('OPEN');
        break;

      case 'CLOSED': {
        // Clean old failures and request timestamps, then recount atomically
        const cutoff = now - this.config.failureWindow;
        this.failureTimestamps = this.failureTimestamps.filter(
          ts => ts > cutoff
        );
        this.requestTimestamps = this.requestTimestamps.filter(
          ts => ts > cutoff
        );
        this.failures = this.failureTimestamps.length;

        const hasEnoughTraffic =
          this.requestTimestamps.length >= this.config.minimumRequestCount;

        if (this.failures >= this.config.failureThreshold && hasEnoughTraffic) {
          this.transitionTo('OPEN');
        }
        break;
      }
    }
  }

  /**
   * Clear failure timestamps outside the failure window.
   */
  private clearOldFailures(): void {
    const cutoff = Date.now() - this.config.failureWindow;
    this.failureTimestamps = this.failureTimestamps.filter(ts => ts > cutoff);
    this.requestTimestamps = this.requestTimestamps.filter(ts => ts > cutoff);
    this.failures = this.failureTimestamps.length;
  }

  /**
   * Transition to a new state.
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChange = Date.now();

    // Reset counters on state change
    if (newState === 'CLOSED') {
      this.failures = 0;
      this.successes = 0;
      this.failureTimestamps = [];
      this.requestTimestamps = [];
    } else if (newState === 'HALF_OPEN') {
      this.successes = 0;
    }

    // Log state transition for monitoring
    Sentry.addBreadcrumb({
      category: 'circuit-breaker',
      message: `[${this.config.name}] State transition: ${oldState} -> ${newState}`,
      level: 'info',
      data: this.getStats(),
    });

    // Alert Sentry when the circuit opens so we know the service is failing
    if (newState === 'OPEN') {
      Sentry.captureMessage(
        `[${this.config.name}] Circuit breaker opened (${oldState} -> OPEN)`,
        {
          level: 'warning',
          extra: { ...this.getStats() },
        }
      );
    }
  }

  /**
   * Get current circuit breaker statistics.
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastStateChange: this.lastStateChange,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      requestsInWindow: this.requestTimestamps.length,
    };
  }

  /**
   * Get the current state.
   * Note: This is a pure getter. Auto-transition logic is handled in canExecute().
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Manually reset the circuit breaker.
   * Use with caution - primarily for testing.
   */
  reset(): void {
    this.transitionTo('CLOSED');
    this.totalFailures = 0;
    this.totalSuccesses = 0;
    this.lastFailureTime = null;
  }

  /**
   * Force the circuit to open.
   * Use for manual intervention when issues are detected.
   */
  forceOpen(): void {
    this.transitionTo('OPEN');
  }
}

// ============================================================================
// Circuit Open Error
// ============================================================================

/**
 * Error thrown when circuit breaker is open.
 */
export class CircuitOpenError extends Error {
  public readonly stats: CircuitBreakerStats;

  constructor(message: string, stats: CircuitBreakerStats) {
    super(message);
    this.name = 'CircuitOpenError';
    this.stats = stats;
  }
}

// ============================================================================
// Singleton Instance for Spotify
// ============================================================================

/**
 * Check whether an error represents a rate-limit (429) response.
 * Rate limits are transient back-pressure, not a sign of service failure,
 * so they should not count toward the circuit breaker failure threshold.
 */
function isRateLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  // IngestError / SpotifyError with a `code` field
  if ('code' in error) {
    const code = (error as Error & { code: string }).code;
    if (code === 'SPOTIFY_RATE_LIMITED' || code === 'RATE_LIMITED') return true;
  }

  // SpotifyError (dsp-enrichment provider) with a `statusCode` field
  if ('statusCode' in error) {
    const status = (error as Error & { statusCode: number }).statusCode;
    if (status === 429) return true;
  }

  // Generic error with a `status` field
  if ('status' in error) {
    const status = (error as Error & { status: number }).status;
    if (status === 429) return true;
  }

  return false;
}

/**
 * Global circuit breaker instance for Spotify API calls.
 *
 * Tuned to avoid false positives during transient error bursts:
 * - 10 real failures (excluding 429s) within a 2-minute window to trip
 * - At least 20 total requests in the window before the circuit can open
 * - 60s cool-down before probing recovery
 * - 2 consecutive successes required to close from HALF_OPEN
 */
export const spotifyCircuitBreaker = new CircuitBreaker({
  name: 'spotify',
  failureThreshold: 10, // Open after 10 real failures
  resetTimeout: 60_000, // Try again after 60 seconds
  successThreshold: 2, // Need 2 successes to close
  failureWindow: 120_000, // Count failures within 2 minutes
  minimumRequestCount: 20, // Need 20 requests before circuit can open
  shouldCount: (error: unknown) => !isRateLimitError(error),
});
