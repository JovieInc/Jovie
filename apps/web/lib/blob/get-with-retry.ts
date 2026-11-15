import 'server-only';

import { executeWithRetry } from '@/lib/resilience/primitives';
import { logger } from '@/lib/utils/logger';

/**
 * Bounded retry for server-side Vercel Blob reads.
 *
 * The Blob SDK's `get()` throws `BlobError("Vercel Blob: Failed to fetch
 * blob: <status> <statusText>")` when the blob's download edge returns a
 * non-OK response (404 comes back as `null` instead, so a thrown BlobError
 * with a status is never a missing blob). Upstream 5xx/429 responses are
 * transient and safe to retry: `get()` is idempotent and the SDK throws
 * before any body stream is handed back, so a retry can never double-read.
 *
 * The final failure is rethrown unchanged — this helper only adds retries
 * and a dev/preview warning per retry; error reporting stays with the
 * caller's existing capture boundary.
 */

const BLOB_READ_RETRIES = 2;
const BLOB_READ_BASE_DELAY_MS = 200;
const BLOB_READ_MAX_DELAY_MS = 2_000;
const BLOB_STATUS_PATTERN = /Failed to fetch blob: (\d{3})/;

export function isTransientBlobReadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const statusMatch = BLOB_STATUS_PATTERN.exec(error.message);
  if (statusMatch) {
    const status = Number(statusMatch[1]);
    return status === 429 || status >= 500;
  }

  // Raw network failures from the underlying fetch (no HTTP status at all).
  return /fetch failed|network|econnreset|etimedout|socket hang up/i.test(
    error.message
  );
}

export async function getBlobWithRetry<T>(
  operation: () => Promise<T>,
  context: string
): Promise<T> {
  return executeWithRetry(operation, {
    maxRetries: BLOB_READ_RETRIES,
    baseDelayMs: BLOB_READ_BASE_DELAY_MS,
    maxDelayMs: BLOB_READ_MAX_DELAY_MS,
    backoffMultiplier: 2,
    jitterRatio: 0.2,
    isRetryable: isTransientBlobReadError,
    onRetry: ({ attempt, maxRetries, delayMs, error }) => {
      logger.warn(
        `[blob-retry] ${context}: transient blob read failure ` +
          `(attempt ${attempt}/${maxRetries + 1}, retry in ` +
          `${Math.round(delayMs)}ms): ${error.message}`
      );
    },
  });
}
