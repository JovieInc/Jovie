import 'server-only';

import type { BetterAuthOptions } from 'better-auth';
import { getRedis } from '@/lib/redis';
import { withTimeout } from '@/lib/resilience/primitives';
import { logger } from '@/lib/utils/logger';

/**
 * Better Auth path rate limits only.
 *
 * Sessions and verification values stay in Postgres (`storeSessionInDatabase`
 * and `verification.storeInDatabase`). This storage is the Redis INCR/EXPIRE
 * counter Better Auth used to run through `secondaryStorage.increment`. It
 * does not get, set, or delete session records.
 *
 * Failures degrade open: a Redis outage must not block sign-in. The window
 * matches the previous secondary-storage increment (500ms timeout, EXPIRE
 * only when the counter is created).
 */

const OP_TIMEOUT_MS = 500;
const KEY_PREFIX = 'ba:rl:';

type AuthRateLimitStorage = NonNullable<
  NonNullable<BetterAuthOptions['rateLimit']>['customStorage']
>;

export const authRateLimitStorage = {
  async consume(key, rule) {
    const redis = getRedis();
    if (!redis) {
      logger.warn(
        '[auth/rate-limit] Redis unavailable, allowing auth request',
        { key }
      );
      return { allowed: true, retryAfter: null };
    }

    try {
      const redisKey = `${KEY_PREFIX}${key}`;
      const count = await withTimeout(redis.incr(redisKey), {
        timeoutMs: OP_TIMEOUT_MS,
        context: 'auth-rate-limit-incr',
      });
      if (count === 1 && rule.window > 0) {
        await withTimeout(redis.expire(redisKey, rule.window), {
          timeoutMs: OP_TIMEOUT_MS,
          context: 'auth-rate-limit-expire',
        });
      }
      if (count <= rule.max) {
        return { allowed: true, retryAfter: null };
      }
      return { allowed: false, retryAfter: rule.window };
    } catch (error) {
      logger.warn('[auth/rate-limit] increment failed, allowing auth request', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { allowed: true, retryAfter: null };
    }
  },
} satisfies AuthRateLimitStorage;
