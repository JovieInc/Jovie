import 'server-only';

import { randomInt } from 'node:crypto';
import { unwrapDatabaseError } from '@/lib/errors/onboarding';

/**
 * Postgres SQLSTATE codes that indicate a transient transaction conflict and
 * are safe to retry verbatim. These come from concurrent serializable
 * transactions stepping on each other and resolve on retry without any
 * caller-side adjustment.
 */
const RETRYABLE_SQLSTATES = new Set([
  '40001', // serialization_failure
  '40P01', // deadlock_detected
]);

interface SerializableRetryOptions {
  readonly attempts?: number;
  /** Initial backoff in ms; doubles each retry, plus up to 25ms jitter. */
  readonly baseDelayMs?: number;
  /** Hook for tests to inject a deterministic sleep. */
  readonly sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

function isRetryableTransactionError(error: unknown): boolean {
  const unwrapped = unwrapDatabaseError(error);
  if (unwrapped.code && RETRYABLE_SQLSTATES.has(unwrapped.code)) return true;

  const directCode = (error as { code?: unknown })?.code;
  if (typeof directCode === 'string' && RETRYABLE_SQLSTATES.has(directCode)) {
    return true;
  }

  return false;
}

/**
 * Run a serializable-transaction-bearing operation with bounded retry on
 * Postgres serialization/deadlock failures. Re-throws immediately on any
 * non-retryable error.
 *
 * Backoff is exponential with cryptographic jitter: baseDelayMs * 2^i + <25ms.
 */
export async function withSerializableRetry<T>(
  fn: () => Promise<T>,
  options: SerializableRetryOptions = {}
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 50;
  const sleep = options.sleep ?? defaultSleep;

  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryableTransactionError(error)) throw error;
      if (i < attempts - 1) {
        const delay = baseDelayMs * 2 ** i + randomInt(0, 25_000) / 1000;
        await sleep(delay);
      }
    }
  }
  throw lastError;
}
