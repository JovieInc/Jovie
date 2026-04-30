import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist mocks before module resolution
const {
  mockCachedAuth,
  mockCachedCurrentUser,
  mockDbSelect,
  mockDbInsert,
  mockEq,
  mockSql,
  mockIsWaitlistGateEnabled,
} = vi.hoisted(() => ({
  mockCachedAuth: vi.fn(),
  mockCachedCurrentUser: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockEq: vi.fn(),
  mockSql: vi.fn(),
  mockIsWaitlistGateEnabled: vi.fn().mockResolvedValue(true),
}));

vi.mock('drizzle-orm', async importOriginal => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  mockEq.mockImplementation((...args: any[]) => (actual as any).eq(...args));
  mockSql.mockImplementation((strings: TemplateStringsArray, ...values) => ({
    strings,
    values,
  }));
  return {
    ...actual,
    eq: ((...args: any[]) => mockEq(...args)) as unknown as typeof actual.eq,
    sql: ((strings: TemplateStringsArray, ...values: unknown[]) =>
      mockSql(strings, ...values)) as unknown as typeof actual.sql,
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

vi.mock('@/lib/waitlist/settings', () => ({
  isWaitlistGateEnabled: mockIsWaitlistGateEnabled,
}));

// Mock schema (just provide empty objects for the table references)
vi.mock('@/lib/db/schema', () => ({
  users: {},
  creatorProfiles: {},
  waitlistEntries: {},
}));

// Import module once at the top to avoid re-importing in each test
import {
  CanonicalUserState,
  canAccessApp,
  canAccessOnboarding,
  getRedirectForState,
  getWaitlistAccess,
  requiresRedirect,
  resolveUserState,
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
    mockIsWaitlistGateEnabled.mockResolvedValue(true);
  });

  describe('CanonicalUserState enum', () => {
    it('exports all expected user states', () => {
      expect(CanonicalUserState.UNAUTHENTICATED).toBe('UNAUTHENTICATED');
      expect(CanonicalUserState.NEEDS_DB_USER).toBe('NEEDS_DB_USER');
      expect(CanonicalUserState.NEEDS_WAITLIST_SUBMISSION).toBe(
        'NEEDS_WAITLIST_SUBMISSION'
      );
      expect(CanonicalUserState.WAITLIST_PENDING).toBe('WAITLIST_PENDING');
      expect(CanonicalUserState.NEEDS_ONBOARDING).toBe('NEEDS_ONBOARDING');
      expect(CanonicalUserState.ACTIVE).toBe('ACTIVE');
      expect(CanonicalUserState.BANNED).toBe('BANNED');
      expect(CanonicalUserState.USER_CREATION_FAILED).toBe(
        'USER_CREATION_FAILED'
      );
    });
  });

  describe('resolveUserState', () => {
    it('returns UNAUTHENTICATED when no Clerk session exists', async () => {
      mockCachedAuth.mockResolvedValue({ userId: null });

      const result = await resolveUserState();

      expect(result.state).toBe(CanonicalUserState.UNAUTHENTICATED);
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
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
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

      expect(result.state).toBe(CanonicalUserState.BANNED);
      expect(result.redirectTo).toBe('/unavailable');
    });

    it('returns BANNED for banned status', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue({
        emailAddresses: [{ emailAddress: 'test@example.com' }],
      });

      mockDbSelect.mockReturnValue(
        createJoinQueryMock([
          {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
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

      expect(result.state).toBe(CanonicalUserState.BANNED);
      expect(result.redirectTo).toBe('/unavailable');
    });

    it('returns BANNED for suspended status', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue({
        emailAddresses: [{ emailAddress: 'test@example.com' }],
      });

      mockDbSelect.mockReturnValue(
        createJoinQueryMock([
          {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
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

      expect(result.state).toBe(CanonicalUserState.BANNED);
      expect(result.redirectTo).toBe('/unavailable');
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
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            email: 'test@example.com',
            userStatus: 'active',
            isAdmin: false,
            isPro: false,
            deletedAt: null,
            profileId: null,
            profileUsername: null,
            profileUsernameNormalized: null,
            profileDisplayName: null,
            profileAvatarUrl: null,
            profileIsPublic: null,
            profileOnboardingCompletedAt: null,
            profileIsClaimed: null,
          },
        ])
      );

      const result = await resolveUserState();

      expect(result.state).toBe(CanonicalUserState.NEEDS_ONBOARDING);
      expect(result.redirectTo).toBe('/onboarding?fresh_signup=true');
      expect(result.dbUserId).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
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
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            email: 'test@example.com',
            userStatus: 'active',
            isAdmin: false,
            isPro: false,
            deletedAt: null,
            profileId: 'profile-123',
            profileUsername: null, // Missing username
            profileUsernameNormalized: null,
            profileDisplayName: 'Test User',
            profileAvatarUrl: 'https://example.com/avatar.jpg',
            profileIsPublic: true,
            profileOnboardingCompletedAt: null,
            profileIsClaimed: true,
          },
        ])
      );

      const result = await resolveUserState();

      expect(result.state).toBe(CanonicalUserState.NEEDS_ONBOARDING);
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
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            email: 'test@example.com',
            userStatus: 'active',
            isAdmin: false,
            isPro: true,
            deletedAt: null,
            profileId: 'profile-123',
            profileUsername: 'testuser',
            profileUsernameNormalized: 'testuser',
            profileDisplayName: 'Test User',
            profileAvatarUrl: 'https://example.com/avatar.jpg',
            profileIsPublic: true,
            profileOnboardingCompletedAt: new Date(),
            profileIsClaimed: true,
          },
        ])
      );

      const result = await resolveUserState();

      expect(result.state).toBe(CanonicalUserState.ACTIVE);
      expect(result.redirectTo).toBeNull();
      expect(result.context.isPro).toBe(true);
      expect(result.profileId).toBe('profile-123');
    });

    it('returns admin context correctly', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue({
        emailAddresses: [
          {
            emailAddress: 'admin@example.com',
            verification: { status: 'verified' },
          },
        ],
      });

      // Single JOIN query: admin user with complete profile
      mockDbSelect.mockReturnValue(
        createJoinQueryMock([
          {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            email: 'admin@example.com',
            userStatus: 'active',
            isAdmin: true,
            isPro: true,
            deletedAt: null,
            profileId: 'profile-123',
            profileUsername: 'admin',
            profileUsernameNormalized: 'admin',
            profileDisplayName: 'Admin User',
            profileAvatarUrl: 'https://example.com/avatar.jpg',
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

      expect(result.state).toBe(CanonicalUserState.NEEDS_DB_USER);
      expect(result.redirectTo).toBe('/onboarding?fresh_signup=true');
    });
  });

  describe('getRedirectForState', () => {
    it('returns correct redirect for each state', () => {
      expect(getRedirectForState(CanonicalUserState.UNAUTHENTICATED)).toBe(
        '/signin'
      );
      expect(getRedirectForState(CanonicalUserState.NEEDS_DB_USER)).toBe(
        '/onboarding?fresh_signup=true'
      );
      expect(
        getRedirectForState(CanonicalUserState.NEEDS_WAITLIST_SUBMISSION)
      ).toBe('/waitlist');
      expect(getRedirectForState(CanonicalUserState.WAITLIST_PENDING)).toBe(
        '/waitlist'
      );
      expect(getRedirectForState(CanonicalUserState.NEEDS_ONBOARDING)).toBe(
        '/onboarding?fresh_signup=true'
      );
      expect(getRedirectForState(CanonicalUserState.BANNED)).toBe(
        '/unavailable'
      );
      expect(getRedirectForState(CanonicalUserState.USER_CREATION_FAILED)).toBe(
        '/error/user-creation-failed'
      );
      expect(getRedirectForState(CanonicalUserState.ACTIVE)).toBeNull();
    });
  });

  describe('canAccessApp', () => {
    it('returns true only for ACTIVE state', async () => {
      expect(canAccessApp(CanonicalUserState.ACTIVE)).toBe(true);
      expect(canAccessApp(CanonicalUserState.UNAUTHENTICATED)).toBe(false);
      expect(canAccessApp(CanonicalUserState.NEEDS_DB_USER)).toBe(false);
      expect(canAccessApp(CanonicalUserState.NEEDS_WAITLIST_SUBMISSION)).toBe(
        false
      );
      expect(canAccessApp(CanonicalUserState.WAITLIST_PENDING)).toBe(false);
      expect(canAccessApp(CanonicalUserState.NEEDS_ONBOARDING)).toBe(false);
      expect(canAccessApp(CanonicalUserState.BANNED)).toBe(false);
      expect(canAccessApp(CanonicalUserState.USER_CREATION_FAILED)).toBe(false);
    });
  });

  describe('canAccessOnboarding', () => {
    it('returns true for NEEDS_ONBOARDING and ACTIVE states', () => {
      expect(canAccessOnboarding(CanonicalUserState.NEEDS_ONBOARDING)).toBe(
        true
      );
      expect(canAccessOnboarding(CanonicalUserState.ACTIVE)).toBe(true);
      expect(canAccessOnboarding(CanonicalUserState.UNAUTHENTICATED)).toBe(
        false
      );
      expect(canAccessOnboarding(CanonicalUserState.NEEDS_DB_USER)).toBe(false);
      expect(canAccessOnboarding(CanonicalUserState.BANNED)).toBe(false);
    });
  });

  describe('requiresRedirect', () => {
    it('returns false only for ACTIVE state', async () => {
      expect(requiresRedirect(CanonicalUserState.ACTIVE)).toBe(false);
      expect(requiresRedirect(CanonicalUserState.UNAUTHENTICATED)).toBe(true);
      expect(requiresRedirect(CanonicalUserState.NEEDS_DB_USER)).toBe(true);
      expect(
        requiresRedirect(CanonicalUserState.NEEDS_WAITLIST_SUBMISSION)
      ).toBe(true);
      expect(requiresRedirect(CanonicalUserState.WAITLIST_PENDING)).toBe(true);
      expect(requiresRedirect(CanonicalUserState.NEEDS_ONBOARDING)).toBe(true);
      expect(requiresRedirect(CanonicalUserState.BANNED)).toBe(true);
      expect(requiresRedirect(CanonicalUserState.USER_CREATION_FAILED)).toBe(
        true
      );
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

      // Verify the normalized value is included in the lower(email) SQL guard.
      expect(mockSql).toHaveBeenCalled();
      expect(mockSql.mock.calls[0]?.[2]).toBe('test@example.com');
      expect(whereMock).toHaveBeenCalledWith(mockSql.mock.results[0]?.value);
    });
  });
});
