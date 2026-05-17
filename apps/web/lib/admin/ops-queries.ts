import 'server-only';

import { CANARY_REDIS_KEY } from '@/app/api/cron/public-profile-canary/route';
import type { CanaryReport } from '@/lib/canaries/public-profile';
import { captureError } from '@/lib/error-tracking';
import { getRedis } from '@/lib/redis';
import { logger } from '@/lib/utils/logger';

/**
 * Fetch the latest public-profile canary run result from Redis.
 * Returns null if Redis is unavailable or the key has expired (> 26h since last run).
 */
export async function getPublicProfileCanaryStatus(): Promise<CanaryReport | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const raw = await redis.get<string>(CANARY_REDIS_KEY);
    if (!raw) return null;

    // redis.get may return the value already parsed if the Upstash client
    // detects JSON — handle both cases.
    if (typeof raw === 'object') {
      return raw as unknown as CanaryReport;
    }

    return JSON.parse(raw) as CanaryReport;
  } catch (err) {
    logger.warn('[admin/ops] Failed to load canary status from Redis', err);
    await captureError('Admin ops: canary status load failed', err, {
      context: 'ops-queries',
    });
    return null;
  }
}
