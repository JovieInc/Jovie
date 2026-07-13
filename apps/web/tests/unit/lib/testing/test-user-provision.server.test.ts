import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreateUser, mockGetUserList } = vi.hoisted(() => ({
  mockCreateUser: vi.fn(),
  mockGetUserList: vi.fn(),
}));

const { mockInvalidateProxyUserStateCache, mockRedisDel, mockRevalidateTag } =
  vi.hoisted(() => ({
    mockInvalidateProxyUserStateCache: vi.fn(),
    mockRedisDel: vi.fn(),
    mockRevalidateTag: vi.fn(),
  }));

vi.mock('@clerk/backend', () => ({
  createClerkClient: vi.fn(() => ({
    users: {
      createUser: mockCreateUser,
      getUserList: mockGetUserList,
    },
  })),
}));

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(function MockRedis() {
    return {
      del: mockRedisDel,
    };
  }),
}));

vi.mock('next/cache', () => ({
  revalidateTag: mockRevalidateTag,
}));

vi.mock('@/lib/auth/proxy-state', () => ({
  invalidateProxyUserStateCache: mockInvalidateProxyUserStateCache,
}));

describe('test-user-provision.server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_123');
  });

  it('returns a deterministic id for allowlisted browse emails (no Clerk API)', async () => {
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
    ).resolves.toBe('user_dev_browse_clerk_test_jov_ie');

    expect(mockGetUserList).not.toHaveBeenCalled();
    expect(mockCreateUser).not.toHaveBeenCalled();
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

  it('does not call Clerk when mock auth is enabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_CLERK_MOCK', '1');
    const { ensureClerkTestUser } = await import(
      '@/lib/testing/test-user-provision.server'
    );

    await expect(
      ensureClerkTestUser({
        email: 'browse-ready+clerk_test@jov.ie',
        username: 'browse-ready-user',
        firstName: 'Browse',
        lastName: 'Ready',
      })
    ).resolves.toBe('user_dev_browse_ready_clerk_test_jov_ie');

    expect(mockGetUserList).not.toHaveBeenCalled();
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('does not call Clerk when the test auth bypass is enabled', async () => {
    vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');
    const { ensureClerkTestUser } = await import(
      '@/lib/testing/test-user-provision.server'
    );

    await expect(
      ensureClerkTestUser({
        email: 'browse-ready+clerk_test@jov.ie',
        username: 'browse-ready-user',
        firstName: 'Browse',
        lastName: 'Ready',
      })
    ).resolves.toBe('user_dev_browse_ready_clerk_test_jov_ie');

    expect(mockGetUserList).not.toHaveBeenCalled();
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('prefers an explicit fallback id over the deterministic email-derived id', async () => {
    const { ensureClerkTestUser } = await import(
      '@/lib/testing/test-user-provision.server'
    );

    await expect(
      ensureClerkTestUser({
        email: 'browse+clerk_test@jov.ie',
        username: 'browse-test-user',
        firstName: 'Browse',
        lastName: 'Test',
        fallbackClerkId: 'user_fallback_admin',
      })
    ).resolves.toBe('user_fallback_admin');

    expect(mockGetUserList).not.toHaveBeenCalled();
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('uses an explicit fallback id for unauthorized Clerk lookups', async () => {
    mockGetUserList.mockRejectedValue({
      status: 401,
      errors: [{ code: 'authentication_invalid' }],
    });

    const { resolveClerkTestUserId } = await import(
      '@/lib/testing/test-user-provision.server'
    );

    await expect(
      resolveClerkTestUserId('e2e+clerk_test@jov.ie', 'user_seed_fallback')
    ).resolves.toBe('user_seed_fallback');
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

  it('adopts the allowlisted email row when the current Clerk id belongs to a stale test row', async () => {
    const updateValues: Array<Record<string, unknown>> = [];
    const selectQueue = [
      [
        {
          id: 'user_clerk_match',
          clerkId: 'user_live_e2e',
          email: 'stale-e2e@jov.ie',
        },
        {
          id: 'user_email_match',
          clerkId: 'user_old_e2e',
          email: 'e2e@jov.ie',
        },
      ],
    ];
    const database = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(async () => selectQueue.shift() ?? []),
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

    const { ensureUserRecord } = await import(
      '@/lib/testing/test-user-provision.server'
    );

    await expect(
      ensureUserRecord(database as never, {
        clerkId: 'user_live_e2e',
        email: 'e2e@jov.ie',
        name: 'E2E Test',
        userStatus: 'active',
        isAdmin: true,
        plan: 'max',
        isPro: true,
        billingUpdatedAt: new Date('2026-01-01T00:00:00.000Z'),
      })
    ).resolves.toEqual({
      id: 'user_email_match',
      previousClerkId: 'user_old_e2e',
    });

    expect(database.insert).not.toHaveBeenCalled();
    expect(updateValues).toHaveLength(2);
    expect(updateValues[0]).toMatchObject({
      clerkId: 'user_live_e2e__stale_user_clerk_match',
    });
    expect(updateValues[1]).toMatchObject({
      clerkId: 'user_live_e2e',
      email: 'e2e@jov.ie',
      isAdmin: true,
      plan: 'max',
      userStatus: 'active',
    });
  });

  it('updates the existing claimed profile for the same user when one already exists', async () => {
    const updateValues: Array<Record<string, unknown>> = [];
    const selectQueue = [[{ id: 'profile_existing', userId: 'user_123' }]];
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

  it('recovers duplicate claimed-profile races by retrying the duplicate lookup path', async () => {
    const duplicateError = new Error(
      'duplicate key value violates unique constraint "creator_profiles_username_normalized_unique"'
    );
    const selectQueue = [[], [], [{ id: 'profile_raced', userId: 'user_123' }]];
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

  it('recovers duplicate claimed-profile races when drizzle wraps the postgres duplicate error', async () => {
    const selectQueue = [[], [], [{ id: 'profile_raced', userId: 'user_123' }]];
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
            throw Object.assign(
              new Error('Failed query: insert into creator_profiles'),
              {
                cause: {
                  code: '23505',
                  message:
                    'duplicate key value violates unique constraint "creator_profiles_username_normalized_unique"',
                },
              }
            );
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

  it('rejects username matches that already belong to a different user', async () => {
    const updateValues: Array<Record<string, unknown>> = [];
    const selectQueue = [
      [{ id: 'profile_taken', userId: 'user_other', isClaimed: true }],
      [],
    ];
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
    ).rejects.toThrow(
      'Conflicting creator profile matches for next-name and user user_123'
    );

    expect(database.insert).not.toHaveBeenCalled();
    expect(updateValues).toHaveLength(0);
  });

  it('rejects duplicate-race username matches that belong to a different user', async () => {
    const duplicateError = new Error(
      'duplicate key value violates unique constraint "creator_profiles_username_normalized_unique"'
    );
    const selectQueue = [
      [],
      [],
      [{ id: 'profile_taken', userId: 'user_other', isClaimed: true }],
      [],
    ];
    const updateValues: Array<Record<string, unknown>> = [];
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
    ).rejects.toThrow(
      'Conflicting creator profile matches for next-name and user user_123'
    );

    expect(updateValues).toHaveLength(0);
  });

  it('clears proxy-state and dashboard caches for reprovisioned test users', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.com');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');

    const { invalidateTestUserCaches } = await import(
      '@/lib/testing/test-user-provision.server'
    );

    await invalidateTestUserCaches(['user_123', 'user_456']);

    expect(mockInvalidateProxyUserStateCache).toHaveBeenCalledTimes(2);
    expect(mockInvalidateProxyUserStateCache).toHaveBeenNthCalledWith(
      1,
      'user_123'
    );
    expect(mockInvalidateProxyUserStateCache).toHaveBeenNthCalledWith(
      2,
      'user_456'
    );
    expect(mockRevalidateTag).toHaveBeenCalledWith('dashboard-data', 'max');
    expect(mockRedisDel).toHaveBeenCalledWith('admin:role:user_123');
    expect(mockRedisDel).toHaveBeenCalledWith('admin:role:user_456');
  });

  it('ignores missing Next cache context during plain Node test seeding', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.com');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    mockRevalidateTag.mockImplementation(() => {
      throw new Error(
        'Invariant: static generation store missing in revalidateTag dashboard-data'
      );
    });

    const { invalidateTestUserCaches } = await import(
      '@/lib/testing/test-user-provision.server'
    );

    await expect(
      invalidateTestUserCaches(['user_123'])
    ).resolves.toBeUndefined();

    expect(mockInvalidateProxyUserStateCache).toHaveBeenCalledWith('user_123');
    expect(mockRedisDel).toHaveBeenCalledWith('admin:role:user_123');
  });

  it('rethrows unexpected cache invalidation failures', async () => {
    mockRevalidateTag.mockImplementation(() => {
      throw new Error('boom');
    });

    const { invalidateTestUserCaches } = await import(
      '@/lib/testing/test-user-provision.server'
    );

    await expect(invalidateTestUserCaches(['user_123'])).rejects.toThrow(
      'boom'
    );
  });
});
