import 'server-only';

import { getRedis } from '@/lib/redis';

/**
 * Offer-guard strict mode ("fixed templates"). A scheduled live check that
 * finds a real mismatch turns this on immediately, without waiting for a
 * deploy: every sentence a guarded model writes about money is replaced by
 * the registered template. A passing check turns it off. The flag expires on
 * its own so a stuck monitor cannot leave it on forever.
 */
const KEY = 'offer:guard:strict';
const TTL_SECONDS = 36 * 60 * 60;
const REFRESH_MS = 30_000;

let cached = { value: false, at: 0 };
let inflight: Promise<void> | null = null;

function refresh(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const redis = getRedis();
      const raw = redis ? await redis.get(KEY) : null;
      cached = { value: raw === '1' || raw === 1, at: Date.now() };
    } catch {
      // Keep the last known value; a Redis blip must not flip the guard off.
      cached = { ...cached, at: Date.now() };
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Sync read for the AI SDK chokepoint. Stale values refresh in the background. */
export function getOfferGuardStrict(): boolean {
  if (process.env.OFFER_GUARD_STRICT === 'true') return true;
  if (Date.now() - cached.at > REFRESH_MS) void refresh();
  return cached.value;
}

export async function setOfferGuardStrict(on: boolean): Promise<void> {
  const redis = getRedis();
  if (!redis)
    throw new Error('Redis is not configured; cannot persist offer guard mode');
  if (on) await redis.set(KEY, '1', { ex: TTL_SECONDS });
  else await redis.del(KEY);
  cached = { value: on, at: Date.now() };
}
