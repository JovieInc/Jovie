/**
 * Database Retry Logic
 *
 * Retry logic for transient database failures with exponential backoff.
 */

import { PERFORMANCE_THRESHOLDS } from '../config';
import { logDbError, logDbInfo } from './logging';

const DB_CONFIG = {
  maxRetries: PERFORMANCE_THRESHOLDS.maxRetries,
  retryDelay: PERFORMANCE_THRESHOLDS.retryDelay,
  retryBackoffMultiplier: PERFORMANCE_THRESHOLDS.retryBackoffMultiplier,
} as const;

/**
 * Pre-compiled regex patterns for retryable error detection.
 * Compiled once at module load time for optimal performance.
 */
const RETRYABLE_ERROR_PATTERNS: readonly RegExp[] = [
  /connection.*reset/i,
  /connection.*terminated/i,
  /connection.*closed/i,
  /server conn crashed\??/i,
  /connection.*unexpectedly/i,
  /timeout/i,
  /network/i,
  /temporary/i,
  /transient/i,
  /econnreset/i,
  /econnrefused/i,
  /etimedout/i,
  /socket hang up/i,
  /database is starting up/i,
  /too many connections/i,
  /connection pool exhausted/i,
  /client has encountered a connection error/i,
  /terminating connection due to administrator command/i,
] as const;

/**
 * Check if an error is retryable (transient)
 */
export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  return RETRYABLE_ERROR_PATTERNS.some(
    pattern => pattern.test(error.message) || pattern.test(error.name)
  );
}

/**
 * Execute an operation with retry logic for transient failures
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  context: string,
  maxRetries = DB_CONFIG.maxRetries
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      if (attempt > 1) {
        logDbInfo(
          'retry_success',
          `Operation succeeded on attempt ${attempt}`,
          { context }
        );
      }
      return result;
    } catch (error) {
      lastError = error;

      // Check if error is retryable
      const isRetryable = isRetryableError(error);

      logDbError('retry_attempt', error, {
        context,
        attempt,
        maxRetries,
        isRetryable,
        willRetry: attempt < maxRetries && isRetryable,
      });

      // Don't retry if not retryable or on last attempt
      if (!isRetryable || attempt >= maxRetries) {
        break;
      }

      // Exponential backoff delay
      const delay =
        DB_CONFIG.retryDelay *
        Math.pow(DB_CONFIG.retryBackoffMultiplier, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export { DB_CONFIG };
