import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGet, mockGetRedis, mockSet } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockGetRedis: vi.fn(),
  mockSet: vi.fn(),
}));

vi.mock('@/lib/redis', () => ({
  getRedis: mockGetRedis,
}));

import {
  classifyRedisFailure,
  probeRedisOperability,
  RedisOperabilityError,
} from './redis-operability';

describe('Redis operability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRedis.mockReturnValue({ set: mockSet, get: mockGet });
  });

  it('requires a successful write followed by an exact read', async () => {
    const signal = new AbortController().signal;
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(signal);
    mockSet.mockResolvedValue('OK');
    mockGet.mockImplementation(async (key: string) => key.split(':').at(-1));

    await expect(probeRedisOperability()).resolves.toEqual({
      status: 'healthy',
      latencyMs: expect.any(Number),
    });
    expect(mockSet).toHaveBeenCalledWith(
      expect.stringMatching(/^health:operability:/),
      expect.any(String),
      { ex: 60 }
    );
    expect(timeoutSpy).toHaveBeenCalledWith(2_000);
    expect(mockGetRedis).toHaveBeenCalledWith({ signal });
    timeoutSpy.mockRestore();
  });

  it('classifies the production hard-limit response as quota exhaustion', async () => {
    mockSet.mockRejectedValue(
      new Error('ERR max requests limit exceeded. Limit: 500000')
    );

    await expect(probeRedisOperability()).rejects.toMatchObject({
      name: 'RedisOperabilityError',
      kind: 'quota_exceeded',
    });
    expect(
      classifyRedisFailure(new Error('ERR max requests limit exceeded'))
    ).toBe('quota_exceeded');
  });

  it('classifies other provider failures as unavailable', async () => {
    mockSet.mockRejectedValue(new Error('connection reset'));

    await expect(probeRedisOperability()).rejects.toMatchObject({
      name: 'RedisOperabilityError',
      kind: 'unavailable',
    });
    expect(classifyRedisFailure({ code: 'ECONNRESET' })).toBe('unavailable');
  });

  it('fails when Redis is not configured', async () => {
    mockGetRedis.mockReturnValue(null);
    await expect(probeRedisOperability()).rejects.toEqual(
      expect.objectContaining<Partial<RedisOperabilityError>>({
        kind: 'not_configured',
      })
    );
  });

  it('fails when read-after-write does not return the canary value', async () => {
    mockSet.mockResolvedValue('OK');
    mockGet.mockResolvedValue(null);
    await expect(probeRedisOperability()).rejects.toMatchObject({
      kind: 'read_after_write_mismatch',
    });
  });
});
