import { describe, expect, it, vi } from 'vitest';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { applyProfileEnrichment } from '@/lib/ingestion/profile';

function createTxMock() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));

  return {
    tx: { update },
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

  it('does not overwrite existing fields', async () => {
    const { tx, update } = createTxMock();

    await applyProfileEnrichment(tx as never, {
      profileId: 'profile-1',
      currentDisplayName: 'Existing Name',
      currentAvatarUrl: 'https://existing.example/avatar.jpg',
      extractedDisplayName: 'New Artist Name',
      extractedAvatarUrl: 'https://cdn.example.com/avatar.jpg',
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
