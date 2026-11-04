import 'server-only';

import { captureWarning } from '@/lib/error-tracking';
import {
  type HandleAvailabilityResult,
  normalizeHandleCandidate,
  toHandleAvailabilityResult,
} from '@/lib/onboarding/handle-availability';
import { getRedis } from '@/lib/redis';

const HANDLE_CACHE_KEY_PREFIX = 'onboarding:handle-availability:';
const HANDLE_AVAILABLE_TTL_SECONDS = 300; // 5 minutes — available handles can be claimed quickly
// 10 minutes. Handles are released by renames, detached fixtures and deleted
// accounts, and not every release path invalidates this key; a 30-day TTL
// showed a free handle as "taken" in onboarding (2026-10-29 canary walk).
// A miss is one indexed lookup, so a short TTL costs little.
const HANDLE_UNAVAILABLE_TTL_SECONDS = 60 * 10;

function getHandleCacheKey(handle: string): string {
  return `${HANDLE_CACHE_KEY_PREFIX}${normalizeHandleCandidate(handle)}`;
}

export async function getCachedHandleAvailability(
  handle: string
): Promise<boolean | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    // Upstash deserializes stored values: '1' comes back as the number 1,
    // so a strict `=== '1'` read every cached "available" as taken. Every
    // handle checked twice within the TTL showed "is not available"
    // (2026-10-31 golden-path walk; repro: check the same handle twice).
    const value = await redis.get<string | number | boolean>(
      getHandleCacheKey(handle)
    );
    if (value === null || value === undefined) return null;
    const raw = String(value);
    if (raw === '1' || raw === 'true') return true;
    if (raw === '0' || raw === 'false') return false;
    return null;
  } catch (error) {
    captureWarning('[handle-availability] Redis read failed', error);
    return null;
  }
}

/**
 * Read cache and project through the canonical availability contract.
 * Returns null on cache miss, and also on a cached "taken", which is advisory
 * (stale entries outlive deleted rows), so callers fall through to the DB.
 */
export async function getCachedHandleAvailabilityResult(
  handle: string
): Promise<HandleAvailabilityResult | null> {
  const cached = await getCachedHandleAvailability(handle);
  if (cached !== true) return null;
  return toHandleAvailabilityResult({ handle, available: true });
}

export async function cacheHandleAvailability(
  handle: string,
  available: boolean
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.set(getHandleCacheKey(handle), available ? '1' : '0', {
      ex: available
        ? HANDLE_AVAILABLE_TTL_SECONDS
        : HANDLE_UNAVAILABLE_TTL_SECONDS,
    });
  } catch (error) {
    captureWarning('[handle-availability] Redis write failed', error);
  }
}

/**
 * Invalidate the cached availability for a specific handle.
 * Call this when a username is changed or an account is deleted
 * so a stale "unavailable" entry clears immediately instead of at TTL.
 */
export async function invalidateHandleCache(handle: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.del(getHandleCacheKey(handle));
  } catch (error) {
    captureWarning('[handle-availability] Redis invalidation failed', error);
  }
}
