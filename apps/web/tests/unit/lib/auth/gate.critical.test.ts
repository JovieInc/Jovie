import { beforeEach, describe, expect, it, vi } from 'vitest';

// =============================================================================
// 1. Hoist all mocks FIRST (before any module resolution)
// =============================================================================
const {
  mockCachedAuth,
  mockCachedCurrentUser,
  mockDbSelect,
  mockDbInsert,
  mockDbUpdate,
  mockCaptureError,
  mockCaptureCriticalError,
  mockSyncEmailFromClerk,
  mockResolveProfileState,
  mockCheckUserStatus,
  mockIsWaitlistEnabled,
  mockNormalizeEmail,
  mockSentryAddBreadcrumb,
} = vi.hoisted(() => ({
  mockCachedAuth: vi.fn(),
  mockCachedCurrentUser: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockCaptureError: vi.fn().mockResolvedValue(undefined),
  mockCaptureCriticalError: vi.fn().mockResolvedValue(undefined),
  mockSyncEmailFromClerk: vi.fn().mockResolvedValue(undefined),
  mockResolveProfileState: vi.fn(),
  mockCheckUserStatus: vi.fn(),
  mockIsWaitlistEnabled: vi.fn(),
  mockNormalizeEmail: vi.fn((e: string) => e.toLowerCase().trim()),
  mockSentryAddBreadcrumb: vi.fn(),
}));

// =============================================================================
// 2. vi.mock() calls
// =============================================================================
vi.mock('server-only', () => ({}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockCachedAuth,
  getCachedCurrentUser: mockCachedCurrentUser,
}));

vi.mock('@/lib/db', () => {
  // Build chainable db mock on each access
  return {
    db: {
      select: mockDbSelect,
      insert: mockDbInsert,
      update: mockDbUpdate,
    },
  };
});

vi.mock('@/lib/db/schema/auth', () => ({
  users: {
    id: 'users.id',
    clerkId: 'users.clerkId',
    email: 'users.email',
    userStatus: 'users.userStatus',
    isAdmin: 'users.isAdmin',
    isPro: 'users.isPro',
    deletedAt: 'users.deletedAt',
    waitlistEntryId: 'users.waitlistEntryId',
    updatedAt: 'users.updatedAt',
  },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'creatorProfiles.id',
    userId: 'creatorProfiles.userId',
    username: 'creatorProfiles.username',
    usernameNormalized: 'creatorProfiles.usernameNormalized',
    displayName: 'creatorProfiles.displayName',
    isPublic: 'creatorProfiles.isPublic',
    onboardingCompletedAt: 'creatorProfiles.onboardingCompletedAt',
    isClaimed: 'creatorProfiles.isClaimed',
  },
}));

vi.mock('@/lib/db/schema/waitlist', () => ({
  waitlistEntries: {
    id: 'waitlistEntries.id',
    email: 'waitlistEntries.email',
    status: 'waitlistEntries.status',
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
  captureCriticalError: mockCaptureCriticalError,
}));

vi.mock('@/lib/utils/email', () => ({
  normalizeEmail: mockNormalizeEmail,
}));

vi.mock('@/lib/auth/clerk-sync', () => ({
  syncEmailFromClerk: mockSyncEmailFromClerk,
}));

vi.mock('@/lib/auth/profile-state-resolver', () => ({
  resolveProfileState: mockResolveProfileState,
}));

vi.mock('@/lib/auth/status-checker', () => ({
  checkUserStatus: mockCheckUserStatus,
}));

vi.mock('@/lib/auth/waitlist-config', () => ({
  isWaitlistEnabled: mockIsWaitlistEnabled,
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col, val) => ({ eq: val })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
}));

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: mockSentryAddBreadcrumb,
}));

// =============================================================================
// 3. Import tested module AFTER mocks
// =============================================================================
import {
  canAccessApp,
  canAccessOnboarding,
  getRedirectForState,
  getWaitlistAccess,
  requiresRedirect,
  resolveUserState,
  UserState,
} from '@/lib/auth/gate';

// =============================================================================
// Helpers
// =============================================================================

/** Creates a chainable select mock: db.select({...}).from(...).leftJoin(...).where(...).limit(...) */
function createJoinSelectChain(result: unknown[]) {
  const mockLimit = vi.fn().mockResolvedValue(result);
  const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
  const mockLeftJoin = vi.fn().mockReturnValue({ where: mockWhere });
  const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin });
  return { from: mockFrom };
}

/** Creates a simple select chain: db.select({...}).from(...).where(...).limit(...) */
function createSimpleSelectChain(result: unknown[]) {
  const mockLimit = vi.fn().mockResolvedValue(result);
  const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  return { from: mockFrom };
}

/** Creates an insert chain: db.insert(...).values(...).onConflictDoUpdate(...).returning(...) */
function createInsertChain(result: unknown[]) {
  const mockReturning = vi.fn().mockResolvedValue(result);
  const mockOnConflict = vi.fn().mockReturnValue({ returning: mockReturning });
  const mockValues = vi.fn().mockReturnValue({
    onConflictDoUpdate: mockOnConflict,
    returning: mockReturning,
  });
  return { values: mockValues };
}

/** Creates an update chain: db.update(...).set(...).where(...).returning(...) */
function _createUpdateChain(result: unknown[]) {
  const mockReturning = vi.fn().mockResolvedValue(result);
  const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
  return { set: mockSet };
}

/** Standard mock Clerk user with verified email */
function mockClerkUser(email = 'test@example.com') {
  return {
    emailAddresses: [
      {
        emailAddress: email,
        verification: { status: 'verified' },
      },
    ],
  };
}

/** Standard DB result from the JOIN query in resolveUserState */
function mockDbUserResult(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

/** Sets up default non-blocked status check */
function setupNonBlockedStatus() {
  mockCheckUserStatus.mockReturnValue({
    isBlocked: false,
    blockedState: null,
    redirectTo: null,
  });
}

// =============================================================================
// Tests
// =============================================================================
describe('@critical gate.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no fake timers needed since we mock setTimeout in retry tests
    mockIsWaitlistEnabled.mockReturnValue(false);
    setupNonBlockedStatus();
    mockResolveProfileState.mockReturnValue({
      state: UserState.NEEDS_ONBOARDING,
      profileId: null,
      redirectTo: '/onboarding?fresh_signup=true',
    });
  });

  // ===========================================================================
  // resolveUserState
  // ===========================================================================
  describe('resolveUserState', () => {
    it('returns UNAUTHENTICATED when no Clerk session', async () => {
      mockCachedAuth.mockResolvedValue({ userId: null });
      mockCachedCurrentUser.mockResolvedValue(null);

      const result = await resolveUserState();

      expect(result.state).toBe(UserState.UNAUTHENTICATED);
      expect(result.clerkUserId).toBeNull();
      expect(result.dbUserId).toBeNull();
      expect(result.redirectTo).toBe('/signin');
      expect(result.context.isAdmin).toBe(false);
    });

    it('returns ACTIVE for a fully set up user with complete profile', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue(mockClerkUser());

      const dbResult = mockDbUserResult({
        profileId: 'profile-123',
        profileUsername: 'testuser',
        profileUsernameNormalized: 'testuser',
        profileDisplayName: 'Test User',
        profileIsPublic: true,
        profileOnboardingCompletedAt: new Date(),
        profileIsClaimed: true,
      });
      mockDbSelect.mockReturnValue(createJoinSelectChain([dbResult]));

      mockResolveProfileState.mockReturnValue({
        state: UserState.ACTIVE,
        profileId: 'profile-123',
        redirectTo: null,
      });

      const result = await resolveUserState();

      expect(result.state).toBe(UserState.ACTIVE);
      expect(result.clerkUserId).toBe('clerk_123');
      expect(result.dbUserId).toBe('db-user-123');
      expect(result.profileId).toBe('profile-123');
      expect(result.redirectTo).toBeNull();
    });

    it('returns NEEDS_ONBOARDING when profile is incomplete', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue(mockClerkUser());

      const dbResult = mockDbUserResult({ profileId: null });
      mockDbSelect.mockReturnValue(createJoinSelectChain([dbResult]));

      mockResolveProfileState.mockReturnValue({
        state: UserState.NEEDS_ONBOARDING,
        profileId: null,
        redirectTo: '/onboarding?fresh_signup=true',
      });

      const result = await resolveUserState();

      expect(result.state).toBe(UserState.NEEDS_ONBOARDING);
      expect(result.redirectTo).toBe('/onboarding?fresh_signup=true');
    });

    it('returns BANNED when user status is banned', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue(mockClerkUser());

      const dbResult = mockDbUserResult({ userStatus: 'banned' });
      mockDbSelect.mockReturnValue(createJoinSelectChain([dbResult]));

      mockCheckUserStatus.mockReturnValue({
        isBlocked: true,
        blockedState: UserState.BANNED,
        redirectTo: '/banned',
      });

      const result = await resolveUserState();

      expect(result.state).toBe(UserState.BANNED);
      expect(result.redirectTo).toBe('/banned');
      expect(result.dbUserId).toBe('db-user-123');
    });

    it('returns BANNED when user is soft-deleted', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue(mockClerkUser());

      const dbResult = mockDbUserResult({ deletedAt: new Date() });
      mockDbSelect.mockReturnValue(createJoinSelectChain([dbResult]));

      mockCheckUserStatus.mockReturnValue({
        isBlocked: true,
        blockedState: UserState.BANNED,
        redirectTo: '/banned',
      });

      const result = await resolveUserState();

      expect(result.state).toBe(UserState.BANNED);
    });

    it('returns NEEDS_DB_USER when createDbUserIfMissing is false and no DB user', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue(mockClerkUser());

      // No DB user found
      mockDbSelect.mockReturnValue(createJoinSelectChain([]));

      const result = await resolveUserState({ createDbUserIfMissing: false });

      expect(result.state).toBe(UserState.NEEDS_DB_USER);
      expect(result.dbUserId).toBeNull();
      expect(result.redirectTo).toBe('/onboarding?fresh_signup=true');
    });

    it('creates DB user when createDbUserIfMissing is true (default) and no DB user exists', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue(mockClerkUser());

      // First call: resolveUserState main query (no user found)
      // Second call: createUserWithRetry inner select (no existing user)
      let selectCallCount = 0;
      mockDbSelect.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // Main query in resolveUserState - no user
          return createJoinSelectChain([]);
        }
        // createUserWithRetry inner select - no existing user
        return createJoinSelectChain([]);
      });

      // Insert succeeds
      mockDbInsert.mockReturnValue(createInsertChain([{ id: 'new-user-id' }]));

      mockResolveProfileState.mockReturnValue({
        state: UserState.NEEDS_ONBOARDING,
        profileId: null,
        redirectTo: '/onboarding?fresh_signup=true',
      });

      const result = await resolveUserState();

      expect(result.state).toBe(UserState.NEEDS_ONBOARDING);
      expect(result.dbUserId).toBe('new-user-id');
      expect(mockDbInsert).toHaveBeenCalled();
    });

    it('returns USER_CREATION_FAILED when user creation fails after retries', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue(mockClerkUser());

      // No DB user found
      mockDbSelect.mockReturnValue(createJoinSelectChain([]));

      // Insert always fails with a permanent error
      mockDbInsert.mockImplementation(() => {
        throw Object.assign(new Error('duplicate key constraint'), {
          constraint: 'some_other_constraint',
        });
      });

      const result = await resolveUserState();

      expect(result.state).toBe(UserState.USER_CREATION_FAILED);
      expect(result.redirectTo).toBe('/error/user-creation-failed');
      expect(result.context.errorCode).toBe('USER_CREATION_FAILED');
      expect(mockCaptureCriticalError).toHaveBeenCalled();
    });

    it('syncs email from Clerk when DB email differs from verified Clerk email', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue(
        mockClerkUser('new-email@example.com')
      );

      const dbResult = mockDbUserResult({ email: 'old-email@example.com' });
      mockDbSelect.mockReturnValue(createJoinSelectChain([dbResult]));

      mockResolveProfileState.mockReturnValue({
        state: UserState.ACTIVE,
        profileId: null,
        redirectTo: null,
      });

      await resolveUserState();

      expect(mockSyncEmailFromClerk).toHaveBeenCalledWith(
        'db-user-123',
        'new-email@example.com'
      );
    });

    it('does not sync email when DB email matches Clerk email', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue(
        mockClerkUser('test@example.com')
      );

      const dbResult = mockDbUserResult({ email: 'test@example.com' });
      mockDbSelect.mockReturnValue(createJoinSelectChain([dbResult]));

      mockResolveProfileState.mockReturnValue({
        state: UserState.ACTIVE,
        profileId: null,
        redirectTo: null,
      });

      await resolveUserState();

      expect(mockSyncEmailFromClerk).not.toHaveBeenCalled();
    });

    it('does not block on email sync failure', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue(mockClerkUser('new@example.com'));

      const dbResult = mockDbUserResult({ email: 'old@example.com' });
      mockDbSelect.mockReturnValue(createJoinSelectChain([dbResult]));

      mockSyncEmailFromClerk.mockRejectedValue(new Error('sync failed'));

      mockResolveProfileState.mockReturnValue({
        state: UserState.ACTIVE,
        profileId: null,
        redirectTo: null,
      });

      // Should not throw despite sync failure
      const result = await resolveUserState();
      expect(result.state).toBe(UserState.ACTIVE);
      expect(mockSentryAddBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'auth-gate',
          message: 'Email sync failed',
          level: 'warning',
        })
      );
    });

    it('preserves isAdmin and isPro context from DB user', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue(mockClerkUser());

      const dbResult = mockDbUserResult({ isAdmin: true, isPro: true });
      mockDbSelect.mockReturnValue(createJoinSelectChain([dbResult]));

      mockResolveProfileState.mockReturnValue({
        state: UserState.ACTIVE,
        profileId: null,
        redirectTo: null,
      });

      const result = await resolveUserState();

      expect(result.context.isAdmin).toBe(true);
      expect(result.context.isPro).toBe(true);
    });

    it('returns NEEDS_WAITLIST_SUBMISSION when waitlist enabled and no entry exists', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue(mockClerkUser());
      mockIsWaitlistEnabled.mockReturnValue(true);

      // No DB user found (triggers handleMissingDbUser)
      mockDbSelect.mockReturnValue(createJoinSelectChain([]));

      // Waitlist check returns no entry
      // The second select call is the waitlist query
      let selectCallCount = 0;
      mockDbSelect.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return createJoinSelectChain([]); // main query: no user
        }
        return createSimpleSelectChain([]); // waitlist query: no entry
      });

      const result = await resolveUserState();

      expect(result.state).toBe(UserState.NEEDS_WAITLIST_SUBMISSION);
      expect(result.redirectTo).toBe('/waitlist');
    });

    it('creates user with waitlist entry when waitlist approved', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue(mockClerkUser());
      mockIsWaitlistEnabled.mockReturnValue(true);

      let selectCallCount = 0;
      mockDbSelect.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return createJoinSelectChain([]); // main query: no user
        }
        if (selectCallCount === 2) {
          // waitlist query: approved entry
          return createSimpleSelectChain([
            { id: 'waitlist-entry-123', status: 'claimed' },
          ]);
        }
        // createUserWithRetry inner select
        return createJoinSelectChain([]);
      });

      mockDbInsert.mockReturnValue(createInsertChain([{ id: 'new-user-id' }]));

      mockResolveProfileState.mockReturnValue({
        state: UserState.NEEDS_ONBOARDING,
        profileId: null,
        redirectTo: '/onboarding?fresh_signup=true',
      });

      const result = await resolveUserState();

      expect(result.dbUserId).toBe('new-user-id');
      expect(result.state).toBe(UserState.NEEDS_ONBOARDING);
    });

    it('throws TypeError when createDbUserIfMissing is true but no email', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue({
        emailAddresses: [],
      });

      // No DB user found
      mockDbSelect.mockReturnValue(createJoinSelectChain([]));

      await expect(resolveUserState()).rejects.toThrow(
        'Email is required for user creation'
      );
      expect(mockCaptureError).toHaveBeenCalled();
    });

    it('passes profile data to resolveProfileState correctly', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue(mockClerkUser());

      const dbResult = mockDbUserResult({
        profileId: 'profile-456',
        profileUsername: 'myuser',
        profileUsernameNormalized: 'myuser',
        profileDisplayName: 'My User',
        profileIsPublic: true,
        profileOnboardingCompletedAt: new Date('2025-01-01'),
        profileIsClaimed: true,
      });
      mockDbSelect.mockReturnValue(createJoinSelectChain([dbResult]));

      mockResolveProfileState.mockReturnValue({
        state: UserState.ACTIVE,
        profileId: 'profile-456',
        redirectTo: null,
      });

      await resolveUserState();

      expect(mockResolveProfileState).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'profile-456',
          username: 'myuser',
          displayName: 'My User',
          isPublic: true,
        })
      );
    });

    it('calls resolveProfileState with null when new user has no profile', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue(mockClerkUser());

      // No DB user found
      let selectCallCount = 0;
      mockDbSelect.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return createJoinSelectChain([]); // main: no user
        }
        return createJoinSelectChain([]); // retry inner: no user
      });

      mockDbInsert.mockReturnValue(createInsertChain([{ id: 'new-user-id' }]));

      mockResolveProfileState.mockReturnValue({
        state: UserState.NEEDS_ONBOARDING,
        profileId: null,
        redirectTo: '/onboarding?fresh_signup=true',
      });

      await resolveUserState();

      expect(mockResolveProfileState).toHaveBeenCalledWith(null);
    });
  });

  // ===========================================================================
  // getWaitlistAccess
  // ===========================================================================
  describe('getWaitlistAccess', () => {
    it('returns null status when no waitlist entry exists', async () => {
      mockDbSelect.mockReturnValue(createSimpleSelectChain([]));

      const result = await getWaitlistAccess('test@example.com');

      expect(result.entryId).toBeNull();
      expect(result.status).toBeNull();
    });

    it('returns entry with "new" status for pending submissions', async () => {
      mockDbSelect.mockReturnValue(
        createSimpleSelectChain([{ id: 'entry-1', status: 'new' }])
      );

      const result = await getWaitlistAccess('test@example.com');

      expect(result.entryId).toBe('entry-1');
      expect(result.status).toBe('new');
    });

    it('returns entry with "claimed" status for approved entries', async () => {
      mockDbSelect.mockReturnValue(
        createSimpleSelectChain([{ id: 'entry-2', status: 'claimed' }])
      );

      const result = await getWaitlistAccess('test@example.com');

      expect(result.entryId).toBe('entry-2');
      expect(result.status).toBe('claimed');
    });

    it('normalizes email before querying', async () => {
      mockDbSelect.mockReturnValue(createSimpleSelectChain([]));

      await getWaitlistAccess('  TEST@EXAMPLE.COM  ');

      expect(mockNormalizeEmail).toHaveBeenCalledWith('  TEST@EXAMPLE.COM  ');
    });
  });

  // ===========================================================================
  // State utility functions
  // ===========================================================================
  describe('canAccessApp', () => {
    it('returns true only for ACTIVE state', () => {
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
    });

    it('returns false for all other states', () => {
      expect(canAccessOnboarding(UserState.UNAUTHENTICATED)).toBe(false);
      expect(canAccessOnboarding(UserState.NEEDS_DB_USER)).toBe(false);
      expect(canAccessOnboarding(UserState.NEEDS_WAITLIST_SUBMISSION)).toBe(
        false
      );
      expect(canAccessOnboarding(UserState.WAITLIST_PENDING)).toBe(false);
      expect(canAccessOnboarding(UserState.BANNED)).toBe(false);
      expect(canAccessOnboarding(UserState.USER_CREATION_FAILED)).toBe(false);
    });
  });

  describe('requiresRedirect', () => {
    it('returns false only for ACTIVE state', () => {
      expect(requiresRedirect(UserState.ACTIVE)).toBe(false);
    });

    it('returns true for all non-ACTIVE states', () => {
      expect(requiresRedirect(UserState.UNAUTHENTICATED)).toBe(true);
      expect(requiresRedirect(UserState.NEEDS_DB_USER)).toBe(true);
      expect(requiresRedirect(UserState.NEEDS_WAITLIST_SUBMISSION)).toBe(true);
      expect(requiresRedirect(UserState.WAITLIST_PENDING)).toBe(true);
      expect(requiresRedirect(UserState.NEEDS_ONBOARDING)).toBe(true);
      expect(requiresRedirect(UserState.BANNED)).toBe(true);
      expect(requiresRedirect(UserState.USER_CREATION_FAILED)).toBe(true);
    });
  });

  // ===========================================================================
  // getRedirectForState
  // ===========================================================================
  describe('getRedirectForState', () => {
    it('returns /signin for UNAUTHENTICATED', () => {
      expect(getRedirectForState(UserState.UNAUTHENTICATED)).toBe('/signin');
    });

    it('returns /onboarding?fresh_signup=true for NEEDS_DB_USER', () => {
      expect(getRedirectForState(UserState.NEEDS_DB_USER)).toBe(
        '/onboarding?fresh_signup=true'
      );
    });

    it('returns /waitlist for NEEDS_WAITLIST_SUBMISSION', () => {
      expect(getRedirectForState(UserState.NEEDS_WAITLIST_SUBMISSION)).toBe(
        '/waitlist'
      );
    });

    it('returns /waitlist for WAITLIST_PENDING', () => {
      expect(getRedirectForState(UserState.WAITLIST_PENDING)).toBe('/waitlist');
    });

    it('returns /onboarding?fresh_signup=true for NEEDS_ONBOARDING', () => {
      expect(getRedirectForState(UserState.NEEDS_ONBOARDING)).toBe(
        '/onboarding?fresh_signup=true'
      );
    });

    it('returns /banned for BANNED', () => {
      expect(getRedirectForState(UserState.BANNED)).toBe('/banned');
    });

    it('returns /error/user-creation-failed for USER_CREATION_FAILED', () => {
      expect(getRedirectForState(UserState.USER_CREATION_FAILED)).toBe(
        '/error/user-creation-failed'
      );
    });

    it('returns null for ACTIVE', () => {
      expect(getRedirectForState(UserState.ACTIVE)).toBeNull();
    });
  });

  // ===========================================================================
  // UserState enum completeness
  // ===========================================================================
  describe('UserState enum', () => {
    it('has all expected states', () => {
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
});
