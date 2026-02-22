import 'server-only';

import { captureWarning } from '@/lib/error-tracking';
import { getRedis } from '@/lib/redis';

const HANDLE_CACHE_KEY_PREFIX = 'onboarding:handle-availability:';
const HANDLE_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;

function getHandleCacheKey(handle: string): string {
  return `${HANDLE_CACHE_KEY_PREFIX}${handle.toLowerCase()}`;
}

export async function getCachedHandleAvailability(
  handle: string
): Promise<boolean | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const value = await redis.get<string>(getHandleCacheKey(handle));
    if (value === null) return null;
    return value === '1';
  } catch (error) {
    captureWarning('[handle-availability] Redis read failed', { error });
    return null;
  }
}

export async function cacheHandleAvailability(
  handle: string,
  available: boolean
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.set(getHandleCacheKey(handle), available ? '1' : '0', {
      ex: HANDLE_CACHE_TTL_SECONDS,
    });
  } catch (error) {
    captureWarning('[handle-availability] Redis write failed', { error });
  }
}
