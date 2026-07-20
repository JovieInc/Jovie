import 'server-only';

import { env } from '@/lib/env-server';
import { getRedis } from '@/lib/redis';

const DAILY_ATTEMPT_LIMIT = 200;
const DAILY_RETRY_LIMIT = 4;
const RESERVE_ATTEMPT_LUA = `
if redis.call('EXISTS', KEYS[3]) == 1 then
  return 1
end
local attempts = tonumber(redis.call('GET', KEYS[1]) or '0')
if attempts >= tonumber(ARGV[1]) then
  return 0
end
if ARGV[3] == 'retry' then
  local retries = tonumber(redis.call('GET', KEYS[2]) or '0')
  if retries >= tonumber(ARGV[2]) then
    return 0
  end
  local retryNext = redis.call('INCR', KEYS[2])
  if retryNext == 1 then redis.call('EXPIRE', KEYS[2], tonumber(ARGV[4])) end
end
local attemptNext = redis.call('INCR', KEYS[1])
if attemptNext == 1 then redis.call('EXPIRE', KEYS[1], tonumber(ARGV[4])) end
redis.call('SET', KEYS[3], '1', 'EX', tonumber(ARGV[4]))
return 1
`;

function isProductionRuntime() {
  return env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production';
}

function dayKey(now: Date) {
  return now.toISOString().slice(0, 10);
}

function secondsUntilNextUtcDay(now: Date) {
  const nextDay = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1
  );
  return Math.max(1, Math.ceil((nextDay - now.getTime()) / 1000));
}

export async function reserveProfileSearchAttempt(
  attemptId: string,
  kind: 'scheduled' | 'retry',
  now = new Date()
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return !isProductionRuntime();

  const day = dayKey(now);
  const ttl = secondsUntilNextUtcDay(now);
  const result = await redis.eval<[number, number, string, number], number>(
    RESERVE_ATTEMPT_LUA,
    [
      `profile-search:budget:day:${day}`,
      `profile-search:retry-budget:day:${day}`,
      `profile-search:attempt:${attemptId}`,
    ],
    [DAILY_ATTEMPT_LIMIT, DAILY_RETRY_LIMIT, kind, ttl]
  );
  return result === 1;
}
