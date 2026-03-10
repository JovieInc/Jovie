import 'server-only';

import { getRedis } from '@/lib/redis';

const DISPATCH_PREFIX = 'webhook-dispatch';

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
