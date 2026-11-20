import 'server-only';

import type { BetterAuthOptions } from 'better-auth';
import { getRedis } from '@/lib/redis';
import { withTimeout } from '@/lib/resilience/primitives';
import { logger } from '@/lib/utils/logger';
import { isSensitiveAuthRateLimitPath } from './rate-limit-rules';

/**
 * Better Auth path rate limits only.
 *
 * Sessions and verification values stay in Postgres (`storeSessionInDatabase`
 * and `verification.storeInDatabase`). This storage is the Redis INCR/EXPIRE
 * counter Better Auth used to run through `secondaryStorage.increment`. It
 * does not get, set, or delete session records.
 *
 * Outage policy (SEC-02): sensitive auth paths (email OTP, passwordless,
 * phone OTP, credential mutation) fail closed when Redis is down or the
 * consume script cannot establish a TTL — deny with Retry-After = window.
 * Non-abuse paths still degrade open so unrelated Better Auth traffic is not
 * hard-blocked by a Redis outage. The counter and its TTL are one Redis
 * script; a separate INCR then EXPIRE can leave a key with no TTL, and later
 * counts never reset.
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

type AuthRateLimitRule = Parameters<AuthRateLimitStorage['consume']>[1];

type AuthRateLimitDecision = Awaited<
  ReturnType<AuthRateLimitStorage['consume']>
>;

/** Better Auth keys are `${ip}|${pathname}`. */
export function pathFromAuthRateLimitKey(key: string): string {
  const sep = key.indexOf('|');
  return sep === -1 ? key : key.slice(sep + 1);
}

function denyWithRetryAfter(rule: AuthRateLimitRule): AuthRateLimitDecision {
  return { allowed: false, retryAfter: rule.window };
}

function allowOpen(): AuthRateLimitDecision {
  return { allowed: true, retryAfter: null };
}

function decisionOnBackendFailure(
  key: string,
  rule: AuthRateLimitRule,
  reason: string
): AuthRateLimitDecision {
  const path = pathFromAuthRateLimitKey(key);
  if (isSensitiveAuthRateLimitPath(path)) {
    logger.warn(
      '[auth/rate-limit] Redis unavailable, denying sensitive auth request',
      { key, path, reason }
    );
    return denyWithRetryAfter(rule);
  }
  logger.warn(
    '[auth/rate-limit] Redis unavailable, allowing non-sensitive auth request',
    { key, path, reason }
  );
  return allowOpen();
}

export const authRateLimitStorage = {
  async consume(key, rule) {
    const redis = getRedis();
    if (!redis) {
      return decisionOnBackendFailure(key, rule, 'redis-missing');
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
        // Script returned -1 (TTL could not be set) or a non-numeric result.
        // Sensitive paths must not treat an untrustworthy counter as a pass.
        return decisionOnBackendFailure(key, rule, 'counter-untrusted');
      }
      if (count <= rule.max) {
        return { allowed: true, retryAfter: null };
      }
      return { allowed: false, retryAfter: rule.window };
    } catch (error) {
      return decisionOnBackendFailure(
        key,
        rule,
        error instanceof Error ? error.message : String(error)
      );
    }
  },
} satisfies AuthRateLimitStorage;
