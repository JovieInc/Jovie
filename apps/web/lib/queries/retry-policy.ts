/**
 * Shared classified retry policy for TanStack Query (JOV-6185).
 *
 * Replaces the previous unconditional `retry: 3` default. Classification
 * rules:
 * - Intentional cancellation (AbortError / FetchCanceledError): never retried.
 * - Ordinary auth/validation/schema failures (4xx other than 408/429,
 *   decode errors, payload-limit errors, non-transport errors): never retried.
 * - Transient network, deadline/timeout, 5xx, and 429 failures: retried
 *   with bounded attempts, a wall-clock budget, exponential backoff with
 *   jitter, and bounded Retry-After handling.
 *
 * Mutations keep `retry: 0` in the provider defaults. A mutation may opt in
 * only when the server operation is idempotent or explicitly documented as
 * safe to retry; Pacer/transport-level retries must not multiply the same
 * operation's budget.
 */

import { FetchCanceledError, FetchError } from './fetch';

/** Extra retries after the initial attempt (3 total attempts). */
export const QUERY_RETRY_MAX_RETRIES = 2;

export const QUERY_RETRY_BASE_DELAY_MS = 1_000;
export const QUERY_RETRY_MAX_DELAY_MS = 30_000;
/** Honored Retry-After hints are capped so a server cannot park a query. */
export const QUERY_RETRY_AFTER_MAX_MS = 30_000;
/**
 * Wall-clock budget for one logical query operation's retry cycle.
 * Structurally bounded anyway: maxAttempts * transportDeadline + capped
 * delays; this stops early when the budget is already spent.
 */
export const QUERY_RETRY_BUDGET_MS = 90_000;

const JITTER_RATIO = 0.25;

export function isCancelledQueryError(error: unknown): boolean {
  return (
    error instanceof FetchCanceledError ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

/**
 * Whether an error thrown by a queryFn is transient and safe to retry.
 * Unknown (non-transport) errors are treated as domain failures and stop.
 */
export function isRetryableQueryError(error: unknown): boolean {
  if (isCancelledQueryError(error)) return false;
  if (error instanceof FetchError) return error.isRetryable();
  return false;
}

/**
 * Bounded Retry-After handling for 429 responses. Accepts delay-seconds or
 * an HTTP date; unparseable or excessive hints fall back to backoff.
 */
export function parseRetryAfterMs(error: unknown): number | undefined {
  if (!(error instanceof FetchError) || error.status !== 429) {
    return undefined;
  }
  const header = error.response?.headers?.get?.('retry-after');
  if (!header) return undefined;

  const seconds = Number(header);
  const ms = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(header) - Date.now();
  if (!Number.isFinite(ms)) return undefined;
  return Math.min(Math.max(ms, 0), QUERY_RETRY_AFTER_MAX_MS);
}

export interface ClassifiedQueryRetryPolicy {
  readonly retry: (failureCount: number, error: Error) => boolean;
  readonly retryDelay: (attemptIndex: number, error: Error) => number;
}

/**
 * Create a classified retry policy. The returned `retry`/`retryDelay` pair
 * is one retry owner for an operation — pass both (or neither) so budgets
 * do not silently multiply across layers.
 *
 * Wall-clock tracking resets when a new operation starts (failureCount
 * returns to 1), so a single shared instance is safe for provider defaults.
 */
export function createClassifiedQueryRetryPolicy(options?: {
  maxRetries?: number;
  budgetMs?: number;
}): ClassifiedQueryRetryPolicy {
  const maxRetries = options?.maxRetries ?? QUERY_RETRY_MAX_RETRIES;
  const budgetMs = options?.budgetMs ?? QUERY_RETRY_BUDGET_MS;

  let lastFailureCount = 0;
  let cycleStartedAt = -1;

  return {
    retry(failureCount, error) {
      const now = Date.now();
      // TanStack invokes this with the count of retries so far (0 after the
      // first failure). A lower-or-equal count or a fresh cycle means a new
      // operation started, so restart the wall-clock budget.
      if (cycleStartedAt < 0 || failureCount <= lastFailureCount) {
        cycleStartedAt = now;
      }
      lastFailureCount = failureCount;

      if (failureCount >= maxRetries) return false;
      if (now - cycleStartedAt > budgetMs) return false;
      return isRetryableQueryError(error);
    },
    retryDelay(attemptIndex, error) {
      const retryAfter = parseRetryAfterMs(error);
      if (retryAfter !== undefined) return retryAfter;

      const base = Math.min(
        QUERY_RETRY_BASE_DELAY_MS * 2 ** attemptIndex,
        QUERY_RETRY_MAX_DELAY_MS
      );
      const jitter = base * JITTER_RATIO;
      // NOSONAR (S2245) - non-security jitter to avoid thundering herd
      return Math.max(0, base + (Math.random() * 2 - 1) * jitter);
    },
  };
}

/** Shared policy instance used by the client QueryProvider defaults. */
export const defaultQueryRetryPolicy = createClassifiedQueryRetryPolicy();
