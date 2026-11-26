import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isReservedPublicProfileIdentity } from '@/lib/profile/public-profile-identity-policy';
import { getPublicUrlPolicyEntry } from '@/lib/seo/public-url-policy';
import { isReservedUsername } from '@/lib/validation/username-core';
import {
  createYouProofDbStore,
  profileSetToUpdateData,
  type YouProofDb,
} from './you-proof-db-store';
import {
  planYouProofSeed,
  YOU_PROOF_FIXTURE,
  YOU_PROOF_HANDLE,
} from './you-proof-fixture';
import {
  runYouProofSeed,
  type YouProofHandleRow,
  type YouProofSeedStore,
} from './you-proof-seed';

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

const owned = (
  overrides: Partial<YouProofHandleRow> = {}
): YouProofHandleRow => ({
  profileId: 'p-you',
  ownerEmail: 'tim@jov.ie',
  username: YOU_PROOF_HANDLE,
  displayName: null,
  bio: null,
  isPublic: false,
  isClaimed: false,
  ...overrides,
});

function store(opts?: {
  handleRow?: YouProofHandleRow | null;
  store?: Partial<YouProofSeedStore>;
}) {
  const handleRow = opts && 'handleRow' in opts ? opts.handleRow : owned();
  const updateProfile = vi.fn(async () => undefined);
  const insertSocialLink = vi.fn(async () => undefined);
  const overrides = opts?.store ?? {};
  return {
    updateProfile,
    insertSocialLink,
    store: {
      loadHandleRow: overrides.loadHandleRow ?? (async () => handleRow ?? null),
      loadOwnerProfile:
        overrides.loadOwnerProfile ??
        (async ownerEmail =>
          handleRow
            ? {
                profileId: handleRow.profileId,
                ownerEmail,
                username: handleRow.username,
                displayName: handleRow.displayName,
                bio: handleRow.bio,
                isPublic: handleRow.isPublic,
                isClaimed: handleRow.isClaimed,
              }
            : null),
      loadSocialPlatforms:
        overrides.loadSocialPlatforms ?? (async () => new Set<string>()),
      updateProfile: overrides.updateProfile ?? updateProfile,
      insertSocialLink: overrides.insertSocialLink ?? insertSocialLink,
    } satisfies YouProofSeedStore,
  };
}

function mockDb(rows: Array<Record<string, unknown>> = []): YouProofDb {
  const limit = vi.fn(async () => rows);
  const whereJoin = vi.fn(() => ({ limit }));
  const leftJoin = vi.fn(() => ({ where: whereJoin }));
  const whereDirect = vi.fn(async () => rows);
  const from = vi.fn(() => ({ leftJoin, where: whereDirect }));
  return { select: vi.fn(() => ({ from })) } as unknown as YouProofDb;
}

describe('you-proof', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps /you claimable and mirrors homepage thesis', () => {
    expect(isReservedUsername(YOU_PROOF_HANDLE)).toBe(false);
    expect(isReservedPublicProfileIdentity(YOU_PROOF_HANDLE)).toBe(false);
    expect(getPublicUrlPolicyEntry('/you')).toMatchObject({
      action: 'hold',
      owner: 'summer',
    });
    expect(YOU_PROOF_FIXTURE).toMatchObject({
      handle: 'you',
      displayName: 'Your Name',
      release: {
        slug: 'first-light',
        artworkPath: '/img/releases/first-light.jpg',
      },
    });
  });

  it('plans inserts, blocks free/foreign/wrong-profile, stays idempotent', () => {
    const empty = planYouProofSeed({
      ownerEmail: 'tim@jov.ie',
      handleRow: owned({ displayName: null, isPublic: false }),
      ownerProfile: {
        profileId: 'p-you',
        ownerEmail: 'tim@jov.ie',
        username: 'you',
        displayName: null,
        bio: null,
        isPublic: false,
        isClaimed: false,
      },
      existingSocialPlatforms: new Set(),
    });
    expect(empty.blockers).toEqual([]);
    expect(empty.profileUpdates[0]?.set).toMatchObject({
      display_name: 'Your Name',
      is_public: true,
    });
    expect(empty.profileUpdates[0]?.set).not.toHaveProperty('is_claimed');
    expect(empty.socialLinks.every(l => l.action === 'insert')).toBe(true);

    expect(
      planYouProofSeed({
        ownerEmail: 'tim@jov.ie',
        handleRow: null,
        ownerProfile: null,
        existingSocialPlatforms: new Set(),
      }).blockers[0]
    ).toMatch(/free/i);
    expect(
      planYouProofSeed({
        ownerEmail: 'tim@jov.ie',
        handleRow: owned({ ownerEmail: 'x@y.z' }),
        ownerProfile: null,
        existingSocialPlatforms: new Set(),
      }).blockers[0]
    ).toMatch(/owned by/i);
    expect(
      planYouProofSeed({
        ownerEmail: 'tim@jov.ie',
        handleRow: owned(),
        ownerProfile: {
          profileId: 'p-other',
          ownerEmail: 'tim@jov.ie',
          username: 'tim',
          displayName: null,
          bio: null,
          isPublic: true,
          isClaimed: true,
        },
        existingSocialPlatforms: new Set(),
      }).blockers[0]
    ).toMatch(/different profile/i);

    const done = planYouProofSeed({
      ownerEmail: 'tim@jov.ie',
      handleRow: owned({
        displayName: YOU_PROOF_FIXTURE.displayName,
        bio: YOU_PROOF_FIXTURE.bio,
        isPublic: true,
        isClaimed: true,
      }),
      ownerProfile: {
        profileId: 'p-you',
        ownerEmail: 'tim@jov.ie',
        username: 'you',
        displayName: YOU_PROOF_FIXTURE.displayName,
        bio: YOU_PROOF_FIXTURE.bio,
        isPublic: true,
        isClaimed: true,
      },
      existingSocialPlatforms: new Set(
        YOU_PROOF_FIXTURE.socialLinks.map(l => l.platform)
      ),
    });
    expect(done.profileUpdates).toEqual([]);
    expect(done.socialLinks.every(l => l.action === 'unchanged')).toBe(true);
  });

  it('runs dry-run / apply / blockers through the seed runner', async () => {
    const dry = store();
    const dryResult = await runYouProofSeed({
      ownerEmail: 'tim@jov.ie',
      apply: false,
      store: dry.store,
    });
    expect(dryResult).toMatchObject({ exitCode: 0, mode: 'dry-run' });
    expect(dry.updateProfile).not.toHaveBeenCalled();

    const free = store({ handleRow: null });
    expect(
      (
        await runYouProofSeed({
          ownerEmail: 'tim@jov.ie',
          apply: true,
          store: free.store,
        })
      ).exitCode
    ).toBe(2);

    const apply = store();
    const applied = await runYouProofSeed({
      ownerEmail: 'tim@jov.ie',
      apply: true,
      store: apply.store,
    });
    expect(applied.exitCode).toBe(0);
    expect(applied.applied.socialInserts).toBe(
      YOU_PROOF_FIXTURE.socialLinks.length
    );
    expect(apply.updateProfile).toHaveBeenCalled();
    expect(apply.insertSocialLink).toHaveBeenCalledTimes(
      YOU_PROOF_FIXTURE.socialLinks.length
    );

    expect(
      (
        await runYouProofSeed({
          ownerEmail: ' ',
          apply: false,
          store: store().store,
        })
      ).exitCode
    ).toBe(2);
  });

  it('maps profile sets and writes via domain mutations', async () => {
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

    const db = mockDb([
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
    const s = createYouProofDbStore(db);
    await expect(s.loadHandleRow()).resolves.toMatchObject({
      profileId: 'p-you',
      ownerEmail: 'tim@jov.ie',
    });
    await expect(
      createYouProofDbStore(
        mockDb([{ profileId: null, ownerEmail: 'a@b.c' }])
      ).loadOwnerProfile('a@b.c')
    ).resolves.toBeNull();

    await s.updateProfile('p-you', {
      display_name: 'Your Name',
      is_public: true,
    });
    await s.insertSocialLink({
      profileId: 'p-you',
      platform: 'youtube',
      platformType: 'social',
      url: 'https://www.youtube.com/',
      displayText: 'YouTube',
      sortOrder: 1,
    });
    expect(updateProfileById).toHaveBeenCalled();
    expect(createLink).toHaveBeenCalled();
    expect(invalidateSocialLinksCache).toHaveBeenCalledWith('p-you', 'you');
    expect(invalidateProfileCache).toHaveBeenCalledWith('you');
  });
});
