/**
 * Retry utilities for TanStack Pacer async operations.
 */

import { isAbortError, isNetworkError } from './errors';

/** Default retry configuration for network operations */
export const RETRY_DEFAULTS = {
  FAST: { maxAttempts: 2, baseWait: 500, backoff: 'exponential' as const },
  SAVE: { maxAttempts: 3, baseWait: 1000, backoff: 'exponential' as const },
} as const;

/**
 * Check if an error is retryable.
 * Abort errors and non-transient HTTP errors (4xx) should NOT be retried.
 */
export function isRetryableError(err: unknown): boolean {
  if (isAbortError(err)) return false;
  if (isNetworkError(err)) return true;

  if (err instanceof Error) {
    const match = /HTTP\s*(\d{3})/i.exec(err.message);
    if (match) {
      const status = Number.parseInt(match[1], 10);
      return status >= 500 || status === 408 || status === 429;
    }
  }

  return true;
}
