import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  userId: '11111111-1111-4111-8111-111111111111',
  profileId: 'profile-A',
  scopeReads: 0,
  cookieReads: 0,
  entitlementRead: vi.fn(),
  dashboardRead: vi.fn(),
  crawlerRead: vi.fn(),
}));

vi.mock('@/lib/redis', () => ({ getRedis: () => null }));
vi.mock('@/lib/error-tracking', () => ({ captureWarning: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ addBreadcrumb: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({
  getSessionContext: async () => {
    state.scopeReads++;
    if (!state.profileId) throw new Error('Profile not found');
    return {
      user: { id: state.userId },
      profile: { id: state.profileId, userId: state.userId },
    };
  },
}));
vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: () => state.entitlementRead(),
}));
vi.mock('@/lib/db/queries/analytics', () => ({
  getDashboardAnalyticsForProfile: (...args: unknown[]) =>
    state.dashboardRead(...args),
  // Exact baseline re-resolves the mutable active profile on a miss.
  getUserDashboardAnalytics: (...args: unknown[]) =>
    state.dashboardRead(
      { userId: args[0], profileId: state.profileId },
      ...args.slice(1)
    ),
}));
vi.mock('@/lib/db/queries/ai-crawler-analytics', () => ({
  getAiCrawlerAnalyticsForProfile: (...args: unknown[]) =>
    state.crawlerRead(...args),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(settle => {
    resolve = settle;
  });
  return { promise, resolve };
}

function views(scope: { userId: string; profileId: string }) {
  return scope.userId === '22222222-2222-4222-8222-222222222222'
    ? 303
    : scope.profileId === 'profile-A'
      ? 101
      : 202;
}

beforeEach(() => {
  vi.resetModules();
  state.userId = '11111111-1111-4111-8111-111111111111';
  state.profileId = 'profile-A';
  state.scopeReads = 0;
  state.cookieReads = 0;
  state.entitlementRead.mockReset().mockResolvedValue({
    analyticsRetentionDays: null,
    canAccessAdvancedAnalytics: true,
  });
  state.dashboardRead.mockReset().mockImplementation(async scope => ({
    profile_views: views(scope),
    unique_views: 0,
    unique_users: 0,
    tip_link_visits: 0,
  }));
  state.crawlerRead.mockReset().mockImplementation(async scope => ({
    totalRequests: views(scope),
    weeklyRequests: 0,
    crawlers: [],
    dailyTrend: [],
    syncedAt: null,
    isPro: true,
    isTeaser: false,
  }));
});

describe('dashboard profile binding with actual authorized reader and cache', () => {
  it('keeps warm A and B entries separate for the same user', async () => {
    const { readAuthorizedDashboardAnalytics: read } = await import(
      '@/lib/analytics/authorized-read'
    );
    expect((await read({ userId: state.userId })).analytics.profile_views).toBe(
      101
    );
    state.profileId = 'profile-B';
    expect((await read({ userId: state.userId })).analytics.profile_views).toBe(
      202
    );
    state.profileId = 'profile-A';
    expect((await read({ userId: state.userId })).analytics.profile_views).toBe(
      101
    );
    expect(state.dashboardRead).toHaveBeenCalledTimes(2);
    expect(state.scopeReads).toBe(3);
  });

  it('does not reuse another account entry with the same modeled profile id', async () => {
    const { readAuthorizedDashboardAnalytics: read } = await import(
      '@/lib/analytics/authorized-read'
    );
    expect(
      (await read({ userId: '11111111-1111-4111-8111-111111111111' })).analytics
        .profile_views
    ).toBe(101);
    state.userId = '22222222-2222-4222-8222-222222222222';
    expect(
      (await read({ userId: '22222222-2222-4222-8222-222222222222' })).analytics
        .profile_views
    ).toBe(303);
    expect(state.dashboardRead).toHaveBeenCalledTimes(2);
  });

  it('checks the trusted user context before using an already-warm private entry', async () => {
    const { readAuthorizedDashboardAnalytics: read } = await import(
      '@/lib/analytics/authorized-read'
    );
    await read({ userId: '11111111-1111-4111-8111-111111111111' });
    state.userId = '22222222-2222-4222-8222-222222222222';
    await expect(
      read({ userId: '11111111-1111-4111-8111-111111111111' })
    ).rejects.toThrow('Unauthorized');
    expect(state.dashboardRead).toHaveBeenCalledTimes(1);
  });

  it('pins the origin profile before entitlement/cache waits during A to B switch', async () => {
    const gate = deferred<{ analyticsRetentionDays: null }>();
    state.entitlementRead.mockReturnValueOnce(gate.promise);
    const { readAuthorizedDashboardAnalytics: read } = await import(
      '@/lib/analytics/authorized-read'
    );
    const oldRead = read({ userId: '11111111-1111-4111-8111-111111111111' });
    await vi.waitFor(() =>
      expect(state.entitlementRead).toHaveBeenCalledTimes(1)
    );
    state.profileId = 'profile-B';
    const newRead = read({
      userId: '11111111-1111-4111-8111-111111111111',
    });
    // Entitlements belong to the same user, so coalescing legitimately shares
    // this pending read across profiles. Release it before awaiting either.
    gate.resolve({ analyticsRetentionDays: null });
    expect((await oldRead).analytics.profile_views).toBe(101);
    expect((await newRead).analytics.profile_views).toBe(202);
    expect(
      (await read({ userId: '11111111-1111-4111-8111-111111111111' })).analytics
        .profile_views
    ).toBe(202);
    state.profileId = 'profile-A';
    expect(
      (await read({ userId: '11111111-1111-4111-8111-111111111111' })).analytics
        .profile_views
    ).toBe(101);
    expect(state.dashboardRead).toHaveBeenCalledTimes(2);
  });

  it('refreshes only the authorized profile entry', async () => {
    const { readAuthorizedDashboardAnalytics: read } = await import(
      '@/lib/analytics/authorized-read'
    );
    await read({ userId: '11111111-1111-4111-8111-111111111111' });
    state.profileId = 'profile-B';
    await read({ userId: '11111111-1111-4111-8111-111111111111' });
    await read({
      userId: '11111111-1111-4111-8111-111111111111',
      forceRefresh: true,
    });
    state.profileId = 'profile-A';
    expect(
      (await read({ userId: '11111111-1111-4111-8111-111111111111' })).analytics
        .profile_views
    ).toBe(101);
    expect(state.dashboardRead).toHaveBeenCalledTimes(3);
  });

  it('fails closed when the current user has no active profile', async () => {
    const { readAuthorizedDashboardAnalytics: read } = await import(
      '@/lib/analytics/authorized-read'
    );
    await read({ userId: state.userId });
    state.profileId = '';
    await expect(
      read({ userId: '11111111-1111-4111-8111-111111111111' })
    ).rejects.toThrow('Profile not found');
    expect(state.dashboardRead).toHaveBeenCalledTimes(1);
  });
});

describe('AI crawler sibling uses the same authorized boundary', () => {
  it('isolates warm profile and account results', async () => {
    const { readAuthorizedAiCrawlerAnalytics: read } = await import(
      '@/lib/analytics/authorized-ai-crawler-read'
    );
    expect(
      (await read('11111111-1111-4111-8111-111111111111')).totalRequests
    ).toBe(101);
    state.profileId = 'profile-B';
    expect(
      (await read('11111111-1111-4111-8111-111111111111')).totalRequests
    ).toBe(202);
    state.userId = '22222222-2222-4222-8222-222222222222';
    expect(
      (await read('22222222-2222-4222-8222-222222222222')).totalRequests
    ).toBe(303);
    state.userId = '11111111-1111-4111-8111-111111111111';
    state.profileId = 'profile-A';
    expect(
      (await read('11111111-1111-4111-8111-111111111111')).totalRequests
    ).toBe(101);
    expect(state.crawlerRead).toHaveBeenCalledTimes(3);
  });

  it('keeps a late A response out of B after an origin request overlaps the switch', async () => {
    const gate = deferred<unknown>();
    state.crawlerRead.mockImplementationOnce(async scope => {
      await gate.promise;
      return { totalRequests: views(scope) };
    });
    const { readAuthorizedAiCrawlerAnalytics: read } = await import(
      '@/lib/analytics/authorized-ai-crawler-read'
    );
    const oldRead = read('11111111-1111-4111-8111-111111111111');
    await vi.waitFor(() => expect(state.crawlerRead).toHaveBeenCalledTimes(1));
    state.profileId = 'profile-B';
    expect(
      (await read('11111111-1111-4111-8111-111111111111')).totalRequests
    ).toBe(202);
    gate.resolve(undefined);
    expect((await oldRead).totalRequests).toBe(101);
    expect(
      (await read('11111111-1111-4111-8111-111111111111')).totalRequests
    ).toBe(202);
    expect(state.crawlerRead).toHaveBeenCalledTimes(2);
  });

  it('rejects an inconsistent trusted user context on a warm cache', async () => {
    const { readAuthorizedAiCrawlerAnalytics: read } = await import(
      '@/lib/analytics/authorized-ai-crawler-read'
    );
    await read('11111111-1111-4111-8111-111111111111');
    state.userId = '22222222-2222-4222-8222-222222222222';
    await expect(read('11111111-1111-4111-8111-111111111111')).rejects.toThrow(
      'Unauthorized'
    );
    expect(state.crawlerRead).toHaveBeenCalledTimes(1);
  });
});

it('only resolver-issued immutable scopes pass the loader boundary', async () => {
  const {
    resolveAuthorizedAnalyticsProfile,
    assertAuthorizedAnalyticsProfile,
  } = await import('@/lib/analytics/authorized-profile');
  const scope = await resolveAuthorizedAnalyticsProfile(
    '11111111-1111-4111-8111-111111111111'
  );
  expect(Object.isFrozen(scope)).toBe(true);
  expect(() => assertAuthorizedAnalyticsProfile(scope)).not.toThrow();
  expect(() =>
    assertAuthorizedAnalyticsProfile({
      userId: '11111111-1111-4111-8111-111111111111',
      profileId: 'profile-B',
    } as typeof scope)
  ).toThrow('Unauthorized');
});
