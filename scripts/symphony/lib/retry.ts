/**
 * Tiny retry-with-jittered-exponential-backoff helper. Used by every
 * outbound HTTP call from the Air so transient 429/5xx/network blips
 * don't translate into a missed brain dump or a noisy Telegram alert.
 */

export interface RetryOptions {
  readonly attempts?: number;
  readonly baseMs?: number;
  readonly maxMs?: number;
  /** Caller-visible label for log attribution. */
  readonly caller: string;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const baseMs = options.baseMs ?? 500;
  const maxMs = options.maxMs ?? 8000;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      // Honor the `permanent` flag callers can attach to errors they know
      // are 4xx-style permanent (e.g. 401, 403). Retrying those just wastes
      // time and floods the upstream rate limiter.
      if (
        err instanceof Error &&
        (err as Error & { permanent?: boolean }).permanent === true
      ) {
        break;
      }
      if (i === attempts - 1) break;
      const exp = Math.min(maxMs, baseMs * 2 ** i);
      const jitter = Math.random() * exp * 0.3;
      await new Promise(resolve => setTimeout(resolve, exp + jitter));
    }
  }
  throw new Error(
    `withRetry(${options.caller}) failed after ${attempts} attempts: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`
  );
}
