import 'server-only';

import { getRedis } from '@/lib/redis';

const KEY = 'offer:hash:seen';

/** Records the served offer hash; true when it differs from the previous one. */
export async function noteOfferHash(hash: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  const prev = await redis.get(KEY);
  if (prev === hash) return false;
  await redis.set(KEY, hash);
  return prev !== null && prev !== undefined;
}
