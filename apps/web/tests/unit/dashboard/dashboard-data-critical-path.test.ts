/**
 * Critical-path coverage for the shell data split (one-shell chunk 1.2,
 * GitHub #12633).
 *
 * Unlike `dashboard-data-prefetch.test.ts` (which stubs `withDbSessionTx` to
 * return canned data and never exercises the real fetch functions), this
 * file lets `withDbSessionTx` call through to a fake transaction so the real
 * `fetchDashboardBaseWithSession` / `fetchDashboardCoreWithSession` code
 * paths run. That lets us assert, at the query-dispatch level, that:
 *
 * 1. The essential/shell path (`getDashboardShellData`) never issues the
 *    deferred supplementary queries (avatar quality, tipping stats, social
 *    link existence).
 * 2. The full path (`getDashboardData`) still issues all of them, and does
 *    so concurrently (Promise.all), not one full round trip apart.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const userId = 'user_db_1';
const clerkUserId = 'user_123';

const profileRow = {
  id: 'profile_1',
  userId,
  username: 'artist',
  displayName: 'Artist',
  avatarUrl: null,
  spotifyUrl: null,
  appleMusicUrl: null,
  youtubeUrl: null,
  spotifyId: null,
  appleMusicId: null,
  youtubeMusicId: null,
  // null onboardingCompletedAt short-circuits buildBioLinkActivation before
  // it touches the db (getBioLinkActivationWindowEnd returns null), keeping
  // this fixture focused on the three query-emitting supplementary fetches.
  onboardingCompletedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

const userRow = {
  id: userId,
  email: 'artist@example.com',
  activeProfileId: null,
};

const dashboardQueryLabels: string[] = [];
const getAvatarQualityForProfileMock = vi.fn(async () => ({
  status: 'unknown',
  width: null,
  height: null,
}));
const checkAdminRoleMock = vi.fn(async () => false);
const getCurrentUserEntitlementsMock = vi.fn(async () => ({
  userId: clerkUserId,
  email: 'artist@example.com',
  isAuthenticated: true,
  isAdmin: false,
  isPro: false,
  hasAdvancedFeatures: false,
  canRemoveBranding: false,
}));

// Persistent per-fn cache store so the react.cache() and next/cache mocks
// below dedupe the same way the real primitives would within one "request".
const cacheStore = new Map<Function, { promise: Promise<unknown> | null }>();
const unstableCacheStore = new Map<string, unknown>();

function makeTerminalChain(result: unknown) {
  const chain: {
    where: (...args: unknown[]) => typeof chain;
    limit: (...args: unknown[]) => Promise<unknown>;
    orderBy: (...args: unknown[]) => Promise<unknown>;
  } = {
    where: vi.fn(() => chain),
    limit: vi.fn(async () => result),
    orderBy: vi.fn(async () => result),
  };
  return chain;
}

// Fake single-connection transaction. `.select(shape).from(table)` ignores
// the projection shape (drizzle column selectors) and switches on table
// identity, which is stable because the schema modules mocked below are
// distinct singleton objects. Declared before the `vi.mock` calls that
// reference it so the closure captures an already-initialized value (mock
// factories only run lazily, on first import, well after this module has
// finished evaluating — but keeping declaration order top-down avoids any
// TDZ ambiguity).
const fakeTx = {
  select: vi.fn(() => ({
    from: vi.fn((table: { __table?: string }) => {
      switch (table?.__table) {
        case 'users':
          // Both the user-lookup query and the social-link-existence query
          // select FROM users; returning userRow for both is fine since this
          // fixture only asserts *whether* the query fired, not its shape.
          return makeTerminalChain([userRow]);
        case 'creatorProfiles':
          return makeTerminalChain([profileRow]);
        case 'userSettings':
          return makeTerminalChain([]);
        case 'tips':
          return makeTerminalChain([
            { totalReceived: 0, monthReceived: 0, tipsSubmitted: 0 },
          ]);
        case 'clickEvents':
          return makeTerminalChain([{ total: 0, qr: 0, link: 0 }]);
        default:
          return makeTerminalChain([]);
      }
    }),
  })),
};

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    cache: <TArgs extends unknown[], TResult>(
      fn: (...args: TArgs) => Promise<TResult>
    ) => {
      if (!cacheStore.has(fn)) {
        cacheStore.set(fn, { promise: null });
      }
      const entry = cacheStore.get(fn)!;
      return (...args: TArgs) => {
        if (!entry.promise) {
          entry.promise = fn(...args);
        }
        return entry.promise as Promise<TResult>;
      };
    },
  };
});

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

vi.mock('@sentry/nextjs', async importOriginal => {
  const actual = await importOriginal<typeof import('@sentry/nextjs')>();
  return {
    ...actual,
    getClient: vi.fn(() => undefined),
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    addBreadcrumb: vi.fn(),
    logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
    startSpan: vi.fn(async (_options: unknown, callback: () => unknown) =>
      callback()
    ),
  };
});

vi.mock('@/lib/admin/roles', () => ({ isAdmin: checkAdminRoleMock }));

vi.mock('@/lib/auth/gate', () => ({
  resolveUserState: vi.fn(async () => {
    throw new Error('resolveUserState should not be called in this fixture');
  }),
}));

vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: vi.fn(
    async (operation: (tx: unknown, uid: string) => Promise<unknown>) =>
      operation(fakeTx, clerkUserId)
  ),
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: getCurrentUserEntitlementsMock,
}));

vi.mock('@/lib/db', () => ({
  doesTableExist: vi.fn(async () => false),
}));

vi.mock('@/lib/db/queries/avatar-quality', () => ({
  getAvatarQualityForProfile: getAvatarQualityForProfileMock,
}));

vi.mock('@/lib/db/query-timeout', () => ({
  dashboardQuery: vi.fn(async (fn: () => Promise<unknown>, label: string) => {
    dashboardQueryLabels.push(label);
    return fn();
  }),
  isPostgresTimeoutError: vi.fn(() => false),
  isQueryTimeoutError: vi.fn(() => false),
  QUERY_TIMEOUTS: { dashboard: 8000, api: 5000, default: 5000 },
}));

vi.mock('@/lib/db/schema/analytics', () => ({
  clickEvents: { __table: 'clickEvents' },
  tips: { __table: 'tips' },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  userSettings: { __table: 'userSettings' },
  users: { __table: 'users' },
}));

vi.mock('@/lib/db/schema/links', () => ({
  socialLinks: { __table: 'socialLinks' },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorDistributionEvents: { __table: 'creatorDistributionEvents' },
  creatorProfiles: { __table: 'creatorProfiles' },
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
  selectDashboardProfile: vi.fn(
    (profiles: readonly (typeof profileRow)[]) => profiles[0] ?? null
  ),
}));

vi.mock('@/lib/db/sql-helpers', () => ({ sqlAny: vi.fn(() => 'mock-sql') }));

vi.mock('@/lib/migrations/handleMigrationErrors', () => ({
  handleMigrationErrors: vi.fn(() => ({
    shouldRetry: false,
    fallbackData: [],
  })),
}));

vi.mock('@/lib/services/social-links/types', () => ({
  DSP_PLATFORMS: ['spotify', 'apple-music'],
}));

describe('dashboard data critical path (essential vs full query dispatch)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cacheStore.clear();
    unstableCacheStore.clear();
    dashboardQueryLabels.length = 0;
    getCurrentUserEntitlementsMock.mockResolvedValue({
      userId: clerkUserId,
      email: 'artist@example.com',
      isAuthenticated: true,
      isAdmin: false,
      isPro: false,
      hasAdvancedFeatures: false,
      canRemoveBranding: false,
    });
    checkAdminRoleMock.mockResolvedValue(false);
  });

  it('getDashboardShellData never issues the deferred supplementary queries', async () => {
    const { getDashboardShellData } = await import(
      '@/app/app/(shell)/dashboard/actions/dashboard-data'
    );

    const result = await getDashboardShellData(clerkUserId);

    expect(result.selectedProfile?.id).toBe('profile_1');
    expect(getAvatarQualityForProfileMock).not.toHaveBeenCalled();
    expect(dashboardQueryLabels).not.toContain('Tipping stats query');
    expect(dashboardQueryLabels).not.toContain('Click events query');
    expect(dashboardQueryLabels).not.toContain('Social links existence query');
    // Base path is lean: user lookup + creator profiles only (settings is
    // skipped for the shell fast path via includeSettings: false).
    expect(dashboardQueryLabels).toEqual([
      'User lookup query',
      'Creator profiles query',
    ]);
  });

  it('getDashboardData issues all supplementary queries (social links, avatar quality, tipping stats)', async () => {
    const { getDashboardData } = await import(
      '@/app/app/(shell)/dashboard/actions/dashboard-data'
    );

    const result = await getDashboardData();

    expect(result.selectedProfile?.id).toBe('profile_1');
    expect(getAvatarQualityForProfileMock).toHaveBeenCalledWith(
      'profile_1',
      fakeTx
    );
    expect(dashboardQueryLabels).toContain('Social links existence query');
    expect(dashboardQueryLabels).toContain('Tipping stats query');
    expect(dashboardQueryLabels).toContain('Click events query');
    // Base queries still run first (profile resolution is a real
    // dependency); the 4 supplementary fetches after that are fired via
    // Promise.all rather than the previous strictly-sequential awaits.
    expect(dashboardQueryLabels.slice(0, 2)).toEqual([
      'User lookup query',
      'Creator profiles query',
    ]);
  });
});
