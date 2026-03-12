/**
 * Database Retry Logic
 *
 * Retry logic for transient database failures with exponential backoff.
 */

import { executeWithRetry } from '@/lib/resilience/primitives';
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
  // Neon/Drizzle wraps low-level connection failures as "Failed query: <sql>".
  // These are transient (dropped WebSocket, cold-start timeout) and should be retried.
  /^failed query/i,
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
      let attempts = 0;

      return executeWithRetry(operation, {
        maxRetries: Math.max(0, maxRetries - 1),
        baseDelayMs: DB_CONFIG.retryDelay,
        backoffMultiplier: DB_CONFIG.retryBackoffMultiplier,
        isRetryable: isRetryableError,
        onRetry: ({ attempt, maxRetries: retryCount, error }) => {
          attempts = attempt;

          const totalAttempts = retryCount + 1;
          const willRetry = attempt <= retryCount;
          logDbError(
            'retry_attempt',
            error,
            {
              context,
              attempt,
              maxRetries: totalAttempts,
              isRetryable: true,
              willRetry,
            },
            { asBreadcrumb: willRetry }
          );
        },
      })
        .then(result => {
          if (attempts > 0) {
            logDbInfo(
              'retry_success',
              `Operation succeeded on attempt ${attempts + 1}`,
              { context }
            );
          }
          return result;
        })
        .catch(error => {
          const isRetryable = isRetryableError(error);
          const totalAttempts = maxRetries;
          logDbError(
            'retry_attempt',
            error,
            {
              context,
              attempt: Math.min(attempts + 1, totalAttempts),
              maxRetries: totalAttempts,
              isRetryable,
              willRetry: false,
            },
            { asBreadcrumb: false }
          );
          throw error;
        });
    },
    {
      shouldCountFailure: isRetryableError,
    }
  );
}

export { DB_CONFIG };
