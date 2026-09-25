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
 * Failures degrade open: a Redis outage must not block sign-in. The counter
 * and its TTL are one Redis script. A separate INCR then EXPIRE can leave a
 * key with no TTL, and later counts never reset.
 */

const OP_TIMEOUT_MS = 500;
const KEY_PREFIX = 'ba:rl:';

/**
 * Returns the window count, or -1 when the key could not be given a TTL.
 * -1 deletes the key before returning so a failed EXPIRE cannot lock the
 * caller out for the life of the Redis database.
 */
export const AUTH_RATE_LIMIT_CONSUME_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  local ok = redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
  if ok ~= 1 then
    redis.call('DEL', KEYS[1])
    return -1
  end
end
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then
  redis.call('DEL', KEYS[1])
  return -1
end
return count
`;

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
      const raw = await withTimeout(
        redis.eval<string[], number>(
          AUTH_RATE_LIMIT_CONSUME_SCRIPT,
          [redisKey],
          [String(rule.window)]
        ),
        {
          timeoutMs: OP_TIMEOUT_MS,
          context: 'auth-rate-limit-consume',
        }
      );
      const count = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(count) || count < 0) {
        return { allowed: true, retryAfter: null };
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
