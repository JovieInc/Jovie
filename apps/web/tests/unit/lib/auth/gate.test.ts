import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist mocks before module resolution
const { mockCachedAuth, mockCachedCurrentUser, mockDbSelect, mockDbInsert } =
  vi.hoisted(() => ({
    mockCachedAuth: vi.fn(),
    mockCachedCurrentUser: vi.fn(),
    mockDbSelect: vi.fn(),
    mockDbInsert: vi.fn(),
  }));

// Mock cached auth functions
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockCachedAuth,
  getCachedCurrentUser: mockCachedCurrentUser,
}));

// Mock database
vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
  },
}));

// Mock error tracking
vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: vi.fn(),
}));

// Mock schema (just provide empty objects for the table references)
vi.mock('@/lib/db/schema', () => ({
  users: {},
  creatorProfiles: {},
  waitlistEntries: {},
}));

describe('gate.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('UserState enum', () => {
    it('exports all expected user states', async () => {
      const { UserState } = await import('@/lib/auth/gate');

      expect(UserState.UNAUTHENTICATED).toBe('UNAUTHENTICATED');
      expect(UserState.NEEDS_DB_USER).toBe('NEEDS_DB_USER');
      expect(UserState.NEEDS_WAITLIST_SUBMISSION).toBe(
        'NEEDS_WAITLIST_SUBMISSION'
      );
      expect(UserState.WAITLIST_PENDING).toBe('WAITLIST_PENDING');
      expect(UserState.NEEDS_ONBOARDING).toBe('NEEDS_ONBOARDING');
      expect(UserState.ACTIVE).toBe('ACTIVE');
      expect(UserState.BANNED).toBe('BANNED');
      expect(UserState.USER_CREATION_FAILED).toBe('USER_CREATION_FAILED');
    });
  });

  describe('resolveUserState', () => {
    it('returns UNAUTHENTICATED when no Clerk session exists', async () => {
      mockCachedAuth.mockResolvedValue({ userId: null });

      const { resolveUserState, UserState } = await import('@/lib/auth/gate');
      const result = await resolveUserState();

      expect(result.state).toBe(UserState.UNAUTHENTICATED);
      expect(result.clerkUserId).toBeNull();
      expect(result.dbUserId).toBeNull();
      expect(result.redirectTo).toBe('/signin');
    });

    it('returns BANNED for soft-deleted users', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue({
        emailAddresses: [{ emailAddress: 'test@example.com' }],
      });

      // Mock DB user with deletedAt set
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 'db-user-123',
                userStatus: 'active',
                isAdmin: false,
                isPro: false,
                deletedAt: new Date(),
              },
            ]),
          }),
        }),
      });

      const { resolveUserState, UserState } = await import('@/lib/auth/gate');
      const result = await resolveUserState();

      expect(result.state).toBe(UserState.BANNED);
      expect(result.redirectTo).toBe('/banned');
    });

    it('returns BANNED for banned status', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue({
        emailAddresses: [{ emailAddress: 'test@example.com' }],
      });

      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 'db-user-123',
                userStatus: 'banned',
                isAdmin: false,
                isPro: false,
                deletedAt: null,
              },
            ]),
          }),
        }),
      });

      const { resolveUserState, UserState } = await import('@/lib/auth/gate');
      const result = await resolveUserState();

      expect(result.state).toBe(UserState.BANNED);
      expect(result.redirectTo).toBe('/banned');
    });

    it('returns BANNED for suspended status', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue({
        emailAddresses: [{ emailAddress: 'test@example.com' }],
      });

      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 'db-user-123',
                userStatus: 'suspended',
                isAdmin: false,
                isPro: false,
                deletedAt: null,
              },
            ]),
          }),
        }),
      });

      const { resolveUserState, UserState } = await import('@/lib/auth/gate');
      const result = await resolveUserState();

      expect(result.state).toBe(UserState.BANNED);
      expect(result.redirectTo).toBe('/banned');
    });

    it('returns NEEDS_ONBOARDING when user has no profile', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue({
        emailAddresses: [{ emailAddress: 'test@example.com' }],
      });

      // First call: get DB user
      mockDbSelect
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: 'db-user-123',
                  userStatus: 'active',
                  isAdmin: false,
                  isPro: false,
                  deletedAt: null,
                },
              ]),
            }),
          }),
        })
        // Second call: get profile (none found)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        });

      const { resolveUserState, UserState } = await import('@/lib/auth/gate');
      const result = await resolveUserState();

      expect(result.state).toBe(UserState.NEEDS_ONBOARDING);
      expect(result.redirectTo).toBe('/onboarding?fresh_signup=true');
      expect(result.dbUserId).toBe('db-user-123');
    });

    it('returns NEEDS_ONBOARDING when profile is incomplete', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue({
        emailAddresses: [{ emailAddress: 'test@example.com' }],
      });

      // First call: get DB user
      mockDbSelect
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: 'db-user-123',
                  userStatus: 'active',
                  isAdmin: false,
                  isPro: false,
                  deletedAt: null,
                },
              ]),
            }),
          }),
        })
        // Second call: get incomplete profile
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: 'profile-123',
                  username: null, // Missing username
                  usernameNormalized: null,
                  displayName: 'Test User',
                  isPublic: true,
                  onboardingCompletedAt: null,
                  isClaimed: true,
                },
              ]),
            }),
          }),
        });

      const { resolveUserState, UserState } = await import('@/lib/auth/gate');
      const result = await resolveUserState();

      expect(result.state).toBe(UserState.NEEDS_ONBOARDING);
      expect(result.profileId).toBe('profile-123');
    });

    it('returns ACTIVE for fully onboarded user', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue({
        emailAddresses: [{ emailAddress: 'test@example.com' }],
      });

      // First call: get DB user
      mockDbSelect
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: 'db-user-123',
                  userStatus: 'active',
                  isAdmin: false,
                  isPro: true,
                  deletedAt: null,
                },
              ]),
            }),
          }),
        })
        // Second call: get complete profile
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: 'profile-123',
                  username: 'testuser',
                  usernameNormalized: 'testuser',
                  displayName: 'Test User',
                  isPublic: true,
                  onboardingCompletedAt: new Date(),
                  isClaimed: true,
                },
              ]),
            }),
          }),
        });

      const { resolveUserState, UserState } = await import('@/lib/auth/gate');
      const result = await resolveUserState();

      expect(result.state).toBe(UserState.ACTIVE);
      expect(result.redirectTo).toBeNull();
      expect(result.context.isPro).toBe(true);
      expect(result.profileId).toBe('profile-123');
    });

    it('returns admin context correctly', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue({
        emailAddresses: [{ emailAddress: 'admin@example.com' }],
      });

      // First call: get DB user (admin)
      mockDbSelect
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: 'db-user-123',
                  userStatus: 'active',
                  isAdmin: true,
                  isPro: true,
                  deletedAt: null,
                },
              ]),
            }),
          }),
        })
        // Second call: get complete profile
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: 'profile-123',
                  username: 'admin',
                  usernameNormalized: 'admin',
                  displayName: 'Admin User',
                  isPublic: true,
                  onboardingCompletedAt: new Date(),
                  isClaimed: true,
                },
              ]),
            }),
          }),
        });

      const { resolveUserState } = await import('@/lib/auth/gate');
      const result = await resolveUserState();

      expect(result.context.isAdmin).toBe(true);
      expect(result.context.isPro).toBe(true);
      expect(result.context.email).toBe('admin@example.com');
    });

    it('returns NEEDS_DB_USER when createDbUserIfMissing is false', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue({
        emailAddresses: [{ emailAddress: 'test@example.com' }],
      });

      // No DB user found
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const { resolveUserState, UserState } = await import('@/lib/auth/gate');
      const result = await resolveUserState({ createDbUserIfMissing: false });

      expect(result.state).toBe(UserState.NEEDS_DB_USER);
      expect(result.redirectTo).toBe('/onboarding?fresh_signup=true');
    });
  });

  describe('getRedirectForState', () => {
    it('returns correct redirect for each state', async () => {
      const { getRedirectForState, UserState } = await import(
        '@/lib/auth/gate'
      );

      expect(getRedirectForState(UserState.UNAUTHENTICATED)).toBe('/signin');
      expect(getRedirectForState(UserState.NEEDS_DB_USER)).toBe(
        '/onboarding?fresh_signup=true'
      );
      expect(getRedirectForState(UserState.NEEDS_WAITLIST_SUBMISSION)).toBe(
        '/waitlist'
      );
      expect(getRedirectForState(UserState.WAITLIST_PENDING)).toBe('/waitlist');
      expect(getRedirectForState(UserState.NEEDS_ONBOARDING)).toBe(
        '/onboarding?fresh_signup=true'
      );
      expect(getRedirectForState(UserState.BANNED)).toBe('/banned');
      expect(getRedirectForState(UserState.USER_CREATION_FAILED)).toBe(
        '/error/user-creation-failed'
      );
      expect(getRedirectForState(UserState.ACTIVE)).toBeNull();
    });
  });

  describe('canAccessApp', () => {
    it('returns true only for ACTIVE state', async () => {
      const { canAccessApp, UserState } = await import('@/lib/auth/gate');

      expect(canAccessApp(UserState.ACTIVE)).toBe(true);
      expect(canAccessApp(UserState.UNAUTHENTICATED)).toBe(false);
      expect(canAccessApp(UserState.NEEDS_DB_USER)).toBe(false);
      expect(canAccessApp(UserState.NEEDS_WAITLIST_SUBMISSION)).toBe(false);
      expect(canAccessApp(UserState.WAITLIST_PENDING)).toBe(false);
      expect(canAccessApp(UserState.NEEDS_ONBOARDING)).toBe(false);
      expect(canAccessApp(UserState.BANNED)).toBe(false);
      expect(canAccessApp(UserState.USER_CREATION_FAILED)).toBe(false);
    });
  });

  describe('canAccessOnboarding', () => {
    it('returns true for NEEDS_ONBOARDING and ACTIVE states', async () => {
      const { canAccessOnboarding, UserState } = await import(
        '@/lib/auth/gate'
      );

      expect(canAccessOnboarding(UserState.NEEDS_ONBOARDING)).toBe(true);
      expect(canAccessOnboarding(UserState.ACTIVE)).toBe(true);
      expect(canAccessOnboarding(UserState.UNAUTHENTICATED)).toBe(false);
      expect(canAccessOnboarding(UserState.NEEDS_DB_USER)).toBe(false);
      expect(canAccessOnboarding(UserState.BANNED)).toBe(false);
    });
  });

  describe('requiresRedirect', () => {
    it('returns false only for ACTIVE state', async () => {
      const { requiresRedirect, UserState } = await import('@/lib/auth/gate');

      expect(requiresRedirect(UserState.ACTIVE)).toBe(false);
      expect(requiresRedirect(UserState.UNAUTHENTICATED)).toBe(true);
      expect(requiresRedirect(UserState.NEEDS_DB_USER)).toBe(true);
      expect(requiresRedirect(UserState.NEEDS_WAITLIST_SUBMISSION)).toBe(true);
      expect(requiresRedirect(UserState.WAITLIST_PENDING)).toBe(true);
      expect(requiresRedirect(UserState.NEEDS_ONBOARDING)).toBe(true);
      expect(requiresRedirect(UserState.BANNED)).toBe(true);
      expect(requiresRedirect(UserState.USER_CREATION_FAILED)).toBe(true);
    });
  });

  describe('getWaitlistAccess', () => {
    it('returns null status when no waitlist entry exists', async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const { getWaitlistAccess } = await import('@/lib/auth/gate');
      const result = await getWaitlistAccess('test@example.com');

      expect(result.entryId).toBeNull();
      expect(result.status).toBeNull();
    });

    it('returns entry data when waitlist entry exists', async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 'waitlist-123',
                status: 'claimed',
              },
            ]),
          }),
        }),
      });

      const { getWaitlistAccess } = await import('@/lib/auth/gate');
      const result = await getWaitlistAccess('Test@Example.com');

      expect(result.entryId).toBe('waitlist-123');
      expect(result.status).toBe('claimed');
    });

    it('normalizes email to lowercase', async () => {
      const whereMock = vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
      });

      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: whereMock,
        }),
      });

      const { getWaitlistAccess } = await import('@/lib/auth/gate');
      await getWaitlistAccess('  TEST@EXAMPLE.COM  ');

      // Verify the where clause was called with normalized email
      expect(whereMock).toHaveBeenCalled();
      const callArgs = whereMock.mock.calls[0][0];
      // Email should be trimmed and lowercased
      expect(callArgs).toEqual(
        expect.objectContaining({
          queryChunks: expect.arrayContaining(['test@example.com']),
        })
      );
    });
  });
});
