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

// ============================================================================
// Types
// ============================================================================

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit. Default: 5 */
  failureThreshold: number;
  /** Time in ms before attempting recovery. Default: 30000 (30s) */
  resetTimeout: number;
  /** Number of successful calls to close circuit. Default: 2 */
  successThreshold: number;
  /** Time window in ms to track failures. Default: 60000 (1min) */
  failureWindow: number;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  lastStateChange: number;
  totalFailures: number;
  totalSuccesses: number;
}

// ============================================================================
// Environment Configuration
// ============================================================================

/**
 * Parse an environment variable as a number with a fallback.
 */
function parseEnvNumber(envVar: string | undefined, fallback: number): number {
  if (!envVar) return fallback;
  const parsed = parseInt(envVar, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * Create circuit breaker config from environment variables.
 * Environment variables allow runtime tuning without code changes.
 *
 * Environment variables:
 * - CIRCUIT_BREAKER_FAILURE_THRESHOLD: failures to open (default: 5)
 * - CIRCUIT_BREAKER_RESET_TIMEOUT_MS: ms before recovery attempt (default: 30000)
 * - CIRCUIT_BREAKER_SUCCESS_THRESHOLD: successes to close (default: 2)
 * - CIRCUIT_BREAKER_FAILURE_WINDOW_MS: failure tracking window (default: 60000)
 */
function createDefaultConfig(): CircuitBreakerConfig {
  return {
    failureThreshold: parseEnvNumber(
      process.env['CIRCUIT_BREAKER_FAILURE_THRESHOLD'],
      5
    ),
    resetTimeout: parseEnvNumber(
      process.env['CIRCUIT_BREAKER_RESET_TIMEOUT_MS'],
      30_000
    ),
    successThreshold: parseEnvNumber(
      process.env['CIRCUIT_BREAKER_SUCCESS_THRESHOLD'],
      2
    ),
    failureWindow: parseEnvNumber(
      process.env['CIRCUIT_BREAKER_FAILURE_WINDOW_MS'],
      60_000
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
 * const breaker = new CircuitBreaker({ failureThreshold: 5 });
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

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
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
        // Clean old failures and recount atomically
        const cutoff = now - this.config.failureWindow;
        this.failureTimestamps = this.failureTimestamps.filter(
          ts => ts > cutoff
        );
        this.failures = this.failureTimestamps.length;

        if (this.failures >= this.config.failureThreshold) {
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
    } else if (newState === 'HALF_OPEN') {
      this.successes = 0;
    }

    // Log state transition for monitoring
    console.log('[Circuit Breaker] State transition', {
      from: oldState,
      to: newState,
      stats: this.getStats(),
    });
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
 * Global circuit breaker instance for Spotify API calls.
 * Configured with conservative thresholds to prevent cascading failures.
 */
export const spotifyCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5, // Open after 5 failures
  resetTimeout: 30_000, // Try again after 30 seconds
  successThreshold: 2, // Need 2 successes to close
  failureWindow: 60_000, // Count failures within 1 minute
});
