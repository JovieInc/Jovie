import { describe, expect, it, vi } from 'vitest';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { applyProfileEnrichment } from '@/lib/ingestion/profile';

vi.mock('@/lib/profile/profile-theme.server', () => ({
  buildThemeWithProfileAccent: vi.fn().mockResolvedValue({
    profileAccent: {
      version: 1,
      primaryHex: '#d3834e',
      sourceUrl: 'https://cdn.example.com/avatar.jpg',
    },
  }),
}));

function createTxMock() {
  const limit = vi.fn().mockResolvedValue([{ theme: null }]);
  const whereSelect = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where: whereSelect });
  const select = vi.fn().mockReturnValue({ from });
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));

  return {
    tx: { select, update },
    update,
    set,
    where,
  };
}

describe('applyProfileEnrichment', () => {
  it('updates display name and avatar when unlocked and empty', async () => {
    const { tx, update, set, where } = createTxMock();

    await applyProfileEnrichment(tx as never, {
      profileId: 'profile-1',
      currentDisplayName: null,
      currentAvatarUrl: null,
      extractedDisplayName: '  New Artist Name  ',
      extractedAvatarUrl: '  https://cdn.example.com/avatar.jpg  ',
    });

    expect(update).toHaveBeenCalledWith(creatorProfiles);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: 'New Artist Name',
        avatarUrl: 'https://cdn.example.com/avatar.jpg',
        updatedAt: expect.any(Date),
      })
    );
    expect(where).toHaveBeenCalledTimes(1);
  });

  it('does not overwrite existing display name', async () => {
    const { tx, update } = createTxMock();

    await applyProfileEnrichment(tx as never, {
      profileId: 'profile-1',
      currentDisplayName: 'Existing Name',
      currentAvatarUrl: null,
      extractedDisplayName: 'New Artist Name',
      extractedAvatarUrl: null,
    });

    expect(update).not.toHaveBeenCalled();
  });

  it('refreshes unlocked avatar even when one already exists', async () => {
    const { tx, update, set } = createTxMock();

    await applyProfileEnrichment(tx as never, {
      profileId: 'profile-1',
      currentDisplayName: 'Existing Name',
      currentAvatarUrl: 'https://existing.example/avatar.jpg',
      extractedDisplayName: 'New Artist Name',
      extractedAvatarUrl: 'https://cdn.example.com/better-avatar.jpg',
    });

    expect(update).toHaveBeenCalledWith(creatorProfiles);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        avatarUrl: 'https://cdn.example.com/better-avatar.jpg',
      })
    );
    const payload = set.mock.calls[0]?.[0];
    expect(payload).not.toHaveProperty('displayName');
  });

  it('does not overwrite blob-hosted avatar with external URL', async () => {
    const { tx, update } = createTxMock();

    await applyProfileEnrichment(tx as never, {
      profileId: 'profile-1',
      currentDisplayName: 'Existing Name',
      currentAvatarUrl:
        'https://abc.blob.vercel-storage.com/avatars/ingestion/handle/avatar.avif',
      extractedDisplayName: 'New Artist Name',
      extractedAvatarUrl: 'https://i.scdn.co/image/abc123',
    });

    expect(update).not.toHaveBeenCalled();
  });

  it('respects lock flags', async () => {
    const { tx, update } = createTxMock();

    await applyProfileEnrichment(tx as never, {
      profileId: 'profile-1',
      displayNameLocked: true,
      avatarLockedByUser: true,
      currentDisplayName: null,
      currentAvatarUrl: null,
      extractedDisplayName: 'Locked Name',
      extractedAvatarUrl: 'https://cdn.example.com/avatar.jpg',
    });

    expect(update).not.toHaveBeenCalled();
  });

  it('ignores whitespace-only extracted values', async () => {
    const { tx, update } = createTxMock();

    await applyProfileEnrichment(tx as never, {
      profileId: 'profile-1',
      currentDisplayName: null,
      currentAvatarUrl: null,
      extractedDisplayName: '   ',
      extractedAvatarUrl: '   ',
    });

    expect(update).not.toHaveBeenCalled();
  });
});
