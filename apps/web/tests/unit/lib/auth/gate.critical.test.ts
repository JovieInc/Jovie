import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Better Auth critical gate coverage.
 * Replaces the Clerk-era suite: identity comes from auth.api.getSession /
 * getCachedDevTestAuthSession / knownClerkUserId (app users.id UUID).
 */

const {
  mockGetSession,
  mockGetCachedDevTestAuthSession,
  mockDbSelect,
  mockDbInsert,
  mockIsWaitlistGateEnabled,
  mockResolveProfileState,
  mockCheckUserStatus,
  mockNormalizeEmail,
  mockCaptureError,
  mockCaptureCriticalError,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetCachedDevTestAuthSession: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockIsWaitlistGateEnabled: vi.fn().mockResolvedValue(false),
  mockResolveProfileState: vi.fn(),
  mockCheckUserStatus: vi.fn(),
  mockNormalizeEmail: vi.fn((e: string) => e?.toLowerCase().trim() ?? e),
  mockCaptureError: vi.fn().mockResolvedValue(undefined),
  mockCaptureCriticalError: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('server-only', () => ({}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock('@/lib/auth/better-auth', () => ({
  auth: {
    api: {
      getSession: mockGetSession,
    },
  },
}));

vi.mock('@/lib/auth/dev-test-auth.server', () => ({
  getCachedDevTestAuthSession: mockGetCachedDevTestAuthSession,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
    update: vi.fn(),
  },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: {
    id: 'users.id',
    clerkId: 'users.clerkId',
    betterAuthUserId: 'users.betterAuthUserId',
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
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      sql: strings,
      values,
    }),
    { raw: vi.fn() }
  ),
  desc: vi.fn(col => ({ desc: col })),
}));

vi.mock('@sentry/nextjs', () => ({
  getClient: vi.fn(() => undefined),
  addBreadcrumb: vi.fn(),
}));

vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    // Disable request memoization so each call is independent in tests
    cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  };
});

import { CanonicalUserState, resolveUserState } from '@/lib/auth/gate';

function chainLimit(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      leftJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(rows),
        }),
      }),
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(rows),
        }),
      }),
    }),
  };
}

function activeDbUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'db_user_1',
    email: 'artist@example.com',
    userStatus: 'active',
    isAdmin: false,
    isPro: false,
    deletedAt: null,
    waitlistEntryId: null,
    betterAuthUserId: 'ba_user_1',
    profileId: 'profile_1',
    profileUsername: 'artist',
    profileUsernameNormalized: 'artist',
    profileDisplayName: 'Artist Name',
    profileIsPublic: true,
    profileAvatarUrl: null,
    profileOnboardingCompletedAt: new Date('2026-01-01'),
    profileIsClaimed: true,
    ...overrides,
  };
}

describe('@critical gate.ts (Better Auth)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCachedDevTestAuthSession.mockResolvedValue(null);
    mockIsWaitlistGateEnabled.mockResolvedValue(false);
    mockCheckUserStatus.mockReturnValue({
      isBlocked: false,
      blockedState: null,
      redirectTo: null,
    });
  });

  it('returns UNAUTHENTICATED when Better Auth has no session', async () => {
    mockGetSession.mockResolvedValue(null);

    const result = await resolveUserState();

    expect(result.state).toBe(CanonicalUserState.UNAUTHENTICATED);
    expect(result.clerkUserId).toBeNull();
    expect(result.dbUserId).toBeNull();
    expect(result.redirectTo).toBe('/signin');
  });

  it('returns ACTIVE for a fully set up BA user with complete profile', async () => {
    mockGetSession.mockResolvedValue({
      user: { id: 'ba_user_1', email: 'artist@example.com' },
      session: { id: 'sess_1' },
    });
    mockDbSelect.mockReturnValue(chainLimit([activeDbUser()]));

    const result = await resolveUserState();

    expect(result.state).toBe(CanonicalUserState.ACTIVE);
    expect(result.clerkUserId).toBe('ba_user_1');
    expect(result.dbUserId).toBe('db_user_1');
    expect(result.profileId).toBe('profile_1');
  });

  it('returns NEEDS_ONBOARDING when profile is incomplete', async () => {
    mockGetSession.mockResolvedValue({
      user: { id: 'ba_user_1', email: 'artist@example.com' },
      session: { id: 'sess_1' },
    });
    mockDbSelect.mockReturnValue(
      chainLimit([
        activeDbUser({
          profileId: null,
          profileOnboardingCompletedAt: null,
          profileIsClaimed: false,
        }),
      ])
    );
    mockResolveProfileState.mockReturnValue({
      state: CanonicalUserState.NEEDS_ONBOARDING,
      profileId: null,
      redirectTo: '/start',
    });

    const result = await resolveUserState();

    expect(result.state).toBe(CanonicalUserState.NEEDS_ONBOARDING);
    expect(result.redirectTo).toBe('/start');
  });

  it('returns BANNED when status-checker marks the user blocked', async () => {
    mockGetSession.mockResolvedValue({
      user: { id: 'ba_user_1', email: 'banned@example.com' },
      session: { id: 'sess_1' },
    });
    mockDbSelect.mockReturnValue(
      chainLimit([activeDbUser({ userStatus: 'banned' })])
    );
    mockCheckUserStatus.mockReturnValue({
      isBlocked: true,
      blockedState: CanonicalUserState.BANNED,
      redirectTo: '/unavailable',
    });

    const result = await resolveUserState();

    expect(result.state).toBe(CanonicalUserState.BANNED);
    expect(result.redirectTo).toBe('/unavailable');
  });

  it('uses knownClerkUserId as app users.id and skips getSession', async () => {
    mockDbSelect
      // first: resolveAuthIdentity knownAppUserId lookup
      .mockReturnValueOnce(
        chainLimit([
          {
            betterAuthUserId: 'ba_user_1',
            email: 'artist@example.com',
          },
        ])
      )
      // second: loadAuthGateRecord join
      .mockReturnValueOnce(chainLimit([activeDbUser()]));

    const result = await resolveUserState({
      knownClerkUserId: 'db_user_1',
    });

    expect(mockGetSession).not.toHaveBeenCalled();
    expect(result.state).toBe(CanonicalUserState.ACTIVE);
    expect(result.dbUserId).toBe('db_user_1');
  });

  it('prefetches waitlist gate before the auth gate DB query finishes', async () => {
    mockGetSession.mockResolvedValue({
      user: { id: 'ba_parallel', email: 'p@example.com' },
      session: { id: 'sess_p' },
    });

    const callOrder: string[] = [];
    mockIsWaitlistGateEnabled.mockImplementation(async () => {
      callOrder.push('gate');
      return false;
    });

    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(async () => {
              callOrder.push('db');
              return [activeDbUser({ betterAuthUserId: 'ba_parallel' })];
            }),
          }),
        }),
      }),
    });

    await resolveUserState();

    expect(callOrder).toEqual(['gate', 'db']);
  });
});
