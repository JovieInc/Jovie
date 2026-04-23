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
