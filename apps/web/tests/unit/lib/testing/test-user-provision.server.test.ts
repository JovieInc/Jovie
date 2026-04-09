import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreateUser, mockGetUserList } = vi.hoisted(() => ({
  mockCreateUser: vi.fn(),
  mockGetUserList: vi.fn(),
}));

vi.mock('@clerk/backend', () => ({
  createClerkClient: vi.fn(() => ({
    users: {
      createUser: mockCreateUser,
      getUserList: mockGetUserList,
    },
  })),
}));

describe('test-user-provision.server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_123');
  });

  it('reuses the Clerk user when createUser races with an existing identifier', async () => {
    mockGetUserList
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ id: 'user_existing' }] });
    mockCreateUser.mockRejectedValue({
      status: 422,
      errors: [{ code: 'form_identifier_exists' }],
    });

    const { ensureClerkTestUser } = await import(
      '@/lib/testing/test-user-provision.server'
    );

    await expect(
      ensureClerkTestUser({
        email: 'browse+clerk_test@jov.ie',
        username: 'browse-test-user',
        firstName: 'Browse',
        lastName: 'Test',
      })
    ).resolves.toBe('user_existing');

    expect(mockGetUserList).toHaveBeenCalledTimes(2);
  });

  it('does not call Clerk for non-allowlisted emails', async () => {
    const { ensureClerkTestUser } = await import(
      '@/lib/testing/test-user-provision.server'
    );

    await expect(
      ensureClerkTestUser({
        email: 'person@example.com',
        username: 'person',
        firstName: 'Person',
        lastName: 'Example',
      })
    ).resolves.toBe('user_dev_person_example_com');

    expect(mockGetUserList).not.toHaveBeenCalled();
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('keeps privileged seeding narrower than the generic browse allowlist', async () => {
    const {
      isAllowlistedPrivilegedTestAccountEmail,
      isAllowlistedTestAccountEmail,
    } = await import('@/lib/testing/test-user-provision.server');

    expect(isAllowlistedTestAccountEmail('browse+clerk_test@jov.ie')).toBe(
      true
    );
    expect(
      isAllowlistedPrivilegedTestAccountEmail('browse+clerk_test@jov.ie')
    ).toBe(false);
    expect(
      isAllowlistedPrivilegedTestAccountEmail('e2e+clerk_test@jov.ie')
    ).toBe(true);
  });

  it('updates the existing claimed profile for the same user before checking username', async () => {
    const updateValues: Array<Record<string, unknown>> = [];
    const selectQueue = [[{ id: 'profile_existing' }]];
    const database = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => selectQueue.shift() ?? []),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((values: Record<string, unknown>) => {
          updateValues.push(values);
          return {
            where: vi.fn(async () => undefined),
          };
        }),
      })),
      insert: vi.fn(),
    };

    const { ensureCreatorProfileRecord } = await import(
      '@/lib/testing/test-user-provision.server'
    );

    await expect(
      ensureCreatorProfileRecord(database as never, {
        userId: 'user_123',
        creatorType: 'artist',
        username: 'next-name',
        usernameNormalized: 'next-name',
        displayName: 'Next Name',
        bio: null,
        venmoHandle: null,
        avatarUrl: null,
        spotifyUrl: null,
        appleMusicUrl: null,
        appleMusicId: null,
        youtubeMusicId: null,
        deezerId: null,
        tidalId: null,
        soundcloudId: null,
        isPublic: true,
        isVerified: false,
        isClaimed: true,
        ingestionStatus: 'idle',
        onboardingCompletedAt: null,
      })
    ).resolves.toBe('profile_existing');

    expect(database.insert).not.toHaveBeenCalled();
    expect(updateValues).toHaveLength(1);
    expect(updateValues[0]).toMatchObject({
      userId: 'user_123',
      username: 'next-name',
      usernameNormalized: 'next-name',
      isClaimed: true,
    });
  });

  it('recovers duplicate claimed-profile races by retrying user lookup before username lookup', async () => {
    const duplicateError = new Error(
      'duplicate key value violates unique constraint "creator_profiles_username_normalized_unique"'
    );
    const selectQueue = [[], [], [{ id: 'profile_raced' }]];
    const database = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => selectQueue.shift() ?? []),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(async () => undefined),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(async () => {
            throw duplicateError;
          }),
        })),
      })),
    };

    const { ensureCreatorProfileRecord } = await import(
      '@/lib/testing/test-user-provision.server'
    );

    await expect(
      ensureCreatorProfileRecord(database as never, {
        userId: 'user_123',
        creatorType: 'artist',
        username: 'next-name',
        usernameNormalized: 'next-name',
        displayName: 'Next Name',
        bio: null,
        venmoHandle: null,
        avatarUrl: null,
        spotifyUrl: null,
        appleMusicUrl: null,
        appleMusicId: null,
        youtubeMusicId: null,
        deezerId: null,
        tidalId: null,
        soundcloudId: null,
        isPublic: true,
        isVerified: false,
        isClaimed: true,
        ingestionStatus: 'idle',
        onboardingCompletedAt: null,
      })
    ).resolves.toBe('profile_raced');

    expect(database.insert).toHaveBeenCalledTimes(1);
    expect(database.update).toHaveBeenCalledTimes(1);
  });
});
