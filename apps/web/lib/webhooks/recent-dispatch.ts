import 'server-only';

import { getRedis } from '@/lib/redis';

const DISPATCH_PREFIX = 'webhook-dispatch';

export interface RecentDispatchAcquireResult {
  acquired: boolean;
  reason: 'acquired' | 'duplicate' | 'backend_unavailable';
}

function buildDispatchKey(scope: string, key: string): string {
  return `${DISPATCH_PREFIX}:${scope}:${key}`;
}

export async function hasRecentDispatch(
  scope: string,
  key: string
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) {
    return false;
  }

  const exists = await redis.exists(buildDispatchKey(scope, key));
  return exists === 1;
}

export async function acquireRecentDispatch(
  scope: string,
  key: string,
  ttlSeconds: number
): Promise<RecentDispatchAcquireResult> {
  const redis = getRedis();
  if (!redis) {
    if (process.env.NODE_ENV === 'production') {
      return {
        acquired: false,
        reason: 'backend_unavailable',
      };
    }

    return {
      acquired: true,
      reason: 'acquired',
    };
  }

  try {
    const result = await redis.set(
      buildDispatchKey(scope, key),
      Date.now().toString(),
      {
        nx: true,
        ex: ttlSeconds,
      }
    );

    return result === 'OK'
      ? { acquired: true, reason: 'acquired' }
      : { acquired: false, reason: 'duplicate' };
  } catch {
    return process.env.NODE_ENV === 'production'
      ? { acquired: false, reason: 'backend_unavailable' }
      : { acquired: true, reason: 'acquired' };
  }
}

export async function markRecentDispatch(
  scope: string,
  key: string,
  ttlSeconds: number
): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    return;
  }

  await redis.set(buildDispatchKey(scope, key), Date.now().toString(), {
    ex: ttlSeconds,
  });
}

export async function clearRecentDispatch(
  scope: string,
  key: string
): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    return;
  }

  await redis.del(buildDispatchKey(scope, key));
}
