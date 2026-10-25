import 'server-only';

import * as Sentry from '@sentry/nextjs';
import { getRedis } from '@/lib/redis';

const KEY = 'offer:truth:unavailable-strikes';
export const UNAVAILABLE_ALERT_AT = 3;

/**
 * Consecutive "check could not run" strikes. Releases are not blocked by an
 * outage of the check itself; the third strike in a row alerts and the
 * override is logged. Pass `null` to reset after any check that ran.
 */
export async function noteCheckUnavailable(
  reasons: readonly string[] | null
): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  if (reasons === null) {
    await redis.del(KEY);
    return 0;
  }
  const n = Number(await redis.incr(KEY));
  if (n >= UNAVAILABLE_ALERT_AT) {
    Sentry.captureMessage(
      'Offer truth check unavailable 3x: release override',
      {
        level: 'error',
        tags: { event: 'offer_truth_unavailable' },
        extra: { strikes: n, reasons: reasons.slice(0, 10) },
        fingerprint: ['offer_truth_unavailable'],
      }
    );
    console.warn(
      JSON.stringify({ event: 'offer_truth_override_logged', strikes: n })
    );
  }
  return n;
}
