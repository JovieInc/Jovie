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

  it('uses the canonical normalized key and 30-day unavailable TTL', async () => {
    await cacheHandleAvailability('@TakenArtist', false);

    expect(redis.set).toHaveBeenCalledExactlyOnceWith(
      'onboarding:handle-availability:takenartist',
      '0',
      { ex: 2_592_000 }
    );
  });

  it('deletes the same canonical key used by reads and writes', async () => {
    await invalidateHandleCache(' @OldArtist ');

    expect(redis.del).toHaveBeenCalledExactlyOnceWith(
      'onboarding:handle-availability:oldartist'
    );
  });
});
