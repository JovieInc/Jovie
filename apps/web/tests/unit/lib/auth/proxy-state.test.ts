import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist mocks before module resolution
const {
  mockDbSelect,
  mockIsWaitlistGateEnabled,
  mockRedisGet,
  mockRedisSet,
  mockRedisDel,
  mockGetRedis,
} = vi.hoisted(() => {
  const mockRedisGet = vi.fn();
  const mockRedisSet = vi.fn().mockResolvedValue('OK');
  const mockRedisDel = vi.fn().mockResolvedValue(1);
  const mockGetRedis = vi.fn().mockReturnValue(null);

  return {
    mockDbSelect: vi.fn(),
    mockIsWaitlistGateEnabled: vi.fn().mockResolvedValue(true),
    mockRedisGet,
    mockRedisSet,
    mockRedisDel,
    mockGetRedis,
  };
});

// Mock database
vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
  },
}));

// Mock schema (just provide empty objects for the table references)
vi.mock('@/lib/db/schema', () => ({
  users: {},
  creatorProfiles: {},
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: { id: 'id', clerkId: 'clerkId', status: 'status' },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    userId: 'userId',
    onboardingCompletedAt: 'onboardingCompletedAt',
  },
}));

// Mock heavy dependencies to prevent slow module resolution timeouts
vi.mock('server-only', () => ({}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
  getClient: vi.fn().mockReturnValue(null),
  withScope: vi.fn((cb: (scope: unknown) => void) =>
    cb({ setExtra: vi.fn(), setTag: vi.fn() })
  ),
  Severity: { Error: 'error', Warning: 'warning', Info: 'info' },
}));

vi.mock('@/lib/analytics/runtime-aware', () => ({
  trackEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/sentry/init', () => ({
  getSentryMode: vi.fn().mockReturnValue('disabled'),
  isSentryInitialized: vi.fn().mockReturnValue(false),
}));

vi.mock('@/lib/redis', () => ({
  getRedis: mockGetRedis,
}));

// Mock retry to skip exponential backoff delays — just execute the operation once
vi.mock('@/lib/db/client/retry', () => ({
  withRetry: vi.fn(async (operation: () => Promise<unknown>) => operation()),
  isRetryableError: vi.fn().mockReturnValue(false),
}));

// Mock waitlist as enabled for proxy-state tests (tests waitlist behavior)
vi.mock('@/lib/waitlist/settings', () => ({
  isWaitlistGateEnabled: mockIsWaitlistGateEnabled,
}));

import {
  getUserState,
  invalidateProxyUserStateCache,
} from '@/lib/auth/proxy-state';
// Import once — clear in-memory cache between tests via invalidateProxyUserStateCache
import { QueryTimeoutError } from '@/lib/db/query-timeout';

describe('proxy-state.ts', () => {
  beforeEach(async () => {
    mockDbSelect.mockClear();
    mockIsWaitlistGateEnabled.mockClear();
    mockRedisGet.mockClear();
    mockRedisSet.mockClear();
    mockRedisDel.mockClear();
    mockGetRedis.mockReset();
    mockGetRedis.mockReturnValue(null);
    mockIsWaitlistGateEnabled.mockResolvedValue(true);
    // Clear the module's in-memory cache to prevent cross-test contamination
    await invalidateProxyUserStateCache('clerk_123');
    await invalidateProxyUserStateCache('clerk_test_user');
    await invalidateProxyUserStateCache('clerk_parallel_gate');
    await invalidateProxyUserStateCache('clerk_stale_timeout');
  });

  describe('getUserState', () => {
    it('fetches waitlist gate in parallel with the DB query on cache miss', async () => {
      let releaseGate!: () => void;
      let releaseDb!: () => void;

      const gateBlocker = new Promise<boolean>(resolve => {
        releaseGate = () => resolve(true);
      });
      const dbBlocker = new Promise<never[]>(resolve => {
        releaseDb = () => resolve([]);
      });

      let gateInFlight = false;
      let dbInFlight = false;

      mockIsWaitlistGateEnabled.mockImplementation(() => {
        gateInFlight = true;
        return gateBlocker;
      });

      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockImplementation(() => {
                dbInFlight = true;
                return dbBlocker;
              }),
            }),
          }),
        }),
      });

      const pending = getUserState('clerk_parallel_gate');

      // Promise.all starts both operations; neither should complete before both are in flight.
      await Promise.resolve();
      expect(gateInFlight).toBe(true);
      expect(dbInFlight).toBe(true);

      releaseGate();
      releaseDb();
      await pending;

      expect(mockIsWaitlistGateEnabled).toHaveBeenCalledTimes(1);
    });

    it('returns needsOnboarding when no DB user exists', async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      const result = await getUserState('clerk_123');

      expect(result).toEqual({
        needsWaitlist: false,
        needsOnboarding: true,
        isActive: false,
        isBanned: false,
      });
    });

    it('returns needsOnboarding when dbUserId is null', async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ dbUserId: null }]),
            }),
          }),
        }),
      });

      const result = await getUserState('clerk_123');

      expect(result).toEqual({
        needsWaitlist: false,
        needsOnboarding: true,
        isActive: false,
        isBanned: false,
      });
    });

    it('returns needsWaitlist when userStatus is waitlist_pending', async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  dbUserId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                  userStatus: 'waitlist_pending',
                  profileId: null,
                  profileComplete: null,
                },
              ]),
            }),
          }),
        }),
      });

      const result = await getUserState('clerk_123');

      expect(result).toEqual({
        needsWaitlist: true,
        needsOnboarding: false,
        isActive: false,
        isBanned: false,
      });
    });

    it('returns needsOnboarding when approved but no profile', async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  dbUserId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                  userStatus: 'waitlist_approved',
                  profileId: null,
                  profileComplete: null,
                },
              ]),
            }),
          }),
        }),
      });

      const result = await getUserState('clerk_123');

      expect(result).toEqual({
        needsWaitlist: false,
        needsOnboarding: true,
        isActive: false,
        isBanned: false,
      });
    });

    it('returns needsOnboarding when profile exists but onboarding incomplete', async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  dbUserId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                  userStatus: 'profile_claimed',
                  profileId: 'profile-123',
                  profileComplete: null, // onboardingCompletedAt is null
                },
              ]),
            }),
          }),
        }),
      });

      const result = await getUserState('clerk_123');

      expect(result).toEqual({
        needsWaitlist: false,
        needsOnboarding: true,
        isActive: false,
        isBanned: false,
      });
    });

    it('returns isActive for fully onboarded user', async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  dbUserId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                  userStatus: 'active',
                  profileId: 'profile-123',
                  profileComplete: new Date(),
                  profileUsername: 'testuser',
                  profileUsernameNormalized: 'testuser',
                  profileDisplayName: 'Test User',
                  profileAvatarUrl: 'https://example.com/avatar.jpg',
                  profileIsPublic: true,
                },
              ]),
            }),
          }),
        }),
      });

      const result = await getUserState('clerk_123');

      expect(result).toEqual({
        needsWaitlist: false,
        needsOnboarding: false,
        isActive: true,
        isBanned: false,
      });
    });

    it('returns needsOnboarding when profile has onboardingCompletedAt but missing username', async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  dbUserId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                  userStatus: 'active',
                  profileId: 'profile-123',
                  profileComplete: new Date(),
                  profileUsername: null,
                  profileUsernameNormalized: null,
                  profileDisplayName: 'Test User',
                  profileAvatarUrl: 'https://example.com/avatar.jpg',
                  profileIsPublic: true,
                },
              ]),
            }),
          }),
        }),
      });

      const result = await getUserState('clerk_123');

      expect(result).toEqual({
        needsWaitlist: false,
        needsOnboarding: true,
        isActive: false,
        isBanned: false,
      });
    });

    it('handles waitlist_approved status as approved', async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  dbUserId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                  userStatus: 'waitlist_approved',
                  profileId: 'profile-123',
                  profileComplete: new Date(),
                  profileUsername: 'testuser',
                  profileUsernameNormalized: 'testuser',
                  profileDisplayName: 'Test User',
                  profileAvatarUrl: 'https://example.com/avatar.jpg',
                  profileIsPublic: true,
                },
              ]),
            }),
          }),
        }),
      });

      const result = await getUserState('clerk_123');

      expect(result.isActive).toBe(true);
    });

    it('handles profile_claimed status as approved', async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  dbUserId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                  userStatus: 'profile_claimed',
                  profileId: 'profile-123',
                  profileComplete: new Date(),
                  profileUsername: 'testuser',
                  profileUsernameNormalized: 'testuser',
                  profileDisplayName: 'Test User',
                  profileAvatarUrl: 'https://example.com/avatar.jpg',
                  profileIsPublic: true,
                },
              ]),
            }),
          }),
        }),
      });

      const result = await getUserState('clerk_123');

      expect(result.isActive).toBe(true);
    });

    it('handles onboarding_incomplete status as approved', async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  dbUserId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                  userStatus: 'onboarding_incomplete',
                  profileId: 'profile-123',
                  profileComplete: new Date(),
                  profileUsername: 'testuser',
                  profileUsernameNormalized: 'testuser',
                  profileDisplayName: 'Test User',
                  profileAvatarUrl: 'https://example.com/avatar.jpg',
                  profileIsPublic: true,
                },
              ]),
            }),
          }),
        }),
      });

      const result = await getUserState('clerk_123');

      expect(result.isActive).toBe(true);
    });

    it('returns safe fallback on database error', async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockRejectedValue(new Error('Database error')),
            }),
          }),
        }),
      });

      // Suppress console.error for this test
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const result = await getUserState('clerk_123');

      // Should return fail-closed fallback (waitlist) on database error.
      // This prevents waitlist-pending users from bypassing the gate
      // during a DB outage.
      expect(result).toEqual({
        needsWaitlist: true,
        needsOnboarding: false,
        isActive: false,
        isBanned: false,
      });

      consoleSpy.mockRestore();
    });

    it('logs error with context on database failure', async () => {
      const dbError = new Error('Connection timeout');
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockRejectedValue(dbError),
            }),
          }),
        }),
      });

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await getUserState('clerk_test_user');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '[ERROR] Database query failed in proxy state check'
        )
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Connection timeout')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('clerk_test_user')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('getProxyUserState')
      );

      consoleSpy.mockRestore();
    });

    it('serves stale Redis cache when DB query times out', async () => {
      const staleState = {
        needsWaitlist: false,
        needsOnboarding: false,
        isActive: true,
        isBanned: false,
      };

      mockGetRedis.mockReturnValue({
        get: mockRedisGet,
        set: mockRedisSet,
        del: mockRedisDel,
      });
      mockRedisGet.mockImplementation(async (key: string) => {
        if (key === 'proxy:user-state:clerk_stale_timeout') return null;
        if (key === 'proxy:user-state:stale:clerk_stale_timeout') {
          return staleState;
        }
        return null;
      });

      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi
                .fn()
                .mockRejectedValue(
                  new QueryTimeoutError(
                    '[proxy-state] DB query timed out after 3000ms'
                  )
                ),
            }),
          }),
        }),
      });

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await getUserState('clerk_stale_timeout');

      expect(result).toEqual(staleState);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '[WARNING] [proxy-state] Serving stale cache after DB failure'
        )
      );

      consoleSpy.mockRestore();
    });

    it('downgrades timeout without stale cache to warning fallback', async () => {
      mockGetRedis.mockReturnValue({
        get: mockRedisGet,
        set: mockRedisSet,
        del: mockRedisDel,
      });
      mockRedisGet.mockResolvedValue(null);

      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi
                .fn()
                .mockRejectedValue(
                  new QueryTimeoutError(
                    '[proxy-state] DB query timed out after 3000ms'
                  )
                ),
            }),
          }),
        }),
      });

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await getUserState('clerk_123');

      expect(result).toEqual({
        needsWaitlist: true,
        needsOnboarding: false,
        isActive: false,
        isBanned: false,
      });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '[WARNING] [proxy-state] DB query timed out without stale cache fallback'
        )
      );
      expect(errorSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('invalidates both primary and stale Redis cache keys', async () => {
      mockGetRedis.mockReturnValue({
        get: mockRedisGet,
        set: mockRedisSet,
        del: mockRedisDel,
      });

      await invalidateProxyUserStateCache('clerk_123');

      expect(mockRedisDel).toHaveBeenCalledWith('proxy:user-state:clerk_123');
      expect(mockRedisDel).toHaveBeenCalledWith(
        'proxy:user-state:stale:clerk_123'
      );
    });

    it('handles non-Error objects in catch block', async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockRejectedValue('String error'),
            }),
          }),
        }),
      });

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const result = await getUserState('clerk_123');

      expect(result).toEqual({
        needsWaitlist: true,
        needsOnboarding: false,
        isActive: false,
        isBanned: false,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '[ERROR] Database query failed in proxy state check'
        )
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('String error')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('StringError')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('clerk_123')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('ProxyUserState interface', () => {
    it('returns correctly typed object', async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  dbUserId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                  userStatus: 'active',
                  profileId: 'profile-123',
                  profileComplete: new Date(),
                  profileUsername: 'testuser',
                  profileUsernameNormalized: 'testuser',
                  profileDisplayName: 'Test User',
                  profileAvatarUrl: 'https://example.com/avatar.jpg',
                  profileIsPublic: true,
                },
              ]),
            }),
          }),
        }),
      });

      const result = await getUserState('clerk_123');

      // Type checks
      expect(typeof result.needsWaitlist).toBe('boolean');
      expect(typeof result.needsOnboarding).toBe('boolean');
      expect(typeof result.isActive).toBe('boolean');
    });
  });
});
