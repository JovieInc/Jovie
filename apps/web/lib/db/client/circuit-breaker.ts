/**
 * Database Circuit Breaker
 *
 * Prevents cascading failures when the database is slow or unavailable.
 * Uses the shared CircuitBreaker implementation with DB-specific defaults.
 */

import 'server-only';

import {
  CircuitBreaker,
  type CircuitBreakerStats,
  CircuitOpenError,
} from '@/lib/spotify/circuit-breaker';
import { DB_CIRCUIT_BREAKER_CONFIG } from '../config';

const RETRY_AFTER_SECONDS = Math.ceil(
  DB_CIRCUIT_BREAKER_CONFIG.resetTimeout / 1000
);

/**
 * Error thrown when the database circuit breaker is open.
 */
export class DbCircuitOpenError extends CircuitOpenError {
  public readonly status = 503;
  public readonly retryAfterSeconds = RETRY_AFTER_SECONDS;

  constructor(stats: CircuitBreakerStats, context?: string) {
    const message = context
      ? `Database circuit breaker is open (${context}). Service unavailable.`
      : 'Database circuit breaker is open. Service unavailable.';
    super(message, stats);
    this.name = 'DbCircuitOpenError';
  }
}

/**
 * Global circuit breaker instance for database operations.
 */
export const dbCircuitBreaker = new CircuitBreaker(DB_CIRCUIT_BREAKER_CONFIG);

/**
 * Get current circuit breaker statistics.
 */
export function getDbCircuitBreakerStats(): CircuitBreakerStats {
  return dbCircuitBreaker.getStats();
}
