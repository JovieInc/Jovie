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

vi.mock('next/cache', () => ({
  unstable_noStore: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
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
  db: {},
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
    expect(withDbSessionTxMock).toHaveBeenCalledTimes(1);
  });
});
