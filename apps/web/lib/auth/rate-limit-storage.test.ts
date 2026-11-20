import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getRedis: vi.fn(),
  selectRedisStore: vi.fn(),
  warnRedisStoreDecision: vi.fn(),
  logger: { warn: vi.fn() },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/redis', () => ({ getRedis: mocks.getRedis }));
vi.mock('@/lib/redis-store', () => ({
  selectRedisStore: mocks.selectRedisStore,
  redisStoreEnvFrom: (env: unknown) => env,
  warnRedisStoreDecision: mocks.warnRedisStoreDecision,
}));
vi.mock('@/lib/env-server', () => ({ env: {} }));
vi.mock('@/lib/utils/logger', () => ({
  logger: mocks.logger,
}));

import {
  AUTH_RATE_LIMIT_CONSUME_SCRIPT,
  authRateLimitStorage,
  pathFromAuthRateLimitKey,
  resetAuthRateLimitMemoryForTests,
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

describe('pathFromAuthRateLimitKey', () => {
  it('reads the pathname after the Better Auth ip|path separator', () => {
    expect(pathFromAuthRateLimitKey('1.2.3.4|/sign-in/email-otp')).toBe(
      '/sign-in/email-otp'
    );
    expect(
      pathFromAuthRateLimitKey('no-trusted-ip|/email-otp/send-verification-otp')
    ).toBe('/email-otp/send-verification-otp');
  });
});

describe('Better Auth Redis rate-limit storage (Upstash selected)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAuthRateLimitMemoryForTests();
    mocks.selectRedisStore.mockReturnValue({
      kind: 'upstash',
      blockProductionUpstash: false,
    });
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

  it('denies sensitive paths when expiry fails so an untrusted counter cannot pass', async () => {
    const { redis, keys } = createScriptRedis(false);
    mocks.getRedis.mockReturnValue(redis);

    await expect(
      authRateLimitStorage.consume(
        '9.9.9.9|/email-otp/send-verification-otp',
        rule
      )
    ).resolves.toEqual({ allowed: false, retryAfter: 60 });
    expect(keys.size).toBe(0);

    keys.set('ba:rl:9.9.9.9|/sign-in/email-otp', { count: 9, ttl: null });
    await expect(
      authRateLimitStorage.consume('9.9.9.9|/sign-in/email-otp', rule)
    ).resolves.toEqual({ allowed: false, retryAfter: 60 });
    expect(keys.has('ba:rl:9.9.9.9|/sign-in/email-otp')).toBe(false);
  });

  it('denies sensitive OTP/passwordless paths when Redis is configured but unavailable', async () => {
    mocks.getRedis.mockReturnValue(null);
    await expect(
      authRateLimitStorage.consume('ip|/email-otp/send-verification-otp', rule)
    ).resolves.toEqual({ allowed: false, retryAfter: 60 });
    await expect(
      authRateLimitStorage.consume('ip|/sign-in/email-otp', rule)
    ).resolves.toEqual({ allowed: false, retryAfter: 60 });
    await expect(
      authRateLimitStorage.consume('ip|/phone-number/send-otp', rule)
    ).resolves.toEqual({ allowed: false, retryAfter: 60 });
    await expect(
      authRateLimitStorage.consume('ip|/one-time-token/verify', rule)
    ).resolves.toEqual({ allowed: false, retryAfter: 60 });

    mocks.getRedis.mockReturnValue({
      eval: vi.fn().mockRejectedValue(new Error('quota')),
    });
    await expect(
      authRateLimitStorage.consume('ip|/email-otp/send-verification-otp', rule)
    ).resolves.toEqual({ allowed: false, retryAfter: 60 });
  });

  it('still degrades open for non-sensitive auth paths when Redis is down', async () => {
    mocks.getRedis.mockReturnValue(null);
    await expect(authRateLimitStorage.consume('ip|/ok', rule)).resolves.toEqual(
      { allowed: true, retryAfter: null }
    );
    await expect(
      authRateLimitStorage.consume('ip|/list-accounts', rule)
    ).resolves.toEqual({ allowed: true, retryAfter: null });
  });
});

describe('Better Auth rate-limit storage (intentional memory store)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAuthRateLimitMemoryForTests();
    mocks.selectRedisStore.mockReturnValue({
      kind: 'memory',
      blockProductionUpstash: false,
    });
    mocks.getRedis.mockReturnValue(null);
  });

  it('does not treat intentional memory as a Redis outage for OTP/sign-in', async () => {
    await expect(
      authRateLimitStorage.consume('ip|/email-otp/send-verification-otp', rule)
    ).resolves.toEqual({ allowed: true, retryAfter: null });
    await expect(
      authRateLimitStorage.consume('ip|/sign-in/email-otp', rule)
    ).resolves.toEqual({ allowed: true, retryAfter: null });
    expect(mocks.getRedis).not.toHaveBeenCalled();
    expect(mocks.logger.warn).not.toHaveBeenCalled();
  });

  it('enforces the window with a process-local counter', async () => {
    const key = 'ip|/email-otp/send-verification-otp';
    await expect(authRateLimitStorage.consume(key, rule)).resolves.toEqual({
      allowed: true,
      retryAfter: null,
    });
    await expect(authRateLimitStorage.consume(key, rule)).resolves.toEqual({
      allowed: true,
      retryAfter: null,
    });
    await expect(authRateLimitStorage.consume(key, rule)).resolves.toEqual({
      allowed: false,
      retryAfter: expect.any(Number),
    });
  });
});
