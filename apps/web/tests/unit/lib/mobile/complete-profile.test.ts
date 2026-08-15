import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invalidateProfileCache: vi.fn(),
  invalidateProxyUserStateCache: vi.fn(),
  isHandleUniqueViolation: vi.fn(() => false),
  markWaitlistSignedUpInTx: vi.fn(),
  withDbSessionTx: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: mocks.withDbSessionTx,
}));
vi.mock('@/lib/auth/proxy-state', () => ({
  invalidateProxyUserStateCache: mocks.invalidateProxyUserStateCache,
}));
vi.mock('@/lib/cache/profile', () => ({
  invalidateProfileCache: mocks.invalidateProfileCache,
}));
vi.mock('@/lib/errors/onboarding', () => ({
  isHandleUniqueViolation: mocks.isHandleUniqueViolation,
}));
vi.mock('@/lib/waitlist/signup', () => ({
  markWaitlistSignedUpInTx: mocks.markWaitlistSignedUpInTx,
}));
vi.mock('@/lib/db/schema/auth', () => ({
  users: {
    activeProfileId: 'users.activeProfileId',
    id: 'users.id',
    userStatus: 'users.userStatus',
  },
}));
vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'profiles.id',
    isClaimed: 'profiles.isClaimed',
    onboardingCompletedAt: 'profiles.onboardingCompletedAt',
    updatedAt: 'profiles.updatedAt',
    userId: 'profiles.userId',
    usernameNormalized: 'profiles.usernameNormalized',
  },
  userProfileClaims: 'userProfileClaims',
}));

function makeTx(selectResults: unknown[][]) {
  const limit = vi.fn(async () => selectResults.shift() ?? []);
  const query = {
    for: vi.fn(() => ({ limit })),
    limit,
    orderBy: vi.fn(() => ({ limit })),
  };
  const select = vi.fn(() => ({
    from: vi.fn(() => ({ where: vi.fn(() => query) })),
  }));

  const updateValues: unknown[] = [];
  const returning = vi.fn(async () => [{ id: 'profile-1' }]);
  const update = vi.fn(() => ({
    set: vi.fn((values: unknown) => {
      updateValues.push(values);
      return { where: vi.fn(() => ({ returning })) };
    }),
  }));

  const insertValues: unknown[] = [];
  const insert = vi.fn(() => ({
    values: vi.fn((values: unknown) => {
      insertValues.push(values);
      return {
        onConflictDoNothing: vi.fn(async () => undefined),
        returning: vi.fn(async () => [{ id: 'profile-1' }]),
      };
    }),
  }));

  return { insert, insertValues, select, update, updateValues };
}

describe('completeMobileProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invalidateProfileCache.mockResolvedValue(undefined);
    mocks.invalidateProxyUserStateCache.mockResolvedValue(undefined);
    mocks.markWaitlistSignedUpInTx.mockResolvedValue({ entryId: null });
  });

  it('updates an owned partial profile and completes canonical account state atomically', async () => {
    const partialProfile = {
      claimedAt: null,
      id: 'profile-1',
      isClaimed: false,
      onboardingCompletedAt: null,
      usernameNormalized: 'old-handle',
    };
    const tx = makeTx([
      [
        {
          activeProfileId: 'profile-1',
          id: 'app-user-1',
          userStatus: 'waitlist_approved',
        },
      ],
      [partialProfile],
      [],
    ]);
    mocks.withDbSessionTx.mockImplementation(async callback => callback(tx));

    const { completeMobileProfile } = await import(
      '@/lib/mobile/complete-profile'
    );
    const result = await completeMobileProfile({
      displayName: '  Tim White  ',
      userId: 'app-user-1',
      username: '@Tim',
    });

    expect(result).toEqual({
      displayName: 'Tim White',
      profileId: 'profile-1',
      username: 'tim',
    });
    expect(tx.updateValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          displayName: 'Tim White',
          isClaimed: true,
          isPublic: true,
          usernameNormalized: 'tim',
        }),
        expect.objectContaining({
          activeProfileId: 'profile-1',
          userStatus: 'active',
        }),
      ])
    );
    expect(tx.insertValues).toContainEqual({
      creatorProfileId: 'profile-1',
      role: 'owner',
      userId: 'app-user-1',
    });
    expect(mocks.markWaitlistSignedUpInTx).toHaveBeenCalledWith(
      tx,
      'app-user-1'
    );
    expect(mocks.invalidateProxyUserStateCache).toHaveBeenCalledWith(
      'app-user-1'
    );
    expect(mocks.invalidateProfileCache).toHaveBeenCalledWith('old-handle');
    expect(mocks.invalidateProfileCache).toHaveBeenCalledWith('tim');
  });

  it.each([
    'banned',
    'suspended',
    'waitlist_pending',
  ])('blocks %s users', async userStatus => {
    const tx = makeTx([
      [{ activeProfileId: null, id: 'app-user-1', userStatus }],
    ]);
    mocks.withDbSessionTx.mockImplementation(async callback => callback(tx));

    const { completeMobileProfile } = await import(
      '@/lib/mobile/complete-profile'
    );
    await expect(
      completeMobileProfile({
        displayName: 'Tim White',
        userId: 'app-user-1',
        username: 'tim',
      })
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect(mocks.markWaitlistSignedUpInTx).not.toHaveBeenCalled();
  });

  it('rejects a handle owned by another profile', async () => {
    const tx = makeTx([
      [{ activeProfileId: null, id: 'app-user-1', userStatus: 'active' }],
      [],
      [{ id: 'someone-else' }],
    ]);
    mocks.withDbSessionTx.mockImplementation(async callback => callback(tx));

    const { completeMobileProfile } = await import(
      '@/lib/mobile/complete-profile'
    );
    await expect(
      completeMobileProfile({
        displayName: 'Tim White',
        userId: 'app-user-1',
        username: 'tim',
      })
    ).rejects.toMatchObject({ code: 'handle_taken' });
  });

  it('rejects invalid display names before opening a transaction', async () => {
    const { completeMobileProfile } = await import(
      '@/lib/mobile/complete-profile'
    );
    await expect(
      completeMobileProfile({
        displayName: '   ',
        userId: 'app-user-1',
        username: 'tim',
      })
    ).rejects.toMatchObject({ code: 'invalid_display_name' });
    expect(mocks.withDbSessionTx).not.toHaveBeenCalled();
  });
});
