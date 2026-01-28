import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist mocks before module resolution
const {
  mockCachedAuth,
  mockCachedCurrentUser,
  mockDbSelect,
  mockDbInsert,
  mockEq,
} = vi.hoisted(() => ({
  mockCachedAuth: vi.fn(),
  mockCachedCurrentUser: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockEq: vi.fn(),
}));

vi.mock('drizzle-orm', async importOriginal => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  mockEq.mockImplementation((...args: any[]) => (actual as any).eq(...args));
  return {
    ...actual,
    eq: ((...args: any[]) => mockEq(...args)) as unknown as typeof actual.eq,
  };
});

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

// Import module once at the top to avoid re-importing in each test
import {
  canAccessApp,
  canAccessOnboarding,
  getRedirectForState,
  getWaitlistAccess,
  requiresRedirect,
  resolveUserState,
  UserState,
} from '@/lib/auth/gate';

// Helper to create mock for the single JOIN query used by resolveUserState
// Now uses a single query with LEFT JOIN for user + profile
const createJoinQueryMock = (result: unknown[]) => ({
  from: vi.fn().mockReturnValue({
    leftJoin: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(result),
      }),
    }),
  }),
});

// Helper to create mock for simple queries (waitlist)
const createSimpleQueryMock = (result: unknown[]) => ({
  from: vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue(result),
    }),
  }),
});

describe('gate.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('UserState enum', () => {
    it('exports all expected user states', () => {
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

      // Mock JOIN query returning user with deletedAt set (no profile)
      mockDbSelect.mockReturnValue(
        createJoinQueryMock([
          {
            id: 'db-user-123',
            email: 'test@example.com',
            userStatus: 'active',
            isAdmin: false,
            isPro: false,
            deletedAt: new Date(),
            profileId: null,
          },
        ])
      );

      const result = await resolveUserState();

      expect(result.state).toBe(UserState.BANNED);
      expect(result.redirectTo).toBe('/banned');
    });

    it('returns BANNED for banned status', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue({
        emailAddresses: [{ emailAddress: 'test@example.com' }],
      });

      mockDbSelect.mockReturnValue(
        createJoinQueryMock([
          {
            id: 'db-user-123',
            email: 'test@example.com',
            userStatus: 'banned',
            isAdmin: false,
            isPro: false,
            deletedAt: null,
            profileId: null,
          },
        ])
      );

      const result = await resolveUserState();

      expect(result.state).toBe(UserState.BANNED);
      expect(result.redirectTo).toBe('/banned');
    });

    it('returns BANNED for suspended status', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue({
        emailAddresses: [{ emailAddress: 'test@example.com' }],
      });

      mockDbSelect.mockReturnValue(
        createJoinQueryMock([
          {
            id: 'db-user-123',
            email: 'test@example.com',
            userStatus: 'suspended',
            isAdmin: false,
            isPro: false,
            deletedAt: null,
            profileId: null,
          },
        ])
      );

      const result = await resolveUserState();

      expect(result.state).toBe(UserState.BANNED);
      expect(result.redirectTo).toBe('/banned');
    });

    it('returns NEEDS_ONBOARDING when user has no profile', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue({
        emailAddresses: [{ emailAddress: 'test@example.com' }],
      });

      // Single JOIN query: user exists but no profile (profileId is null)
      mockDbSelect.mockReturnValue(
        createJoinQueryMock([
          {
            id: 'db-user-123',
            email: 'test@example.com',
            userStatus: 'active',
            isAdmin: false,
            isPro: false,
            deletedAt: null,
            profileId: null,
            profileUsername: null,
            profileUsernameNormalized: null,
            profileDisplayName: null,
            profileIsPublic: null,
            profileOnboardingCompletedAt: null,
            profileIsClaimed: null,
          },
        ])
      );

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

      // Single JOIN query: user with incomplete profile (missing username)
      mockDbSelect.mockReturnValue(
        createJoinQueryMock([
          {
            id: 'db-user-123',
            email: 'test@example.com',
            userStatus: 'active',
            isAdmin: false,
            isPro: false,
            deletedAt: null,
            profileId: 'profile-123',
            profileUsername: null, // Missing username
            profileUsernameNormalized: null,
            profileDisplayName: 'Test User',
            profileIsPublic: true,
            profileOnboardingCompletedAt: null,
            profileIsClaimed: true,
          },
        ])
      );

      const result = await resolveUserState();

      expect(result.state).toBe(UserState.NEEDS_ONBOARDING);
      expect(result.profileId).toBe('profile-123');
    });

    it('returns ACTIVE for fully onboarded user', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue({
        emailAddresses: [{ emailAddress: 'test@example.com' }],
      });

      // Single JOIN query: user with complete profile
      mockDbSelect.mockReturnValue(
        createJoinQueryMock([
          {
            id: 'db-user-123',
            email: 'test@example.com',
            userStatus: 'active',
            isAdmin: false,
            isPro: true,
            deletedAt: null,
            profileId: 'profile-123',
            profileUsername: 'testuser',
            profileUsernameNormalized: 'testuser',
            profileDisplayName: 'Test User',
            profileIsPublic: true,
            profileOnboardingCompletedAt: new Date(),
            profileIsClaimed: true,
          },
        ])
      );

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

      // Single JOIN query: admin user with complete profile
      mockDbSelect.mockReturnValue(
        createJoinQueryMock([
          {
            id: 'db-user-123',
            email: 'admin@example.com',
            userStatus: 'active',
            isAdmin: true,
            isPro: true,
            deletedAt: null,
            profileId: 'profile-123',
            profileUsername: 'admin',
            profileUsernameNormalized: 'admin',
            profileDisplayName: 'Admin User',
            profileIsPublic: true,
            profileOnboardingCompletedAt: new Date(),
            profileIsClaimed: true,
          },
        ])
      );

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

      // No DB user found (JOIN query returns empty)
      mockDbSelect.mockReturnValue(createJoinQueryMock([]));

      const result = await resolveUserState({ createDbUserIfMissing: false });

      expect(result.state).toBe(UserState.NEEDS_DB_USER);
      expect(result.redirectTo).toBe('/onboarding?fresh_signup=true');
    });
  });

  describe('getRedirectForState', () => {
    it('returns correct redirect for each state', () => {
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
    it('returns true for NEEDS_ONBOARDING and ACTIVE states', () => {
      expect(canAccessOnboarding(UserState.NEEDS_ONBOARDING)).toBe(true);
      expect(canAccessOnboarding(UserState.ACTIVE)).toBe(true);
      expect(canAccessOnboarding(UserState.UNAUTHENTICATED)).toBe(false);
      expect(canAccessOnboarding(UserState.NEEDS_DB_USER)).toBe(false);
      expect(canAccessOnboarding(UserState.BANNED)).toBe(false);
    });
  });

  describe('requiresRedirect', () => {
    it('returns false only for ACTIVE state', async () => {
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
      mockDbSelect.mockReturnValue(createSimpleQueryMock([]));

      const result = await getWaitlistAccess('test@example.com');

      expect(result.entryId).toBeNull();
      expect(result.status).toBeNull();
    });

    it('returns entry data when waitlist entry exists', async () => {
      mockDbSelect.mockReturnValue(
        createSimpleQueryMock([
          {
            id: 'waitlist-123',
            status: 'claimed',
          },
        ])
      );

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

      await getWaitlistAccess('  TEST@EXAMPLE.COM  ');

      // Verify the normalized value is passed into Drizzle eq()
      expect(mockEq).toHaveBeenCalled();
      expect(mockEq.mock.calls[0]?.[1]).toBe('test@example.com');
      // And that where() receives the exact SQL expression returned by eq()
      expect(whereMock).toHaveBeenCalledWith(mockEq.mock.results[0]?.value);
    });
  });
});
