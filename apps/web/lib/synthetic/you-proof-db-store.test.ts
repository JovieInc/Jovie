import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createYouProofDbStore,
  profileSetToUpdateData,
  type YouProofDb,
} from './you-proof-db-store';

vi.mock('@/lib/services/profile/mutations', () => ({
  updateProfileById: vi.fn(async () => ({ id: 'p-you' })),
}));

vi.mock('@/lib/services/social-links/mutations', () => ({
  createLink: vi.fn(async () => ({ id: 'link-1' })),
}));

vi.mock('@/lib/cache/profile', () => ({
  invalidateSocialLinksCache: vi.fn(async () => undefined),
  invalidateProfileCache: vi.fn(async () => undefined),
}));

import {
  invalidateProfileCache,
  invalidateSocialLinksCache,
} from '@/lib/cache/profile';
import { updateProfileById } from '@/lib/services/profile/mutations';
import { createLink } from '@/lib/services/social-links/mutations';

function createMockDb(rows: Array<Record<string, unknown>> = []): YouProofDb {
  const limit = vi.fn(async () => rows);
  const whereJoin = vi.fn(() => ({ limit }));
  const leftJoin = vi.fn(() => ({ where: whereJoin }));
  const whereDirect = vi.fn(async () => rows);
  const from = vi.fn(() => ({
    leftJoin,
    where: whereDirect,
  }));
  const select = vi.fn(() => ({ from }));
  return { select } as unknown as YouProofDb;
}

describe('you-proof db store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps profile seed values to ProfileUpdateData', () => {
    expect(
      profileSetToUpdateData({
        username: 'you',
        username_normalized: 'you',
        display_name: 'Your Name',
        bio: 'bio',
        is_public: true,
        is_claimed: true,
      })
    ).toEqual({
      username: 'you',
      usernameNormalized: 'you',
      displayName: 'Your Name',
      bio: 'bio',
      isPublic: true,
    });
  });

  it('loads a handle row through the join query', async () => {
    const database = createMockDb([
      {
        profileId: 'p-you',
        username: 'you',
        displayName: 'Your Name',
        bio: 'bio',
        isPublic: true,
        isClaimed: true,
        ownerEmail: 'tim@jov.ie',
      },
    ]);
    const store = createYouProofDbStore(database);
    await expect(store.loadHandleRow()).resolves.toMatchObject({
      profileId: 'p-you',
      ownerEmail: 'tim@jov.ie',
      username: 'you',
    });
    expect(database.select).toHaveBeenCalled();
  });

  it('returns null when the owner has no profile', async () => {
    const database = createMockDb([{ profileId: null, ownerEmail: 'a@b.c' }]);
    const store = createYouProofDbStore(database);
    await expect(store.loadOwnerProfile('a@b.c')).resolves.toBeNull();
  });

  it('writes through domain mutations and invalidates caches', async () => {
    const database = createMockDb([{ platform: 'instagram' }]);
    const store = createYouProofDbStore(database);
    await expect(store.loadSocialPlatforms('p-you')).resolves.toEqual(
      new Set(['instagram'])
    );
    await store.updateProfile('p-you', {
      display_name: 'Your Name',
      is_public: true,
    });
    await store.insertSocialLink({
      profileId: 'p-you',
      platform: 'youtube',
      platformType: 'social',
      url: 'https://www.youtube.com/',
      displayText: 'YouTube',
      sortOrder: 1,
    });
    expect(updateProfileById).toHaveBeenCalledWith(
      'p-you',
      expect.objectContaining({ displayName: 'Your Name', isPublic: true })
    );
    expect(createLink).toHaveBeenCalled();
    expect(invalidateSocialLinksCache).toHaveBeenCalledWith('p-you', 'you');
    expect(invalidateProfileCache).toHaveBeenCalledWith('you');
  });
});
