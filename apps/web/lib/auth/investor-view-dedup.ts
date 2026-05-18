/**
 * Redis-backed dedup guard for investor view tracking.
 *
 * Prevents the same (visitorKey, route) pair from generating a new
 * investor_views row on every request within a 5-minute window.
 *
 * Per .claude/rules/security.md: dedup state MUST be in durable storage
 * (Redis), never in-memory — in-memory state resets on cold start.
 *
 * Fail-open semantics: if Redis is unreachable, return true so the view
 * is still recorded. Better to have duplicate rows than silently drop data.
 */
import { getRedis } from '@/lib/redis';

const DEDUP_TTL_SECONDS = 300; // 5 minutes
const DEDUP_KEY_PREFIX = 'investor:view:dedup';

export interface ShouldRecordInvestorViewOptions {
  /** Stable per-visitor key. Use userId if authed; otherwise a stable cookie+IP hash. */
  readonly visitorKey: string;
  /** Normalized route path (query strings already stripped by the caller). */
  readonly route: string;
}

/**
 * Returns true when this (visitorKey, route) should generate a new view row.
 * Returns false when the same pair was already recorded within the last 5 minutes.
 *
 * Fail-open: if Redis is unreachable or throws, returns true so the row is recorded.
 */
export async function shouldRecordInvestorView(
  opts: ShouldRecordInvestorViewOptions
): Promise<boolean> {
  const { visitorKey, route } = opts;
  const redisKey = `${DEDUP_KEY_PREFIX}:${visitorKey}:${route}`;

  try {
    const redis = getRedis();

    if (!redis) {
      // Redis unavailable: fail-open, record the view.
      return true;
    }

    // SET NX EX: atomic — sets the key only when it does not already exist.
    // Returns "OK" when the key was newly created (first visit in the window).
    // Returns null when the key already existed (within the dedup window).
    const result = await redis.set(redisKey, 1, {
      nx: true,
      ex: DEDUP_TTL_SECONDS,
    });

    // "OK" → first occurrence in the window → record.
    // null → already recorded within the window → skip.
    return result === 'OK';
  } catch {
    // If Redis throws unexpectedly, fail-open: record the view.
    return true;
  }
}
