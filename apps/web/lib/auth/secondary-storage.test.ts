import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  captureError: vi.fn(),
  env: { VERCEL_ENV: 'preview' as string | undefined },
  getRedis: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/env', () => ({ env: mocks.env }));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.captureError }));
vi.mock('@/lib/redis', () => ({ getRedis: mocks.getRedis }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn() },
}));

import {
  resetSecondaryStorageMemoryForTests,
  secondaryStorage,
} from '@/lib/auth/secondary-storage';

describe('Better Auth database-authoritative verification storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.VERCEL_ENV = 'production';
    resetSecondaryStorageMemoryForTests();
  });

  it('keeps verification values entirely off Redis', async () => {
    const redis = {
      get: vi.fn().mockResolvedValue('stale-verification'),
      set: vi.fn().mockResolvedValue('OK'),
      getdel: vi.fn().mockResolvedValue('stale-verification'),
      del: vi.fn().mockResolvedValue(1),
    };
    mocks.getRedis.mockReturnValue(redis);
    const key = 'verification:sign-in-otp-creator-ready@jovie.test';

    await expect(secondaryStorage.get(key)).resolves.toBeNull();
    await expect(secondaryStorage.set(key, 'value', 600)).resolves.toBe(
      undefined
    );
    await expect(secondaryStorage.getAndDelete(key)).resolves.toBeNull();
    await expect(secondaryStorage.delete(key)).resolves.toBeUndefined();

    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
    expect(redis.getdel).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('keeps non-verification deletion fail-closed', async () => {
    const failure = new Error('redis quota exhausted');
    const del = vi.fn().mockRejectedValue(failure);
    mocks.getRedis.mockReturnValue({ del });

    await expect(secondaryStorage.delete('session-token')).rejects.toThrow(
      'Secondary storage delete failed closed after retry'
    );
    expect(del).toHaveBeenCalledTimes(2);
    expect(mocks.captureError).toHaveBeenCalledWith(
      'Better Auth secondary storage delete failed after retry',
      failure,
      { operation: 'secondary-storage.delete' }
    );
  });
});

describe('Better Auth secondary storage getAndDelete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.VERCEL_ENV = 'preview';
    mocks.getRedis.mockReturnValue(null);
    resetSecondaryStorageMemoryForTests();
  });

  it('returns and removes a value atomically in the non-production fallback', async () => {
    await secondaryStorage.set('one-time', 'value', 60);

    await expect(secondaryStorage.getAndDelete('one-time')).resolves.toBe(
      'value'
    );
    await expect(secondaryStorage.get('one-time')).resolves.toBeNull();
  });

  it('uses Redis GETDEL and preserves the string contract', async () => {
    const getdel = vi.fn().mockResolvedValue({ token: 'value' });
    mocks.getRedis.mockReturnValue({ getdel });

    await expect(secondaryStorage.getAndDelete('one-time')).resolves.toBe(
      '{"token":"value"}'
    );
    expect(getdel).toHaveBeenCalledWith('one-time');
  });

  it('fails closed when Redis GETDEL fails', async () => {
    const failure = new Error('redis unavailable');
    mocks.getRedis.mockReturnValue({
      getdel: vi.fn().mockRejectedValue(failure),
    });

    await expect(secondaryStorage.getAndDelete('one-time')).rejects.toThrow(
      'Secondary storage getAndDelete failed closed'
    );
    expect(mocks.captureError).toHaveBeenCalledWith(
      'Better Auth secondary storage getAndDelete failed',
      failure,
      { operation: 'secondary-storage.getAndDelete' }
    );
  });

  it('fails closed when Redis is unavailable in production', async () => {
    mocks.env.VERCEL_ENV = 'production';

    await expect(secondaryStorage.getAndDelete('one-time')).rejects.toThrow(
      'Redis unavailable in production'
    );
    expect(mocks.captureError).toHaveBeenCalledTimes(1);
  });
});
