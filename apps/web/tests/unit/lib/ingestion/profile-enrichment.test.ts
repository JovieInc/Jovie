import { describe, expect, it, vi } from 'vitest';
import type { DbType } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { applyProfileEnrichment } from '@/lib/ingestion/profile';

vi.mock('@/lib/profile/profile-theme.server', () => ({
  buildThemeWithProfileAccent: vi.fn().mockResolvedValue({
    profileAccent: {
      version: 1,
      primaryHex: '#d3834e',
      sourceUrl: 'https://example.com/avatar.png',
    },
  }),
}));

function createTxMock() {
  const limit = vi.fn().mockResolvedValue([{ theme: null }]);
  const whereSelect = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where: whereSelect });
  const select = vi.fn().mockReturnValue({ from });
  const whereUpdate = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn((payload: Record<string, unknown>) => {
    void payload;
    return { where: whereUpdate };
  });
  const update = vi.fn(() => ({ set }));

  return {
    tx: { select, update } as unknown as DbType,
    update,
    set,
    where: whereUpdate,
  };
}

describe('applyProfileEnrichment', () => {
  it('sets avatarUrl when unlocked and current avatar is empty', async () => {
    const { tx, update, set, where } = createTxMock();

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
    const { tx, update } = createTxMock();

    await applyProfileEnrichment(tx, {
      profileId: 'profile_1',
      avatarLockedByUser: true,
      currentAvatarUrl: null,
      extractedAvatarUrl: 'https://example.com/avatar.png',
    });

    expect(update).not.toHaveBeenCalled();
  });

  it('refreshes unlocked avatar when a new extracted URL is available', async () => {
    const { tx, update, set } = createTxMock();

    await applyProfileEnrichment(tx, {
      profileId: 'profile_1',
      avatarLockedByUser: false,
      currentAvatarUrl: 'https://example.com/existing.png',
      extractedAvatarUrl: 'https://example.com/better-avatar.png',
    });

    expect(update).toHaveBeenCalledWith(creatorProfiles);
    const payload = set.mock.calls[0]?.[0];
    expect(payload).toMatchObject({
      avatarUrl: 'https://example.com/better-avatar.png',
      updatedAt: expect.any(Date),
    });
  });
});
