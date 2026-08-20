import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRequest } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
}));

vi.mock('@upstash/redis', () => ({
  Redis: class MockRedis {
    request = mockRequest;
  },
}));

vi.mock('@/lib/env-server', () => ({
  env: {
    NODE_ENV: 'test',
    UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'token',
  },
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

function redisCommandClient(options?: { bypassQuotaCircuit?: boolean }): {
  request: () => Promise<unknown>;
} {
  const redis = getRedis(options);
  expect(redis).not.toBeNull();
  return redis as unknown as { request: () => Promise<unknown> };
}

describe('Redis quota circuit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRedisStateForTests();
    mockRequest.mockResolvedValue('OK');
  });

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
