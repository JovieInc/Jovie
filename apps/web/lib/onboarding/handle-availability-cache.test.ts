import { beforeEach, describe, expect, it, vi } from 'vitest';

const redis = vi.hoisted(() => ({
  del: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock('@/lib/redis', () => ({
  getRedis: () => redis,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureWarning: vi.fn(),
}));

import {
  cacheHandleAvailability,
  getCachedHandleAvailability,
  invalidateHandleCache,
} from './handle-availability-cache';

describe('handle availability Redis contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the canonical normalized key and five-minute available TTL', async () => {
    await cacheHandleAvailability(' @NewArtist ', true);

    expect(redis.set).toHaveBeenCalledExactlyOnceWith(
      'onboarding:handle-availability:newartist',
      '1',
      { ex: 300 }
    );
  });

  it('uses the canonical normalized key and a 10-minute unavailable TTL', async () => {
    await cacheHandleAvailability('@TakenArtist', false);

    expect(redis.set).toHaveBeenCalledExactlyOnceWith(
      'onboarding:handle-availability:takenartist',
      '0',
      { ex: 600 }
    );
  });

  it('deletes the same canonical key used by reads and writes', async () => {
    await invalidateHandleCache(' @OldArtist ');

    expect(redis.del).toHaveBeenCalledExactlyOnceWith(
      'onboarding:handle-availability:oldartist'
    );
  });

  it('reads Upstash-deserialized values: number 1 is available, 0 is taken', async () => {
    redis.get.mockResolvedValueOnce(1);
    await expect(getCachedHandleAvailability('newartist')).resolves.toBe(true);
    redis.get.mockResolvedValueOnce('1');
    await expect(getCachedHandleAvailability('newartist')).resolves.toBe(true);
    redis.get.mockResolvedValueOnce(0);
    await expect(getCachedHandleAvailability('newartist')).resolves.toBe(false);
    redis.get.mockResolvedValueOnce(null);
    await expect(getCachedHandleAvailability('newartist')).resolves.toBeNull();
    redis.get.mockResolvedValueOnce('garbage');
    await expect(getCachedHandleAvailability('newartist')).resolves.toBeNull();
  });
});
