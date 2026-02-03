import { describe, expect, it, vi } from 'vitest';
import type { DbType } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { applyProfileEnrichment } from '@/lib/ingestion/profile';

describe('applyProfileEnrichment', () => {
  it('sets avatarUrl when unlocked and current avatar is empty', async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn((payload: Record<string, unknown>) => {
      void payload;
      return { where };
    });
    const update = vi.fn(() => ({ set }));

    const tx = { update } as unknown as DbType;

    await applyProfileEnrichment(tx, {
      profileId: 'profile_1',
      avatarLockedByUser: false,
      currentAvatarUrl: null,
      extractedAvatarUrl: ' https://example.com/avatar.png ',
    });

    expect(update).toHaveBeenCalledWith(creatorProfiles);
    expect(set).toHaveBeenCalledTimes(1);

    const payload = set.mock.calls[0]?.[0];
    expect(payload).toMatchObject({
      avatarUrl: 'https://example.com/avatar.png',
      updatedAt: expect.any(Date),
    });

    expect(where).toHaveBeenCalledTimes(1);
  });

  it('does not set avatarUrl when avatar is locked', async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn((payload: Record<string, unknown>) => {
      void payload;
      return { where };
    });
    const update = vi.fn(() => ({ set }));

    const tx = { update } as unknown as DbType;

    await applyProfileEnrichment(tx, {
      profileId: 'profile_1',
      avatarLockedByUser: true,
      currentAvatarUrl: null,
      extractedAvatarUrl: 'https://example.com/avatar.png',
    });

    expect(update).not.toHaveBeenCalled();
  });

  it('does not set avatarUrl when current avatar already exists', async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn((payload: Record<string, unknown>) => {
      void payload;
      return { where };
    });
    const update = vi.fn(() => ({ set }));

    const tx = { update } as unknown as DbType;

    await applyProfileEnrichment(tx, {
      profileId: 'profile_1',
      avatarLockedByUser: false,
      currentAvatarUrl: 'https://example.com/existing.png',
      extractedAvatarUrl: 'https://example.com/avatar.png',
    });

    expect(update).not.toHaveBeenCalled();
  });
});
