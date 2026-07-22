import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { creatorProfiles } from '@/lib/db/schema/profiles';

const mockGetUserByClerkId = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDbUpdate = vi.hoisted(() => vi.fn());
const mockEq = vi.hoisted(() =>
  vi.fn((left, right) => ({
    left,
    right,
  }))
);
const mockAnd = vi.hoisted(() =>
  vi.fn((...conditions: unknown[]) => ({ conditions }))
);
const mockDb = vi.hoisted(() => ({
  select: mockDbSelect,
  update: mockDbUpdate,
}));

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

vi.mock('@/lib/db/queries/shared', () => ({
  getUserByClerkId: mockGetUserByClerkId,
}));

vi.mock('drizzle-orm', async () => {
  const actual =
    await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm');
  return {
    ...actual,
    and: mockAnd,
    eq: mockEq,
  };
});

function createSelectChain(result: unknown[] = []) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  };
  mockDbSelect.mockReturnValue(chain);
  return chain;
}

function createUpdateChain(result: unknown[] = []) {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(result),
  };
  mockDbUpdate.mockReturnValue(chain);
  return chain;
}

describe('updateProfileRecords', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('merges incoming settings with existing settings before update', async () => {
    mockGetUserByClerkId.mockResolvedValue({ id: 'user-1' });
    createSelectChain([
      {
        usernameNormalized: 'testartist',
        settings: { hide_branding: false, exclude_self_from_analytics: true },
      },
    ]);
    const updateChain = createUpdateChain([
      {
        id: 'profile-1',
        usernameNormalized: 'testartist',
      },
    ]);

    const { updateProfileRecords } = await import(
      '@/app/api/dashboard/profile/lib/db-operations'
    );

    const result = await updateProfileRecords({
      clerkUserId: 'clerk_123',
      displayNameForUserUpdate: undefined,
      dbProfileUpdates: {
        location: 'Austin, TX',
        settings: { hometown: 'Tulsa, OK' },
      },
    });

    expect(result).not.toBeInstanceOf(NextResponse);
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        location: 'Austin, TX',
        settings: {
          hide_branding: false,
          exclude_self_from_analytics: true,
          hometown: 'Tulsa, OK',
        },
      })
    );
  });

  it('does not update user name when profile update returns no row', async () => {
    mockGetUserByClerkId.mockResolvedValue({ id: 'user-1' });
    createSelectChain([]);
    createUpdateChain([]);

    const { updateProfileRecords } = await import(
      '@/app/api/dashboard/profile/lib/db-operations'
    );

    const result = await updateProfileRecords({
      clerkUserId: 'clerk_123',
      displayNameForUserUpdate: 'Updated Name',
      dbProfileUpdates: { location: 'Austin, TX' },
    });

    expect(result).toBeInstanceOf(NextResponse);
    expect(mockDbUpdate).toHaveBeenCalledTimes(1);
    expect(mockDbUpdate).toHaveBeenCalledWith(creatorProfiles);
  });

  it('atomically rejects an older write after a newer write wins the same version', async () => {
    mockGetUserByClerkId.mockResolvedValue({ id: 'user-1' });

    let persistedBio = 'Original';
    let persistedVersion = 1;
    mockDbSelect.mockImplementation((selection: Record<string, unknown>) => ({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(async () =>
        Object.keys(selection).length === 1 && 'profileEditVersion' in selection
          ? [{ profileEditVersion: persistedVersion }]
          : [
              {
                usernameNormalized: 'testartist',
                settings: {},
                profileEditVersion: 1,
              },
            ]
      ),
    }));
    let markOlderWriteReached: (() => void) | undefined;
    const olderWriteReached = new Promise<void>(resolve => {
      markOlderWriteReached = resolve;
    });
    let releaseOlderWrite: (() => void) | undefined;
    const olderWriteGate = new Promise<void>(resolve => {
      releaseOlderWrite = resolve;
    });

    mockDbUpdate.mockImplementation(() => {
      let values: Record<string, unknown> = {};
      let predicate: { conditions: Array<{ left: unknown; right: unknown }> };
      const chain = {
        set(nextValues: Record<string, unknown>) {
          values = nextValues;
          return chain;
        },
        where(nextPredicate: typeof predicate) {
          predicate = nextPredicate;
          return chain;
        },
        async returning() {
          if (values.bio === 'Older A') {
            markOlderWriteReached?.();
            await olderWriteGate;
          }
          const versionCondition = predicate.conditions.find(
            condition => condition.left === creatorProfiles.profileEditVersion
          );
          if (versionCondition?.right !== persistedVersion) return [];
          persistedBio = String(values.bio);
          persistedVersion += 1;
          return [
            {
              id: 'profile-1',
              bio: persistedBio,
              profileEditVersion: persistedVersion,
            },
          ];
        },
      };
      return chain;
    });

    const { updateProfileRecords } = await import(
      '@/app/api/dashboard/profile/lib/db-operations'
    );
    const older = updateProfileRecords({
      clerkUserId: 'clerk_123',
      displayNameForUserUpdate: undefined,
      dbProfileUpdates: { bio: 'Older A' },
      expectedVersion: 1,
    });
    await olderWriteReached;
    const newer = updateProfileRecords({
      clerkUserId: 'clerk_123',
      displayNameForUserUpdate: undefined,
      dbProfileUpdates: { bio: 'Newer B' },
      expectedVersion: 1,
    });

    const newerResult = await newer;
    releaseOlderWrite?.();
    const olderResult = await older;

    expect(newerResult).not.toBeInstanceOf(NextResponse);
    expect(olderResult).toBeInstanceOf(NextResponse);
    expect((olderResult as NextResponse).status).toBe(409);
    expect(await (olderResult as NextResponse).json()).toMatchObject({
      code: 'VERSION_CONFLICT',
      expectedVersion: 1,
      currentVersion: 2,
    });
    expect(persistedBio).toBe('Newer B');
    expect(persistedVersion).toBe(2);
  });

  it('loads the profile through the user lookup and creator_profiles relation', async () => {
    mockGetUserByClerkId.mockResolvedValue({ id: 'user-1' });
    createSelectChain([
      {
        profile: {
          id: 'profile-1',
          userId: 'user-1',
          displayName: 'Test Artist',
        },
      },
    ]);

    const { getProfileByClerkId } = await import(
      '@/app/api/dashboard/profile/lib/db-operations'
    );

    const result = await getProfileByClerkId('clerk_123');

    expect(mockGetUserByClerkId).toHaveBeenCalledWith(
      expect.any(Object),
      'clerk_123'
    );
    expect(mockDbSelect).toHaveBeenCalledWith({
      profile: expect.any(Object),
    });
    expect(result).toEqual({
      profile: {
        id: 'profile-1',
        userId: 'user-1',
        displayName: 'Test Artist',
      },
    });
  });

  it('returns null when the Clerk user does not exist', async () => {
    mockGetUserByClerkId.mockResolvedValue(null);

    const { getProfileByClerkId } = await import(
      '@/app/api/dashboard/profile/lib/db-operations'
    );

    await expect(getProfileByClerkId('clerk_missing')).resolves.toBeNull();
    expect(mockDbSelect).not.toHaveBeenCalled();
  });
});

describe('getProfileByClerkId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves the Clerk user before loading the profile by user.id', async () => {
    let resolveUser: (value: { id: string } | null) => void;
    const userPromise = new Promise<{ id: string } | null>(resolve => {
      resolveUser = resolve;
    });
    mockGetUserByClerkId.mockReturnValue(userPromise);

    const profileRow = { profile: { id: 'profile-1' } };
    const selectChain = createSelectChain([profileRow]);

    const { getProfileByClerkId } = await import(
      '@/app/api/dashboard/profile/lib/db-operations'
    );

    const profilePromise = getProfileByClerkId('clerk_123');

    await Promise.resolve();
    expect(mockDbSelect).not.toHaveBeenCalled();

    resolveUser!({ id: 'user-1' });
    await expect(profilePromise).resolves.toEqual(profileRow);

    expect(mockGetUserByClerkId).toHaveBeenCalledWith(mockDb, 'clerk_123');
    expect(selectChain.from).toHaveBeenCalledWith(creatorProfiles);
    expect(selectChain.where).toHaveBeenCalledWith({
      left: creatorProfiles.userId,
      right: 'user-1',
    });
  });
});
