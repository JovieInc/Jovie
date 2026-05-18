/**
 * Redis-backed Sentry rate-limiter for middleware 503 paths.
 *
 * Prevents alert storms when Clerk is degraded: only fires captureError
 * once per hostname per 60-second window. If Redis is unreachable the
 * function falls open — captureError is still called, trading a possible
 * duplicate alert for guaranteed observability.
 *
 * Per .claude/rules/security.md: rate-limit state MUST be in durable
 * storage (Redis), never in-memory — in-memory state resets on cold start.
 */
import { captureError } from '@/lib/error-tracking';
import { getRedis } from '@/lib/redis';

const RATE_LIMIT_TTL_SECONDS = 60;

export interface CaptureErrorWithRateLimitOptions {
  /** Additional context forwarded to captureError. */
  readonly context?: Record<string, unknown>;
}

/**
 * Fire captureError for a hostname-scoped 503 event, rate-limited to once
 * per RATE_LIMIT_TTL_SECONDS window.
 *
 * Returns true when captureError was actually called (first event in window),
 * false when the event was suppressed (subsequent events in the same window).
 * If Redis is unreachable, falls open: fires captureError and returns true.
 */
export async function captureErrorWithHostnameLimit(
  message: string,
  error: unknown,
  hostname: string,
  opts?: CaptureErrorWithRateLimitOptions
): Promise<boolean> {
  const redisKey = `sentry:rate:clerk-degraded:${hostname}`;

  try {
    const redis = getRedis();

    if (redis) {
      // SET NX EX is a single atomic operation: sets the key only when it does
      // not exist, with a TTL. Returns "OK" on the first call (new key), null
      // on subsequent calls (key already exists).
      // Using SET NX EX instead of INCR + EXPIRE avoids the non-atomic gap
      // where INCR succeeds but EXPIRE fails, leaving the key without a TTL
      // and permanently silencing alerts for that hostname.
      const result = await redis.set(redisKey, 1, {
        nx: true,
        ex: RATE_LIMIT_TTL_SECONDS,
      });

      if (result === 'OK') {
        // First event in the window.
        await captureError(message, error, {
          hostname,
          ...opts?.context,
        });
        return true;
      }

      // Subsequent events within the window are suppressed.
      return false;
    }

    // Redis unavailable: fail-open for observability.
    await captureError(message, error, {
      hostname,
      rateLimit: 'redis-unavailable',
      ...opts?.context,
    });
    return true;
  } catch {
    // If anything in the rate-limit path throws, still fire captureError
    // so the underlying incident isn't silently swallowed.
    try {
      await captureError(message, error, {
        hostname,
        rateLimit: 'rate-limit-error',
        ...opts?.context,
      });
    } catch {
      // ignore secondary errors
    }
    return true;
  }
}
