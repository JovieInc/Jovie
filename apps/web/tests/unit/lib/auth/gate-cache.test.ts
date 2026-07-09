import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCachedAuth,
  mockCachedCurrentUser,
  mockDbSelect,
  mockCheckUserStatus,
  mockIsWaitlistGateEnabled,
  mockCache,
} = vi.hoisted(() => ({
  mockCachedAuth: vi.fn(),
  mockCachedCurrentUser: vi.fn(),
  mockDbSelect: vi.fn(),
  mockCheckUserStatus: vi.fn(),
  mockIsWaitlistGateEnabled: vi.fn().mockResolvedValue(false),
  mockCache: vi.fn(<T extends (...args: never[]) => unknown>(fn: T) => {
    const cacheByKey = new Map<string, ReturnType<T>>();

    return ((...args: never[]) => {
      const key = JSON.stringify(args);
      if (!cacheByKey.has(key)) {
        cacheByKey.set(key, fn(...args) as ReturnType<T>);
      }
      return cacheByKey.get(key)!;
    }) as T;
  }),
}));

vi.mock('server-only', () => ({}));

vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    cache: mockCache,
  };
});

vi.mock('@/lib/auth/cached', () => ({
  getOptionalAuth: mockCachedAuth,
  getCachedCurrentUser: mockCachedCurrentUser,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: {
    id: 'users.id',
    clerkId: 'users.clerkId',
    email: 'users.email',
    userStatus: 'users.userStatus',
    isAdmin: 'users.isAdmin',
    isPro: 'users.isPro',
    deletedAt: 'users.deletedAt',
  },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'creatorProfiles.id',
    username: 'creatorProfiles.username',
    usernameNormalized: 'creatorProfiles.usernameNormalized',
    displayName: 'creatorProfiles.displayName',
    isPublic: 'creatorProfiles.isPublic',
    avatarUrl: 'creatorProfiles.avatarUrl',
    onboardingCompletedAt: 'creatorProfiles.onboardingCompletedAt',
  },
}));

vi.mock('@/lib/db/schema/waitlist', () => ({
  waitlistEntries: {
    id: 'waitlistEntries.id',
    email: 'waitlistEntries.email',
    emailNormalized: 'waitlistEntries.emailNormalized',
    status: 'waitlistEntries.status',
    canonical: 'waitlistEntries.canonical',
    createdAt: 'waitlistEntries.createdAt',
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn().mockResolvedValue(undefined),
  captureCriticalError: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/utils/email', () => ({
  normalizeEmail: vi.fn((email: string) => email.toLowerCase().trim()),
}));

vi.mock('@/lib/auth/clerk-sync', () => ({
  syncEmailFromClerk: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/auth/status-checker', () => ({
  checkUserStatus: mockCheckUserStatus,
}));

vi.mock('@/lib/waitlist/settings', () => ({
  isWaitlistGateEnabled: mockIsWaitlistGateEnabled,
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col, val) => ({ eq: val })),
  sql: vi.fn((strings, ...values) => ({ sql: strings, values })),
  desc: vi.fn(col => ({ desc: col })),
}));

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
}));

vi.mock('@/lib/auth/request-clerk-client', () => ({
  getServerClerkClient: vi.fn().mockResolvedValue(null),
}));

function createJoinSelectChain(result: unknown[]) {
  const mockLimit = vi.fn().mockResolvedValue(result);
  const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
  const mockLeftJoin = vi.fn().mockReturnValue({ where: mockWhere });
  const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin });
  return { from: mockFrom };
}

describe.skip('resolveUserState request cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockCachedAuth.mockResolvedValue({ userId: 'clerk_cached' });
    mockCachedCurrentUser.mockResolvedValue({
      emailAddresses: [
        {
          emailAddress: 'cached@example.com',
          verification: { status: 'verified' },
        },
      ],
    });
    mockCheckUserStatus.mockReturnValue({
      isBlocked: false,
      blockedState: null,
      redirectTo: null,
    });
    mockDbSelect.mockReturnValue(
      createJoinSelectChain([
        {
          id: 'db-user-1',
          email: 'cached@example.com',
          userStatus: 'active',
          isAdmin: false,
          isPro: false,
          deletedAt: null,
          profileId: 'profile-1',
          profileUsername: 'cached',
          profileUsernameNormalized: 'cached',
          profileDisplayName: 'Cached User',
          profileIsPublic: true,
          profileAvatarUrl: null,
          profileOnboardingCompletedAt: new Date(),
        },
      ])
    );
  });

  it('deduplicates repeated resolveUserState calls within one request', async () => {
    const { resolveUserState } = await import('@/lib/auth/gate');

    const [first, second, third] = await Promise.all([
      resolveUserState(),
      resolveUserState(),
      resolveUserState(),
    ]);

    expect(first).toEqual(second);
    expect(second).toEqual(third);
    expect(mockCachedAuth).toHaveBeenCalledTimes(1);
    expect(mockDbSelect).toHaveBeenCalledTimes(1);
    expect(mockIsWaitlistGateEnabled).toHaveBeenCalledTimes(1);
  });

  it('keeps separate cache entries for different option shapes', async () => {
    const { resolveUserState } = await import('@/lib/auth/gate');

    await resolveUserState();
    expect(mockCachedAuth).toHaveBeenCalledTimes(1);
    expect(mockDbSelect).toHaveBeenCalledTimes(1);

    mockCachedAuth.mockClear();

    await resolveUserState({ knownClerkUserId: 'clerk_cached' });

    expect(mockCachedAuth).not.toHaveBeenCalled();
    expect(mockDbSelect).toHaveBeenCalledTimes(2);
  });
});
