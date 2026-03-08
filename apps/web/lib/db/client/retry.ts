/**
 * Database Retry Logic
 *
 * Retry logic for transient database failures with exponential backoff.
 */

import { PERFORMANCE_THRESHOLDS } from '../config';
import { dbCircuitBreaker } from './circuit-breaker';
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
  /server\s+conn\s+crashed\??/i,
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

type RetryableErrorCandidate = {
  message?: unknown;
  name?: unknown;
};

function getErrorText(error: unknown): string[] {
  if (error instanceof Error) {
    return [error.message, error.name];
  }

  if (typeof error !== 'object' || error === null) {
    return [];
  }

  const candidate = error as RetryableErrorCandidate;
  return [candidate.message, candidate.name].flatMap(value =>
    typeof value === 'string' ? [value] : []
  );
}

/**
 * Check if an error is retryable (transient)
 */
export function isRetryableError(error: unknown): boolean {
  const errorText = getErrorText(error);

  if (errorText.length === 0) {
    return false;
  }

  return RETRYABLE_ERROR_PATTERNS.some(pattern =>
    errorText.some(value => pattern.test(value))
  );
}

/**
 * Execute an operation with retry logic for transient failures
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  context: string,
  maxRetries: number = DB_CONFIG.maxRetries
): Promise<T> {
  if (!Number.isInteger(maxRetries) || maxRetries < 1) {
    throw new RangeError(
      `Invalid maxRetries: ${maxRetries}. Expected a positive integer.`
    );
  }

  return dbCircuitBreaker.execute(
    async () => {
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

      throw lastError instanceof Error
        ? lastError
        : new Error(String(lastError));
    },
    {
      shouldCountFailure: isRetryableError,
    }
  );
}

export { DB_CONFIG };
