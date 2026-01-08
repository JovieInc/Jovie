import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist mocks before module resolution
const { mockAuth, mockCurrentUser, mockDbSelect, mockDbInsert } = vi.hoisted(
  () => ({
    mockAuth: vi.fn(),
    mockCurrentUser: vi.fn(),
    mockDbSelect: vi.fn(),
    mockDbInsert: vi.fn(),
  })
);

// Mock Clerk's auth functions
vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
  currentUser: mockCurrentUser,
}));

// Mock the cached auth module
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockAuth,
  getCachedCurrentUser: mockCurrentUser,
}));

// We need to mock the db module
vi.mock('@/lib/db', () => {
  return {
    db: {
      select: mockDbSelect,
      insert: mockDbInsert,
    },
  };
});

describe('auth gate - UserState and resolveUserState', () => {
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
      expect(UserState.WAITLIST_INVITED).toBe('WAITLIST_INVITED');
      expect(UserState.NEEDS_ONBOARDING).toBe('NEEDS_ONBOARDING');
      expect(UserState.ACTIVE).toBe('ACTIVE');
      expect(UserState.BANNED).toBe('BANNED');
    });
  });

  describe('utility functions', () => {
    it('canAccessApp returns true only for ACTIVE state', async () => {
      const { canAccessApp, UserState } = await import('@/lib/auth/gate');

      expect(canAccessApp(UserState.ACTIVE)).toBe(true);
      expect(canAccessApp(UserState.UNAUTHENTICATED)).toBe(false);
      expect(canAccessApp(UserState.NEEDS_ONBOARDING)).toBe(false);
      expect(canAccessApp(UserState.BANNED)).toBe(false);
    });

    it('canAccessOnboarding returns true for NEEDS_ONBOARDING and ACTIVE', async () => {
      const { canAccessOnboarding, UserState } = await import(
        '@/lib/auth/gate'
      );

      expect(canAccessOnboarding(UserState.ACTIVE)).toBe(true);
      expect(canAccessOnboarding(UserState.NEEDS_ONBOARDING)).toBe(true);
      expect(canAccessOnboarding(UserState.UNAUTHENTICATED)).toBe(false);
      expect(canAccessOnboarding(UserState.WAITLIST_PENDING)).toBe(false);
    });

    it('requiresRedirect returns true for non-ACTIVE states', async () => {
      const { requiresRedirect, UserState } = await import('@/lib/auth/gate');

      expect(requiresRedirect(UserState.ACTIVE)).toBe(false);
      expect(requiresRedirect(UserState.UNAUTHENTICATED)).toBe(true);
      expect(requiresRedirect(UserState.NEEDS_ONBOARDING)).toBe(true);
      expect(requiresRedirect(UserState.BANNED)).toBe(true);
    });

    it('getRedirectForState returns correct paths', async () => {
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
      expect(getRedirectForState(UserState.ACTIVE)).toBeNull();
    });

    it('getRedirectForState handles WAITLIST_INVITED with claim token', async () => {
      const { getRedirectForState, UserState } = await import(
        '@/lib/auth/gate'
      );

      const token = 'abc-123-def';
      expect(getRedirectForState(UserState.WAITLIST_INVITED, token)).toBe(
        `/claim/${encodeURIComponent(token)}`
      );
      expect(getRedirectForState(UserState.WAITLIST_INVITED)).toBe('/waitlist');
    });
  });

  describe('resolveUserState', () => {
    it('returns UNAUTHENTICATED when no Clerk user', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { resolveUserState, UserState } = await import('@/lib/auth/gate');
      const result = await resolveUserState();

      expect(result.state).toBe(UserState.UNAUTHENTICATED);
      expect(result.clerkUserId).toBeNull();
      expect(result.dbUserId).toBeNull();
      expect(result.redirectTo).toBe('/signin');
    });
  });

  describe('AuthGateResult interface', () => {
    it('returns complete result structure for unauthenticated user', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { resolveUserState } = await import('@/lib/auth/gate');
      const result = await resolveUserState();

      // Verify all fields are present
      expect(result).toHaveProperty('state');
      expect(result).toHaveProperty('clerkUserId');
      expect(result).toHaveProperty('dbUserId');
      expect(result).toHaveProperty('profileId');
      expect(result).toHaveProperty('redirectTo');
      expect(result).toHaveProperty('context');

      // Verify context shape
      expect(result.context).toHaveProperty('isAdmin');
      expect(result.context).toHaveProperty('isPro');
      expect(result.context).toHaveProperty('email');
    });
  });

  describe('user state transitions', () => {
    it('documents the expected state flow for new users', async () => {
      const { UserState } = await import('@/lib/auth/gate');

      // Document the expected user journey:
      // 1. UNAUTHENTICATED - User not signed in
      // 2. NEEDS_WAITLIST_SUBMISSION - Signed in but not on waitlist
      // 3. WAITLIST_PENDING - Applied to waitlist, awaiting approval
      // 4. WAITLIST_INVITED - Approved, can claim profile
      // 5. NEEDS_ONBOARDING - Claimed, completing profile setup
      // 6. ACTIVE - Fully onboarded user

      const journey = [
        UserState.UNAUTHENTICATED,
        UserState.NEEDS_WAITLIST_SUBMISSION,
        UserState.WAITLIST_PENDING,
        UserState.WAITLIST_INVITED,
        UserState.NEEDS_ONBOARDING,
        UserState.ACTIVE,
      ];

      // Verify all states are valid enum values
      journey.forEach(state => {
        expect(Object.values(UserState)).toContain(state);
      });
    });

    it('documents banned user state is terminal', async () => {
      const { UserState, canAccessApp, canAccessOnboarding } = await import(
        '@/lib/auth/gate'
      );

      // Banned users cannot access anything
      expect(canAccessApp(UserState.BANNED)).toBe(false);
      expect(canAccessOnboarding(UserState.BANNED)).toBe(false);
    });
  });
});

describe('auth gate - edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns the same user id when concurrent upserts occur', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_123' });
    mockCurrentUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: 'race@jovie.com' }],
    });

    mockDbSelect.mockImplementation((selection: Record<string, unknown>) => {
      const selectionKeys = Object.keys(selection ?? {});
      const isWaitlistSelection =
        selectionKeys.length === 2 &&
        selectionKeys.includes('id') &&
        selectionKeys.includes('status');

      const limitMock = vi
        .fn()
        .mockResolvedValue(
          isWaitlistSelection ? [{ id: 'waitlist_1', status: 'claimed' }] : []
        );

      const baseQuery: Record<string, unknown> = {};

      const whereMock = vi.fn().mockReturnValue({
        limit: limitMock,
      });

      const leftJoinMock = vi.fn().mockReturnValue(baseQuery);

      Object.assign(baseQuery, {
        where: whereMock,
        leftJoin: leftJoinMock,
      });

      return {
        ...baseQuery,
        from: vi.fn().mockReturnValue(baseQuery),
      };
    });

    mockDbInsert.mockImplementation(() => ({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'user_123' }]),
        }),
      }),
    }));

    const { resolveUserState, UserState } = await import('@/lib/auth/gate');

    const [firstResult, secondResult] = await Promise.all([
      resolveUserState(),
      resolveUserState(),
    ]);

    expect(firstResult.dbUserId).toBe('user_123');
    expect(secondResult.dbUserId).toBe('user_123');
    expect(firstResult.state).toBe(UserState.NEEDS_ONBOARDING);
    expect(secondResult.state).toBe(UserState.NEEDS_ONBOARDING);
  });

  it('throws when email is missing during user creation', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_123' });
    mockCurrentUser.mockResolvedValue({
      emailAddresses: [],
    });
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    // Mock db to return no user
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const { resolveUserState } = await import('@/lib/auth/gate');

    await expect(resolveUserState()).rejects.toThrow(
      'Email is required for user creation'
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[Auth Gate] Cannot create user without email',
      { clerkUserId: 'clerk_123' }
    );

    consoleErrorSpy.mockRestore();
  });
});
