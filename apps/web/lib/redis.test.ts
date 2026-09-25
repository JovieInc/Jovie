import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRequest, mockConstructor, mockEnv } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockConstructor: vi.fn(),
  mockEnv: {
    NODE_ENV: 'production' as string,
    VERCEL_ENV: 'production' as string | undefined,
    CI: undefined as string | undefined,
    E2E_TEST_MODE: undefined as string | undefined,
    VITEST: undefined as string | undefined,
    UPSTASH_REDIS_REST_URL: 'https://example.upstash.io' as string | undefined,
    UPSTASH_REDIS_REST_TOKEN: 'token' as string | undefined,
    REDIS_URL: undefined as string | undefined,
    JOVIE_ALLOW_PRODUCTION_UPSTASH: undefined as string | undefined,
  },
}));

vi.mock('@upstash/redis', () => ({
  Redis: class MockRedis {
    request = mockRequest;
    constructor(...args: unknown[]) {
      mockConstructor(...args);
    }
  },
}));

vi.mock('@/lib/env-server', () => ({
  env: mockEnv,
}));

vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

import {
  closeRedisQuotaCircuit,
  getRedis,
  isRedisQuotaCircuitOpen,
  resetRedisStateForTests,
} from './redis';

function resetEnv(): void {
  mockEnv.NODE_ENV = 'production';
  mockEnv.VERCEL_ENV = 'production';
  mockEnv.CI = undefined;
  mockEnv.E2E_TEST_MODE = undefined;
  mockEnv.VITEST = undefined;
  mockEnv.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
  mockEnv.UPSTASH_REDIS_REST_TOKEN = 'token';
  mockEnv.REDIS_URL = undefined;
  mockEnv.JOVIE_ALLOW_PRODUCTION_UPSTASH = undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRedisStateForTests();
  resetEnv();
  mockRequest.mockResolvedValue('OK');
});

describe('Upstash URL validation', () => {
  const invalidUrls = [
    undefined,
    '',
    '   ',
    'not-a-url',
    'http://example.upstash.io',
    'rediss://default:pass@example.upstash.io:6379',
    'redis://localhost:6379',
    'https://',
    'https:// bad host',
  ];

  it.each(invalidUrls)(
    'returns null without constructing a client for %j',
    url => {
      mockEnv.UPSTASH_REDIS_REST_URL = url;
      expect(getRedis()).toBeNull();
      expect(mockConstructor).not.toHaveBeenCalled();
    }
  );

  it('returns null when the token is missing or blank', () => {
    mockEnv.UPSTASH_REDIS_REST_TOKEN = '   ';
    expect(getRedis()).toBeNull();
    expect(mockConstructor).not.toHaveBeenCalled();
  });

  it('accepts a whitespace-padded absolute https URL', () => {
    mockEnv.UPSTASH_REDIS_REST_URL = '  https://example.upstash.io  ';
    expect(getRedis()).not.toBeNull();
    expect(mockConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.upstash.io' })
    );
  });

  it('returns null instead of throwing when the constructor throws', () => {
    mockConstructor.mockImplementationOnce(() => {
      throw new Error(
        'UrlError: Upstash Redis client was passed an invalid URL'
      );
    });
    expect(getRedis()).toBeNull();
  });

  it('retries after the cooldown once config becomes valid', () => {
    vi.useFakeTimers();
    try {
      mockEnv.UPSTASH_REDIS_REST_URL = 'not-a-url';
      expect(getRedis()).toBeNull();

      mockEnv.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
      // Cooldown suppresses immediate retries
      expect(getRedis()).toBeNull();
      vi.advanceTimersByTime(31_000);
      expect(getRedis()).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('non-production store selection', () => {
  it('refuses the production Upstash host and does not construct a client', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockEnv.NODE_ENV = 'development';
    mockEnv.VERCEL_ENV = undefined;
    mockEnv.UPSTASH_REDIS_REST_URL = 'https://real-kiwi-157253.upstash.io';

    expect(getRedis()).toBeNull();
    expect(mockConstructor).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('real-kiwi-157253.upstash.io')
    );
    expect(warn.mock.calls[0]?.[0]).not.toContain('token');
  });

  it('uses loopback Redis instead of Upstash when REDIS_URL is local', () => {
    mockEnv.NODE_ENV = 'test';
    mockEnv.VERCEL_ENV = 'preview';
    mockEnv.CI = 'true';
    mockEnv.REDIS_URL = 'redis://127.0.0.1:6379';
    mockEnv.UPSTASH_REDIS_REST_URL = 'https://real-kiwi-157253.upstash.io';

    expect(getRedis()).not.toBeNull();
    expect(mockConstructor).not.toHaveBeenCalled();
  });

  it('allows the production host only when the debug override is set', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockEnv.NODE_ENV = 'development';
    mockEnv.VERCEL_ENV = undefined;
    mockEnv.JOVIE_ALLOW_PRODUCTION_UPSTASH = '1';
    mockEnv.UPSTASH_REDIS_REST_URL = 'https://real-kiwi-157253.upstash.io';

    expect(getRedis()).not.toBeNull();
    expect(mockConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://real-kiwi-157253.upstash.io',
      })
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('JOVIE_ALLOW_PRODUCTION_UPSTASH')
    );
  });
});

describe('module evaluation', () => {
  it('never throws at import time when the URL is invalid', async () => {
    mockEnv.UPSTASH_REDIS_REST_URL = 'not-a-url';
    vi.resetModules();
    const mod = await import('./redis');
    expect(mod.redis).toBeNull();
    expect(mod.getRedis()).toBeNull();
  });
});

function redisCommandClient(options?: { bypassQuotaCircuit?: boolean }): {
  request: () => Promise<unknown>;
} {
  const redis = getRedis(options);
  expect(redis).not.toBeNull();
  return redis as unknown as { request: () => Promise<unknown> };
}

describe('Redis quota circuit', () => {
  it('returns a client while the quota circuit is closed', () => {
    expect(getRedis()).not.toBeNull();
    expect(isRedisQuotaCircuitOpen()).toBe(false);
  });

  it('opens the circuit after a quota error and skips later callers', async () => {
    mockRequest.mockRejectedValueOnce(
      new Error('ERR max requests limit exceeded. Limit: 500000')
    );
    const redis = redisCommandClient();

    await expect(redis.request()).rejects.toThrow(/max requests limit/i);
    expect(isRedisQuotaCircuitOpen()).toBe(true);
    expect(getRedis()).toBeNull();
  });

  it('lets the operability canary bypass the open circuit', async () => {
    mockRequest.mockRejectedValueOnce(
      new Error('ERR max requests limit exceeded. Limit: 500000')
    );
    const redis = redisCommandClient();
    await redis.request().catch(() => undefined);

    mockRequest.mockResolvedValueOnce('OK');
    const probe = redisCommandClient({ bypassQuotaCircuit: true });

    await expect(probe.request()).resolves.toBe('OK');
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  it('resumes normal callers after the circuit is closed', async () => {
    mockRequest.mockRejectedValueOnce(
      new Error('ERR max requests limit exceeded. Limit: 500000')
    );
    const redis = redisCommandClient();
    await redis.request().catch(() => undefined);
    expect(getRedis()).toBeNull();

    closeRedisQuotaCircuit();
    expect(getRedis()).not.toBeNull();
  });
});
