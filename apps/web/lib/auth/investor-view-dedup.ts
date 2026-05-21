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
 *
 * Security: visitorKey is SHA-256 hashed before use as a Redis key component
 * so that raw investor portal tokens never appear in Redis key-space (prevents
 * token leakage via Redis logs, backups, or monitoring tooling).
 */
import { getRedis } from '@/lib/redis';

const DEDUP_TTL_SECONDS = 300; // 5 minutes
const DEDUP_KEY_PREFIX = 'investor:view:dedup';

export interface ShouldRecordInvestorViewOptions {
  /**
   * Stable per-visitor key (e.g. the investor token).
   * Hashed with SHA-256 before use in the Redis key, so the raw
   * token never appears in Redis key-space.
   */
  readonly visitorKey: string;
  /** Normalized route path (query strings already stripped by the caller). */
  readonly route: string;
}

/**
 * Derive a stable, non-reversible key component from `visitorKey`.
 * Uses SHA-256 (via the Web Crypto API, available in Node 22 + edge runtimes).
 * Returns the first 16 hex chars — enough entropy, short enough to keep keys tidy.
 */
async function hashVisitorKey(visitorKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(visitorKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
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

  try {
    const redis = getRedis();

    if (!redis) {
      // Redis unavailable: fail-open, record the view.
      return true;
    }

    const keyHash = await hashVisitorKey(visitorKey);
    const redisKey = `${DEDUP_KEY_PREFIX}:${keyHash}:${route}`;

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

/**
 * Release the dedup lock for a (visitorKey, route) pair.
 * Call this when the DB write fails so the next request can retry.
 * Fail-silently: Redis unavailable or DEL fails → no action needed.
 */
export async function releaseInvestorViewDedup(
  opts: ShouldRecordInvestorViewOptions
): Promise<void> {
  const { visitorKey, route } = opts;

  try {
    const redis = getRedis();
    if (!redis) return;

    const keyHash = await hashVisitorKey(visitorKey);
    const redisKey = `${DEDUP_KEY_PREFIX}:${keyHash}:${route}`;
    await redis.del(redisKey);
  } catch {
    // Best-effort cleanup — do not surface errors.
  }
}
