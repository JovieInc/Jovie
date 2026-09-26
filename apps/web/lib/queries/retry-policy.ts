/**
 * Classified retry policy for TanStack Query (JOV-6185).
 *
 * One shared policy owns query retries so provider defaults, cache presets,
 * and per-query overrides cannot silently multiply an operation's budget:
 *
 * - Stop: intentional cancellation (`AbortError` / kind `canceled`), auth and
 *   ordinary 4xx failures, schema/decode failures, and payload-limit failures.
 * - Retry: explicitly transient cases — network errors, request deadlines,
 *   HTTP 408/429, and 5xx — bounded to {@link QUERY_MAX_RETRIES} attempts with
 *   exponential backoff + jitter and bounded `Retry-After` honoring.
 *
 * The transport (`fetchWithTimeout`) performs no retries of its own, so Query
 * is the single retry owner for a logical operation. Mutations stay at
 * `retry: 0` at the provider; per-mutation opt-ins require an idempotent or
 * explicitly safe server contract.
 */
import { FetchError } from './fetch';

/** Maximum retry attempts after the initial attempt (4 total tries). */
export const QUERY_MAX_RETRIES = 3;
export const QUERY_RETRY_BASE_DELAY_MS = 1_000;
export const QUERY_RETRY_MAX_DELAY_MS = 30_000;
/** `Retry-After` hints are honored only up to this bound. */
export const QUERY_RETRY_AFTER_MAX_MS = 30_000;
const QUERY_RETRY_JITTER_RATIO = 0.25;

/**
 * Whether a query failure is eligible for an automatic retry.
 * Only classified transient failures from the canonical fetch transport
 * qualify; unknown errors and domain failures do not retry.
 */
export function isRetryableQueryError(error: unknown): boolean {
  return error instanceof FetchError && error.isRetryable();
}

/**
 * TanStack Query `retry` function: bounded, classified retries.
 * `failureCount` counts completed retries (0 on the first failure), matching
 * the semantics of a numeric `retry` bound.
 */
export function classifiedQueryRetry(
  failureCount: number,
  error: unknown
): boolean {
  return failureCount < QUERY_MAX_RETRIES && isRetryableQueryError(error);
}

function parseRetryAfterHeaderMs(raw: string): number | undefined {
  const trimmed = raw.trim();
  const seconds = Number.parseInt(trimmed, 10);
  if (Number.isFinite(seconds) && String(seconds) === trimmed) {
    return Math.max(0, seconds) * 1000;
  }
  const dateMs = Date.parse(trimmed);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }
  return undefined;
}

/**
 * Bounded `Retry-After` delay for throttled/transient HTTP responses.
 */
export function retryAfterDelayMs(error: unknown): number | undefined {
  if (!(error instanceof FetchError)) {
    return undefined;
  }
  if (error.status !== 429 && error.status !== 503) {
    return undefined;
  }
  const raw = error.response?.headers.get('retry-after');
  if (!raw) {
    return undefined;
  }
  const parsed = parseRetryAfterHeaderMs(raw);
  if (parsed === undefined) {
    return undefined;
  }
  return Math.min(parsed, QUERY_RETRY_AFTER_MAX_MS);
}

/**
 * TanStack Query `retryDelay` function: exponential backoff with jitter,
 * honoring bounded `Retry-After` hints on 429/503 responses.
 */
export function classifiedQueryRetryDelay(
  attemptIndex: number,
  error: unknown
): number {
  const retryAfter = retryAfterDelayMs(error);
  if (retryAfter !== undefined) {
    return retryAfter;
  }
  const exponential = QUERY_RETRY_BASE_DELAY_MS * 2 ** attemptIndex;
  const jitterRange = exponential * QUERY_RETRY_JITTER_RATIO;
  const jitter = Math.random() * jitterRange * 2 - jitterRange; // NOSONAR (S2245) - Non-security use: backoff jitter to prevent thundering herd
  return Math.max(0, Math.min(exponential + jitter, QUERY_RETRY_MAX_DELAY_MS));
}

/** Ready-to-spread query options applying the shared classified policy. */
export const CLASSIFIED_QUERY_RETRY = {
  retry: classifiedQueryRetry,
  retryDelay: classifiedQueryRetryDelay,
} as const;
