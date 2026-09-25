import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getRedis: vi.fn(),
  logger: { warn: vi.fn() },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/redis', () => ({ getRedis: mocks.getRedis }));
vi.mock('@/lib/utils/logger', () => ({
  logger: mocks.logger,
}));

import {
  AUTH_RATE_LIMIT_CONSUME_SCRIPT,
  authRateLimitStorage,
} from '@/lib/auth/rate-limit-storage';

const rule = { window: 60, max: 2 };

type Counter = { count: number; ttl: number | null };

/**
 * Runs the consume script against an in-memory key. EXPIRE can be forced to
 * fail so a successful INCR cannot leave a key with no TTL.
 */
function createScriptRedis(expireOk = true) {
  const keys = new Map<string, Counter>();
  const redis = {
    eval: vi.fn(async (script: string, keyList: string[], args: string[]) => {
      expect(script).toBe(AUTH_RATE_LIMIT_CONSUME_SCRIPT);
      const key = keyList[0]!;
      const windowSeconds = Number(args[0]);
      const current = keys.get(key);
      const count = (current?.count ?? 0) + 1;
      keys.set(key, { count, ttl: current?.ttl ?? null });
      if (count === 1) {
        if (!expireOk) {
          keys.delete(key);
          return -1;
        }
        keys.set(key, { count, ttl: windowSeconds });
      }
      const stored = keys.get(key);
      const ttl = stored ? (stored.ttl ?? -1) : -2;
      if (ttl < 0) {
        keys.delete(key);
        return -1;
      }
      return count;
    }),
  };
  return { redis, keys };
}

describe('Better Auth Redis rate-limit storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('increments a prefixed counter and sets TTL only when the key is created', async () => {
    const { redis, keys } = createScriptRedis();
    mocks.getRedis.mockReturnValue(redis);

    await expect(
      authRateLimitStorage.consume('1.2.3.4|/sign-in/email', rule)
    ).resolves.toEqual({ allowed: true, retryAfter: null });
    await expect(
      authRateLimitStorage.consume('1.2.3.4|/sign-in/email', rule)
    ).resolves.toEqual({ allowed: true, retryAfter: null });

    expect(redis.eval).toHaveBeenCalledWith(
      AUTH_RATE_LIMIT_CONSUME_SCRIPT,
      ['ba:rl:1.2.3.4|/sign-in/email'],
      ['60']
    );
    expect(keys.get('ba:rl:1.2.3.4|/sign-in/email')).toEqual({
      count: 2,
      ttl: 60,
    });
  });

  it('denies once the window count passes the rule max', async () => {
    const { redis, keys } = createScriptRedis();
    keys.set('ba:rl:10.0.0.1|/sign-up/email', { count: 2, ttl: 40 });
    mocks.getRedis.mockReturnValue(redis);

    await expect(
      authRateLimitStorage.consume('10.0.0.1|/sign-up/email', rule)
    ).resolves.toEqual({ allowed: false, retryAfter: 60 });
    expect(keys.get('ba:rl:10.0.0.1|/sign-up/email')?.count).toBe(3);
  });

  it('deletes the key and allows the request when expiry fails', async () => {
    const { redis, keys } = createScriptRedis(false);
    mocks.getRedis.mockReturnValue(redis);

    await expect(
      authRateLimitStorage.consume('9.9.9.9|/sign-in/email', rule)
    ).resolves.toEqual({ allowed: true, retryAfter: null });
    expect(keys.size).toBe(0);

    keys.set('ba:rl:9.9.9.9|/sign-in/email', { count: 9, ttl: null });
    await expect(
      authRateLimitStorage.consume('9.9.9.9|/sign-in/email', rule)
    ).resolves.toEqual({ allowed: true, retryAfter: null });
    expect(keys.has('ba:rl:9.9.9.9|/sign-in/email')).toBe(false);
  });

  it('degrades open when Redis is missing or the counter command fails', async () => {
    mocks.getRedis.mockReturnValue(null);
    await expect(
      authRateLimitStorage.consume('ip|/email-otp/send-verification-otp', rule)
    ).resolves.toEqual({ allowed: true, retryAfter: null });

    mocks.getRedis.mockReturnValue({
      eval: vi.fn().mockRejectedValue(new Error('quota')),
    });
    await expect(
      authRateLimitStorage.consume('ip|/email-otp/send-verification-otp', rule)
    ).resolves.toEqual({ allowed: true, retryAfter: null });
  });
});
