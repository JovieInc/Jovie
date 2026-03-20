import 'server-only';

import { env } from '@/lib/env-server';
import { getRedis } from '@/lib/redis';
import {
  MusicfetchBudgetExceededError,
  type MusicfetchBudgetScope,
} from './errors';

const DEFAULT_DAILY_HARD_LIMIT = 1500;
const DEFAULT_MONTHLY_HARD_LIMIT = 45_000;

const RESERVE_BUDGET_LUA = `
local dailyCurrent = tonumber(redis.call('GET', KEYS[1]) or '0')
if dailyCurrent >= tonumber(ARGV[1]) then
  return {0, 'daily'}
end

local monthlyCurrent = tonumber(redis.call('GET', KEYS[2]) or '0')
if monthlyCurrent >= tonumber(ARGV[2]) then
  return {0, 'monthly'}
end

local dailyNext = redis.call('INCR', KEYS[1])
if dailyNext == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
end

local monthlyNext = redis.call('INCR', KEYS[2])
if monthlyNext == 1 then
  redis.call('EXPIRE', KEYS[2], tonumber(ARGV[4]))
end

return {1, dailyNext, monthlyNext}
`;

function parseLimit(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isProductionRuntime(): boolean {
  return env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production';
}

function formatUtcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function formatUtcMonth(now: Date): string {
  return now.toISOString().slice(0, 7);
}

function secondsUntilNextUtcDay(now: Date): number {
  const nextDay = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1
  );
  return Math.max(1, Math.ceil((nextDay - now.getTime()) / 1000));
}

function secondsUntilNextUtcMonth(now: Date): number {
  const nextMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return Math.max(1, Math.ceil((nextMonth - now.getTime()) / 1000));
}

function buildBudgetError(
  scope: MusicfetchBudgetScope,
  now: Date
): MusicfetchBudgetExceededError {
  const retryAfterSeconds =
    scope === 'monthly'
      ? secondsUntilNextUtcMonth(now)
      : secondsUntilNextUtcDay(now);

  if (scope === 'backend_unavailable') {
    return new MusicfetchBudgetExceededError(
      'MusicFetch budget backend unavailable in production',
      scope,
      retryAfterSeconds
    );
  }

  return new MusicfetchBudgetExceededError(
    `MusicFetch ${scope} hard budget exhausted`,
    scope,
    retryAfterSeconds
  );
}

export async function reserveMusicfetchBudget(now = new Date()): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    if (isProductionRuntime()) {
      throw buildBudgetError('backend_unavailable', now);
    }
    return;
  }

  const dailyLimit = parseLimit(
    env.MUSICFETCH_DAILY_HARD_LIMIT,
    DEFAULT_DAILY_HARD_LIMIT
  );
  const monthlyLimit = parseLimit(
    env.MUSICFETCH_MONTHLY_HARD_LIMIT,
    DEFAULT_MONTHLY_HARD_LIMIT
  );

  const dailyKey = `musicfetch:budget:day:${formatUtcDay(now)}`;
  const monthlyKey = `musicfetch:budget:month:${formatUtcMonth(now)}`;
  const dailyTtlSeconds = secondsUntilNextUtcDay(now);
  const monthlyTtlSeconds = secondsUntilNextUtcMonth(now);

  const result = await redis.eval<
    [number, number, number, number],
    [number, string?]
  >(
    RESERVE_BUDGET_LUA,
    [dailyKey, monthlyKey],
    [dailyLimit, monthlyLimit, dailyTtlSeconds, monthlyTtlSeconds]
  );

  const [success, blockedScope] = result;
  if (success === 1) return;

  const scope =
    blockedScope === 'monthly'
      ? 'monthly'
      : blockedScope === 'daily'
        ? 'daily'
        : 'backend_unavailable';

  throw buildBudgetError(scope, now);
}
