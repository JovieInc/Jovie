import { beforeEach, describe, expect, it, vi } from 'vitest';

const baseDashboardResponse = {
  user: { id: 'user_db_1' },
  creatorProfiles: [],
  selectedProfile: null,
  needsOnboarding: false,
  sidebarCollapsed: false,
  hasSocialLinks: true,
  hasMusicLinks: true,
  tippingStats: {
    tipClicks: 1,
    qrTipClicks: 0,
    linkTipClicks: 1,
    tipsSubmitted: 1,
    totalReceivedCents: 100,
    monthReceivedCents: 100,
  },
};

const withDbSessionTxMock = vi.fn(async () => ({
  ...baseDashboardResponse,
}));

const getCurrentUserEntitlementsMock = vi.fn(async () => ({
  userId: 'user_123',
  email: 'user@example.com',
  isAuthenticated: true,
  isAdmin: false,
  isPro: false,
  hasAdvancedFeatures: false,
  canRemoveBranding: false,
}));
const checkAdminRoleMock = vi.fn(async () => false);
const resolveUserStateMock = vi.fn();

const startSpanMock = vi.fn(
  async (_options: unknown, callback: () => Promise<unknown> | unknown) => {
    return callback();
  }
);

// Persistent cache store that survives module resets
const cacheStore = new Map<Function, { promise: Promise<unknown> | null }>();
const unstableCacheStore = new Map<string, unknown>();

// Override global setup's react mock with one that has a persistent cache store
// for testing deduplication behavior across prefetch calls.
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');

  return {
    ...actual,
    cache: <T>(fn: () => Promise<T>) => {
      if (!cacheStore.has(fn)) {
        cacheStore.set(fn, { promise: null });
      }
      const entry = cacheStore.get(fn)!;
      return () => {
        if (!entry.promise) {
          entry.promise = fn();
        }
        return entry.promise as Promise<T>;
      };
    },
  };
});

vi.mock('@sentry/nextjs', () => ({
  getClient: vi.fn(() => undefined),
  captureException: vi.fn(),
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
  startSpan: startSpanMock,
}));

vi.mock('@/lib/admin/roles', () => ({
  isAdmin: checkAdminRoleMock,
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ userId: 'user_123' })),
  currentUser: vi.fn(),
}));

vi.mock('@/lib/auth/gate', () => ({
  resolveUserState: resolveUserStateMock,
}));

vi.mock('next/cache', async () => {
  const actual =
    await vi.importActual<typeof import('next/cache')>('next/cache');

  return {
    ...actual,
    unstable_cache: vi.fn(
      <T extends (...args: never[]) => Promise<unknown>>(
        fn: T,
        keys?: readonly unknown[]
      ) => {
        const cacheKey = JSON.stringify(keys ?? ['default']);
        return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
          if (!unstableCacheStore.has(cacheKey)) {
            unstableCacheStore.set(cacheKey, fn(...args));
          }
          return unstableCacheStore.get(cacheKey) as ReturnType<T>;
        };
      }
    ),
    unstable_noStore: vi.fn(),
    revalidateTag: vi.fn(),
    updateTag: vi.fn(),
  };
});

vi.mock('@/lib/auth/session', () => ({
  setupDbSession: vi.fn(),
  validateClerkUserId: vi.fn(),
  withDbSessionTx: withDbSessionTxMock,
  withDbSession: vi.fn(async handler => handler('user_123')),
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: getCurrentUserEntitlementsMock,
}));

vi.mock('@/lib/cache/profile', () => ({
  invalidateProfileCache: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            execute: vi.fn().mockResolvedValue([{ id: 'user_db_1' }]),
          }),
          orderBy: vi.fn().mockReturnValue({
            execute: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    }),
    execute: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('@/lib/db/query-timeout', () => ({
  dashboardQuery: vi.fn(async fn => fn()),
}));

vi.mock('@/lib/db/schema/analytics', () => ({
  clickEvents: {
    creatorProfileId: 'creatorProfileId',
    linkType: 'linkType',
    metadata: 'metadata',
  },
  tips: {
    creatorProfileId: 'creatorProfileId',
    amountCents: 'amountCents',
    id: 'id',
    createdAt: 'createdAt',
  },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  userSettings: { userId: 'userId', sidebarCollapsed: 'sidebarCollapsed' },
  users: { id: 'id', clerkId: 'clerkId' },
}));

vi.mock('@/lib/db/schema/links', () => ({
  socialLinks: {
    creatorProfileId: 'creatorProfileId',
    state: 'state',
    platformType: 'platformType',
    platform: 'platform',
  },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: { userId: 'userId', id: 'id', createdAt: 'createdAt' },
}));

vi.mock('@/lib/db/server', () => ({
  createEmptyTippingStats: vi.fn(() => ({
    tipClicks: 0,
    qrTipClicks: 0,
    linkTipClicks: 0,
    tipsSubmitted: 0,
    totalReceivedCents: 0,
    monthReceivedCents: 0,
  })),
  profileIsPublishable: vi.fn(() => true),
  selectDashboardProfile: vi.fn(profiles => profiles[0] ?? null),
}));

vi.mock('@/lib/db/sql-helpers', () => ({
  sqlAny: vi.fn(() => 'mock-sql'),
}));

vi.mock('@/lib/migrations/handleMigrationErrors', () => ({
  handleMigrationErrors: vi.fn(() => ({
    shouldRetry: false,
    fallbackData: [],
  })),
}));

vi.mock('@/lib/services/social-links/types', () => ({
  DSP_PLATFORMS: ['spotify', 'apple-music'],
}));

describe('dashboard data prefetch', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    // Clear the persistent cache store
    cacheStore.clear();
    unstableCacheStore.clear();
    withDbSessionTxMock.mockResolvedValue({ ...baseDashboardResponse });
    checkAdminRoleMock.mockResolvedValue(false);
    getCurrentUserEntitlementsMock.mockResolvedValue({
      userId: 'user_123',
      email: 'user@example.com',
      isAuthenticated: true,
      isAdmin: false,
      isPro: false,
      hasAdvancedFeatures: false,
      canRemoveBranding: false,
    });
    resolveUserStateMock.mockResolvedValue({
      state: 'ACTIVE',
      clerkUserId: 'user_123',
      dbUserId: 'user_db_1',
      profileId: 'profile_1',
      redirectTo: null,
      context: {
        isAdmin: false,
        isPro: false,
        email: 'user@example.com',
      },
    });
  });

  it('dedupes dashboard fetches after prefetching', async () => {
    const { getDashboardData, getDashboardDataCached, prefetchDashboardData } =
      await import('@/app/app/(shell)/dashboard/actions/dashboard-data');

    prefetchDashboardData();

    const [first, second] = await Promise.all([
      getDashboardData(),
      getDashboardDataCached(),
    ]);

    expect(first).toEqual(second);
    expect(withDbSessionTxMock).toHaveBeenCalled();
  });

  it('retries shell user lookup after auth reconciliation when the clerk row is missing', async () => {
    withDbSessionTxMock.mockImplementation(async handler => {
      const profile = {
        id: 'profile_1',
        userId: 'user_db_1',
        username: 'tim',
        usernameNormalized: 'tim',
        displayName: 'Tim White',
        isPublic: true,
        onboardingCompletedAt: new Date('2026-03-31T00:00:00.000Z'),
        createdAt: new Date('2026-03-31T00:00:00.000Z'),
        updatedAt: new Date('2026-03-31T00:00:00.000Z'),
      };

      const tx = {
        select: vi
          .fn()
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          })
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([
                  {
                    id: 'user_db_1',
                    email: 'user@example.com',
                    activeProfileId: 'profile_1',
                  },
                ]),
              }),
            }),
          })
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue([profile]),
              }),
            }),
          }),
      };

      return handler(tx, 'user_123');
    });

    const { getDashboardShellData } = await import(
      '@/app/app/(shell)/dashboard/actions/dashboard-data'
    );

    const result = await getDashboardShellData('user_123');

    expect(resolveUserStateMock).toHaveBeenCalledWith({
      createDbUserIfMissing: true,
    });
    expect(result.user?.id).toBe('user_db_1');
    expect(result.selectedProfile?.id).toBe('profile_1');
    expect(result.needsOnboarding).toBe(false);
  });

  it('refreshes shell data when the cached snapshot has no selected profile', async () => {
    const recoveredProfile = {
      id: 'profile_1',
      username: 'tim',
      displayName: 'Tim White',
      isPublic: true,
      onboardingCompletedAt: new Date('2026-03-31T00:00:00.000Z'),
      createdAt: new Date('2026-03-31T00:00:00.000Z'),
      updatedAt: new Date('2026-03-31T00:00:00.000Z'),
    };

    withDbSessionTxMock
      .mockResolvedValueOnce({
        ...baseDashboardResponse,
        creatorProfiles: [],
        selectedProfile: null,
        needsOnboarding: true,
      })
      .mockResolvedValueOnce({
        ...baseDashboardResponse,
        creatorProfiles: [recoveredProfile],
        selectedProfile: recoveredProfile,
        needsOnboarding: false,
      });

    const { getDashboardShellData } = await import(
      '@/app/app/(shell)/dashboard/actions/dashboard-data'
    );

    const result = await getDashboardShellData('user_123');

    expect(withDbSessionTxMock).toHaveBeenCalledTimes(2);
    expect(result.selectedProfile?.id).toBe('profile_1');
    expect(result.needsOnboarding).toBe(false);
  });
});

// Separate describe block for pure utility tests — no module reset needed,
// no mocks required (social-link-utils has zero imports).
describe('social-link-utils', () => {
  it('maps postgres bool-like existence values correctly', async () => {
    const { mapSocialLinkExistence } = await import(
      '@/app/app/(shell)/dashboard/actions/social-link-utils'
    );

    expect(
      mapSocialLinkExistence({ hasLinks: 't', hasMusicLinks: '1' })
    ).toEqual({ hasLinks: true, hasMusicLinks: true });

    expect(mapSocialLinkExistence({ hasLinks: 'f', hasMusicLinks: 0 })).toEqual(
      { hasLinks: false, hasMusicLinks: false }
    );
  });
});
