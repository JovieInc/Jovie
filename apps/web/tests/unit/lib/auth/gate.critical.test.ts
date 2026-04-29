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
  mockIsWaitlistGateEnabled,
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
  mockIsWaitlistGateEnabled: vi.fn().mockResolvedValue(true),
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

vi.mock('@/lib/waitlist/settings', () => ({
  isWaitlistGateEnabled: mockIsWaitlistGateEnabled,
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col, val) => ({ eq: val })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  sql: vi.fn((strings, ...values) => ({ sql: strings, values })),
}));

vi.mock('@sentry/nextjs', () => ({
  getClient: vi.fn(() => undefined),
  addBreadcrumb: mockSentryAddBreadcrumb,
}));

// =============================================================================
// 3. Import tested module AFTER mocks
// =============================================================================
import {
  CanonicalUserState,
  canAccessApp,
  canAccessOnboarding,
  getRedirectForState,
  getWaitlistAccess,
  requiresRedirect,
  resolveUserState,
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

/** Creates an insert chain whose returning() rejects with the given error. */
function createFailingInsertChain(error: unknown) {
  const mockReturning = vi.fn().mockRejectedValue(error);
  const mockOnConflict = vi.fn().mockReturnValue({ returning: mockReturning });
  const mockValues = vi.fn().mockReturnValue({
    onConflictDoUpdate: mockOnConflict,
    returning: mockReturning,
  });
  return { values: mockValues };
}

/** Creates an update chain: db.update(...).set(...).where(...).returning(...) */
function createUpdateChain(result: unknown[]) {
  const mockReturning = vi.fn().mockResolvedValue(result);
  const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
  return { set: mockSet, where: mockWhere, returning: mockReturning };
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
    mockIsWaitlistGateEnabled.mockResolvedValue(false);
    setupNonBlockedStatus();
    mockResolveProfileState.mockReturnValue({
      state: CanonicalUserState.NEEDS_ONBOARDING,
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

      expect(result.state).toBe(CanonicalUserState.UNAUTHENTICATED);
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
        state: CanonicalUserState.ACTIVE,
        profileId: 'profile-123',
        redirectTo: null,
      });

      const result = await resolveUserState();

      expect(result.state).toBe(CanonicalUserState.ACTIVE);
      expect(result.clerkUserId).toBe('clerk_123');
      expect(result.dbUserId).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(result.profileId).toBe('profile-123');
      expect(result.redirectTo).toBeNull();
    });

    it('returns NEEDS_ONBOARDING when profile is incomplete', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue(mockClerkUser());

      const dbResult = mockDbUserResult({ profileId: null });
      mockDbSelect.mockReturnValue(createJoinSelectChain([dbResult]));

      mockResolveProfileState.mockReturnValue({
        state: CanonicalUserState.NEEDS_ONBOARDING,
        profileId: null,
        redirectTo: '/onboarding?fresh_signup=true',
      });

      const result = await resolveUserState();

      expect(result.state).toBe(CanonicalUserState.NEEDS_ONBOARDING);
      expect(result.redirectTo).toBe('/onboarding?fresh_signup=true');
    });

    it('returns BANNED when user status is banned', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue(mockClerkUser());

      const dbResult = mockDbUserResult({ userStatus: 'banned' });
      mockDbSelect.mockReturnValue(createJoinSelectChain([dbResult]));

      mockCheckUserStatus.mockReturnValue({
        isBlocked: true,
        blockedState: CanonicalUserState.BANNED,
        redirectTo: '/unavailable',
      });

      const result = await resolveUserState();

      expect(result.state).toBe(CanonicalUserState.BANNED);
      expect(result.redirectTo).toBe('/unavailable');
      expect(result.dbUserId).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });

    it('returns BANNED when user is soft-deleted', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue(mockClerkUser());

      const dbResult = mockDbUserResult({ deletedAt: new Date() });
      mockDbSelect.mockReturnValue(createJoinSelectChain([dbResult]));

      mockCheckUserStatus.mockReturnValue({
        isBlocked: true,
        blockedState: CanonicalUserState.BANNED,
        redirectTo: '/unavailable',
      });

      const result = await resolveUserState();

      expect(result.state).toBe(CanonicalUserState.BANNED);
    });

    it('returns NEEDS_DB_USER when createDbUserIfMissing is false and no DB user', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue(mockClerkUser());

      // No DB user found
      mockDbSelect.mockReturnValue(createJoinSelectChain([]));

      const result = await resolveUserState({ createDbUserIfMissing: false });

      expect(result.state).toBe(CanonicalUserState.NEEDS_DB_USER);
      expect(result.dbUserId).toBeNull();
      expect(result.redirectTo).toBe('/onboarding?fresh_signup=true');
    });

    it('routes missing DB users to waitlist intake when no access request exists', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue(mockClerkUser());

      // First call: resolveUserState main query (no user found)
      // Second call: waitlist query (no entry found)
      let selectCallCount = 0;
      mockDbSelect.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // Main query in resolveUserState - no user
          return createJoinSelectChain([]);
        }
        return createSimpleSelectChain([]);
      });

      const result = await resolveUserState();

      expect(result.state).toBe(CanonicalUserState.NEEDS_WAITLIST_SUBMISSION);
      expect(result.dbUserId).toBeNull();
      expect(result.redirectTo).toBe('/waitlist');
      expect(mockDbInsert).not.toHaveBeenCalled();
    });

    it('returns USER_CREATION_FAILED when user creation fails after retries', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue(mockClerkUser());

      let selectCallCount = 0;
      mockDbSelect.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return createJoinSelectChain([]);
        }
        if (selectCallCount === 2) {
          return createSimpleSelectChain([
            { id: 'waitlist-entry-123', status: 'claimed' },
          ]);
        }
        return createJoinSelectChain([]);
      });

      // Insert always fails with a permanent error
      mockDbInsert.mockImplementation(() => {
        throw Object.assign(new Error('duplicate key constraint'), {
          constraint: 'some_other_constraint',
        });
      });

      const result = await resolveUserState();

      expect(result.state).toBe(CanonicalUserState.USER_CREATION_FAILED);
      expect(result.redirectTo).toBe('/error/user-creation-failed');
      expect(result.context.errorCode).toBe('USER_CREATION_FAILED');
      expect(mockCaptureCriticalError).toHaveBeenCalled();
    });

    it('adopts an existing email row when the insert error wraps users_email_unique', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue(
        mockClerkUser('MixedCase+clerk_test@Jov.ie')
      );

      let selectCallCount = 0;
      mockDbSelect.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return createJoinSelectChain([]);
        }
        if (selectCallCount === 2) {
          return createSimpleSelectChain([
            { id: 'waitlist-entry-123', status: 'claimed' },
          ]);
        }
        if (selectCallCount === 3) {
          return createJoinSelectChain([]);
        }
        return createSimpleSelectChain([
          { userStatus: 'waitlist_approved', deletedAt: null },
        ]);
      });

      const wrappedUniqueError = new Error(
        'Failed query: insert into "users"',
        {
          cause: {
            code: '23505',
            constraint: 'users_email_unique',
            detail: 'Key (email)=(MixedCase+clerk_test@Jov.ie) already exists.',
            message:
              'duplicate key value violates unique constraint "users_email_unique"',
          },
        }
      );

      mockDbInsert.mockReturnValue(
        createFailingInsertChain(wrappedUniqueError)
      );
      const updateChain = createUpdateChain([{ id: 'adopted-user-id' }]);
      mockDbUpdate.mockReturnValue(updateChain);

      mockResolveProfileState.mockReturnValue({
        state: CanonicalUserState.NEEDS_ONBOARDING,
        profileId: null,
        redirectTo: '/onboarding?fresh_signup=true',
      });

      const result = await resolveUserState();

      expect(result.dbUserId).toBe('adopted-user-id');
      expect(result.state).toBe(CanonicalUserState.NEEDS_ONBOARDING);
      expect(mockDbUpdate).toHaveBeenCalled();
      expect(updateChain.where).toHaveBeenCalledWith({
        eq: 'MixedCase+clerk_test@Jov.ie',
      });
      expect(mockCaptureCriticalError).not.toHaveBeenCalled();
    });

    it('syncs email from Clerk when DB email differs from verified Clerk email', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue(
        mockClerkUser('new-email@example.com')
      );

      const dbResult = mockDbUserResult({ email: 'old-email@example.com' });
      mockDbSelect.mockReturnValue(createJoinSelectChain([dbResult]));

      mockResolveProfileState.mockReturnValue({
        state: CanonicalUserState.ACTIVE,
        profileId: null,
        redirectTo: null,
      });

      await resolveUserState();

      expect(mockSyncEmailFromClerk).toHaveBeenCalledWith(
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
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
        state: CanonicalUserState.ACTIVE,
        profileId: null,
        redirectTo: null,
      });

      await resolveUserState();

      expect(mockSyncEmailFromClerk).not.toHaveBeenCalled();
    });

    it('does not block on email sync failure', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue(mockClerkUser('new@example.com'));

      const dbResult = mockDbUserResult({
        email: 'old@example.com',
        profileId: 'profile-123',
        profileUsername: 'testuser',
        profileUsernameNormalized: 'testuser',
        profileDisplayName: 'Test User',
        profileIsPublic: true,
        profileOnboardingCompletedAt: new Date(),
        profileIsClaimed: true,
      });
      mockDbSelect.mockReturnValue(createJoinSelectChain([dbResult]));

      mockSyncEmailFromClerk.mockRejectedValue(new Error('sync failed'));

      mockResolveProfileState.mockReturnValue({
        state: CanonicalUserState.ACTIVE,
        profileId: null,
        redirectTo: null,
      });

      // Should not throw despite sync failure
      const result = await resolveUserState();
      expect(result.state).toBe(CanonicalUserState.ACTIVE);
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
        state: CanonicalUserState.ACTIVE,
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
      mockIsWaitlistGateEnabled.mockResolvedValue(true);

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

      expect(result.state).toBe(CanonicalUserState.NEEDS_WAITLIST_SUBMISSION);
      expect(result.redirectTo).toBe('/waitlist');
    });

    it('creates user with waitlist entry when waitlist approved', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue(mockClerkUser());
      mockIsWaitlistGateEnabled.mockResolvedValue(true);

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
        if (selectCallCount === 3) {
          // createUserWithRetry inner select
          return createJoinSelectChain([]);
        }
        return createSimpleSelectChain([
          { userStatus: 'waitlist_approved', deletedAt: null },
        ]);
      });

      mockDbInsert.mockReturnValue(createInsertChain([{ id: 'new-user-id' }]));

      mockResolveProfileState.mockReturnValue({
        state: CanonicalUserState.NEEDS_ONBOARDING,
        profileId: null,
        redirectTo: '/onboarding?fresh_signup=true',
      });

      const result = await resolveUserState();

      expect(result.dbUserId).toBe('new-user-id');
      expect(result.state).toBe(CanonicalUserState.NEEDS_ONBOARDING);
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

    it('uses joined profile data when resolving canonical state', async () => {
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
        state: CanonicalUserState.ACTIVE,
        profileId: 'profile-456',
        redirectTo: null,
      });

      const result = await resolveUserState();

      expect(result.state).toBe(CanonicalUserState.ACTIVE);
      expect(result.profileId).toBe('profile-456');
    });

    it('returns onboarding state when an approved new user has no profile', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
      mockCachedCurrentUser.mockResolvedValue(mockClerkUser());

      // No DB user found
      let selectCallCount = 0;
      mockDbSelect.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return createJoinSelectChain([]); // main: no user
        }
        if (selectCallCount === 2) {
          return createSimpleSelectChain([
            { id: 'waitlist-entry-123', status: 'claimed' },
          ]);
        }
        if (selectCallCount === 3) {
          return createJoinSelectChain([]); // retry inner: no user
        }
        return createSimpleSelectChain([
          { userStatus: 'waitlist_approved', deletedAt: null },
        ]);
      });

      mockDbInsert.mockReturnValue(createInsertChain([{ id: 'new-user-id' }]));

      mockResolveProfileState.mockReturnValue({
        state: CanonicalUserState.NEEDS_ONBOARDING,
        profileId: null,
        redirectTo: '/onboarding?fresh_signup=true',
      });

      const result = await resolveUserState();

      expect(result.state).toBe(CanonicalUserState.NEEDS_ONBOARDING);
      expect(result.profileId).toBeNull();
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
    });

    it('returns false for all other states', () => {
      expect(canAccessOnboarding(CanonicalUserState.UNAUTHENTICATED)).toBe(
        false
      );
      expect(canAccessOnboarding(CanonicalUserState.NEEDS_DB_USER)).toBe(false);
      expect(
        canAccessOnboarding(CanonicalUserState.NEEDS_WAITLIST_SUBMISSION)
      ).toBe(false);
      expect(canAccessOnboarding(CanonicalUserState.WAITLIST_PENDING)).toBe(
        false
      );
      expect(canAccessOnboarding(CanonicalUserState.BANNED)).toBe(false);
      expect(canAccessOnboarding(CanonicalUserState.USER_CREATION_FAILED)).toBe(
        false
      );
    });
  });

  describe('requiresRedirect', () => {
    it('returns false only for ACTIVE state', () => {
      expect(requiresRedirect(CanonicalUserState.ACTIVE)).toBe(false);
    });

    it('returns true for all non-ACTIVE states', () => {
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

  // ===========================================================================
  // getRedirectForState
  // ===========================================================================
  describe('getRedirectForState', () => {
    it('returns /signin for UNAUTHENTICATED', () => {
      expect(getRedirectForState(CanonicalUserState.UNAUTHENTICATED)).toBe(
        '/signin'
      );
    });

    it('returns /onboarding?fresh_signup=true for NEEDS_DB_USER', () => {
      expect(getRedirectForState(CanonicalUserState.NEEDS_DB_USER)).toBe(
        '/onboarding?fresh_signup=true'
      );
    });

    it('returns /waitlist for NEEDS_WAITLIST_SUBMISSION', () => {
      expect(
        getRedirectForState(CanonicalUserState.NEEDS_WAITLIST_SUBMISSION)
      ).toBe('/waitlist');
    });

    it('returns /waitlist for WAITLIST_PENDING', () => {
      expect(getRedirectForState(CanonicalUserState.WAITLIST_PENDING)).toBe(
        '/waitlist'
      );
    });

    it('returns /onboarding?fresh_signup=true for NEEDS_ONBOARDING', () => {
      expect(getRedirectForState(CanonicalUserState.NEEDS_ONBOARDING)).toBe(
        '/onboarding?fresh_signup=true'
      );
    });

    it('returns /unavailable for BANNED', () => {
      expect(getRedirectForState(CanonicalUserState.BANNED)).toBe(
        '/unavailable'
      );
    });

    it('returns /error/user-creation-failed for USER_CREATION_FAILED', () => {
      expect(getRedirectForState(CanonicalUserState.USER_CREATION_FAILED)).toBe(
        '/error/user-creation-failed'
      );
    });

    it('returns null for ACTIVE', () => {
      expect(getRedirectForState(CanonicalUserState.ACTIVE)).toBeNull();
    });
  });

  // ===========================================================================
  // CanonicalUserState enum completeness
  // ===========================================================================
  describe('CanonicalUserState enum', () => {
    it('has all expected states', () => {
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
});
