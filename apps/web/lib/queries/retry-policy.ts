/**
 * Classified retry policy for TanStack Query (JOV-6185).
 *
 * One retry owner: Query. The transport (`lib/queries/fetch.ts`) classifies
 * every failure into a `FetchError` kind; this module decides whether the
 * failure may be retried and how long to wait between attempts.
 *
 * Classification:
 * - Never retry: intentional cancellation (AbortError / 'canceled'),
 *   decode/schema failures ('decode'), oversized payloads ('payload-limit'),
 *   and ordinary 4xx HTTP errors (auth 401/403, validation 422, etc.).
 * - Retryable (bounded): network failures, request deadlines, HTTP 408,
 *   HTTP 429 (bounded Retry-After), and 5xx server errors.
 * - Unclassified errors (not a `FetchError`) are not retried: we cannot
 *   prove they are transient, and silently retrying them would mask bugs.
 *
 * Wall-clock budget: attempts are bounded by {@link QUERY_RETRY_MAX_ATTEMPTS},
 * each attempt carries the transport deadline (default 10s, overridable per
 * query), and each backoff delay is capped by {@link QUERY_RETRY_MAX_DELAY_MS}
 * (or {@link QUERY_RETRY_AFTER_MAX_MS} for server-directed Retry-After). The
 * worst-case retry wall clock is therefore
 * `attempts * (deadline + maxDelay)` — see {@link QUERY_RETRY_WALL_CLOCK_BUDGET_MS}
 * for the bound under the default 10s deadline.
 */

import { FetchError } from './fetch';

/** Maximum retry attempts after the initial attempt. */
export const QUERY_RETRY_MAX_ATTEMPTS = 3;

/** Base backoff delay; doubles each attempt up to the cap. */
export const QUERY_RETRY_BASE_DELAY_MS = 500;

/** Upper bound for a single backoff delay (excludes jitter headroom). */
export const QUERY_RETRY_MAX_DELAY_MS = 10_000;

/** Upper bound when honoring a server-provided `Retry-After` header. */
export const QUERY_RETRY_AFTER_MAX_MS = 15_000;

/** Upper bound on the random jitter added to each backoff delay. */
export const QUERY_RETRY_JITTER_MS = 250;

/**
 * Worst-case wall-clock budget for one logical operation's retry chain under
 * the default transport deadline: every attempt is bounded by its fetch
 * deadline plus its preceding backoff delay.
 */
export const QUERY_RETRY_WALL_CLOCK_BUDGET_MS =
  QUERY_RETRY_MAX_ATTEMPTS * QUERY_RETRY_MAX_DELAY_MS +
  (QUERY_RETRY_MAX_ATTEMPTS + 1) * 10_000;

/**
 * Whether an error represents a transient failure that may be retried.
 * Returns false for cancellation, schema/decode failures, ordinary 4xx,
 * and any error the transport could not classify.
 */
export function isRetryableQueryError(error: unknown): boolean {
  if (error instanceof FetchError) {
    return error.isRetryable();
  }
  // Preserve AbortError identity for non-transport cancellations.
  if (error instanceof Error && error.name === 'AbortError') {
    return false;
  }
  return false;
}

/**
 * Classified retry predicate for TanStack Query `retry` options.
 * Stops on non-transient classifications; otherwise allows up to
 * `maxRetries` retries after the initial attempt.
 */
export function createClassifiedRetry(
  maxRetries: number = QUERY_RETRY_MAX_ATTEMPTS
): (failureCount: number, error: Error) => boolean {
  // `failureCount` is 0-based retries already attempted: a value of 0 is the
  // first retry decision. `< maxRetries` therefore allows exactly
  // `maxRetries` retries after the initial attempt.
  return (failureCount, error) =>
    failureCount < maxRetries && isRetryableQueryError(error);
}

/** Shared classified retry predicate with the default attempt bound. */
export const classifiedQueryRetry: (
  failureCount: number,
  error: Error
) => boolean = createClassifiedRetry();

/** Parse a `Retry-After` header (delta-seconds or HTTP-date) into ms. */
export function retryAfterMs(response: Response | undefined): number | null {
  const header = response?.headers?.get?.('retry-after');
  if (!header) return null;

  const seconds = Number.parseInt(header, 10);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const at = Date.parse(header);
  if (!Number.isNaN(at)) {
    return Math.max(0, at - Date.now());
  }
  return null;
}

/**
 * Classified backoff delay for TanStack Query `retryDelay` options.
 *
 * Honors `Retry-After` on rate-limited/unavailable responses (bounded by
 * {@link QUERY_RETRY_AFTER_MAX_MS}); otherwise exponential backoff with
 * jitter, capped at {@link QUERY_RETRY_MAX_DELAY_MS}.
 */
export function classifiedRetryDelay(
  attemptIndex: number,
  error: Error
): number {
  if (error instanceof FetchError) {
    const directed =
      error.status === 429 || error.status === 503
        ? retryAfterMs(error.response)
        : null;
    if (directed !== null) {
      return Math.min(directed, QUERY_RETRY_AFTER_MAX_MS);
    }
  }

  const backoff = Math.min(
    QUERY_RETRY_BASE_DELAY_MS * 2 ** attemptIndex,
    QUERY_RETRY_MAX_DELAY_MS
  );
  return backoff + Math.random() * QUERY_RETRY_JITTER_MS;
}
