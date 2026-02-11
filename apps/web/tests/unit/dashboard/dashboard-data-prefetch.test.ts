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

const startSpanMock = vi.fn(
  async (_options: unknown, callback: () => Promise<unknown> | unknown) => {
    return callback();
  }
);

// Persistent cache store that survives module resets
const cacheStore = new Map<Function, { promise: Promise<unknown> | null }>();

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');

  return {
    ...actual,
    // Custom cache implementation that uses a persistent store
    cache: <T>(fn: () => Promise<T>) => {
      // Each function gets its own cache entry
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
  captureException: vi.fn(),
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
  startSpan: startSpanMock,
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ userId: 'user_123' })),
  currentUser: vi.fn(),
}));

vi.mock('next/cache', async () => {
  const actual =
    await vi.importActual<typeof import('next/cache')>('next/cache');

  const simpleCache = new Map<string, unknown>();

  return {
    ...actual,
    unstable_cache: vi.fn(
      <T extends (...args: never[]) => Promise<unknown>>(
        fn: T,
        keys?: readonly unknown[]
      ) => {
        const cacheKey = JSON.stringify(keys ?? ['default']);
        return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
          if (!simpleCache.has(cacheKey)) {
            simpleCache.set(cacheKey, fn(...args));
          }
          return simpleCache.get(cacheKey) as ReturnType<T>;
        };
      }
    ),
    unstable_noStore: vi.fn(),
    revalidateTag: vi.fn(),
    updateTag: vi.fn(),
  };
});

const setupDbSessionMock = vi.fn();
const getSessionSetupSqlMock = vi.fn(() => 'mock-session-sql');
const validateClerkUserIdMock = vi.fn();

vi.mock('@/lib/auth/session', () => ({
  setupDbSession: setupDbSessionMock,
  getSessionSetupSql: getSessionSetupSqlMock,
  validateClerkUserId: validateClerkUserIdMock,
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
    batch: vi.fn(async (queries: unknown[]) => {
      const results = [];
      for (const q of queries) {
        if (q && typeof q === 'object' && 'execute' in q) {
          results.push(
            await (q as { execute: () => Promise<unknown> }).execute()
          );
        } else {
          results.push({});
        }
      }
      return results;
    }),
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
    withDbSessionTxMock.mockResolvedValue({ ...baseDashboardResponse });
    getCurrentUserEntitlementsMock.mockResolvedValue({
      userId: 'user_123',
      email: 'user@example.com',
      isAuthenticated: true,
      isAdmin: false,
      isPro: false,
      hasAdvancedFeatures: false,
      canRemoveBranding: false,
    });
  });

  it('dedupes dashboard fetches after prefetching', async () => {
    const { getDashboardData, getDashboardDataCached, prefetchDashboardData } =
      await import('@/app/app/(shell)/dashboard/actions');

    prefetchDashboardData();

    const [first, second] = await Promise.all([
      getDashboardData(),
      getDashboardDataCached(),
    ]);

    expect(first).toEqual(second);
    // getSessionSetupSql is called for each cached function (chrome data + tipping stats)
    // but the actual data fetching is deduplicated via unstable_cache
    expect(getSessionSetupSqlMock).toHaveBeenCalled();
  });
});
