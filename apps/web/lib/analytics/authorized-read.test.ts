import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  cacheQueryMock: vi.fn(),
  invalidateCacheMock: vi.fn(),
  getUserDashboardAnalyticsMock: vi.fn(),
  getCurrentUserEntitlementsMock: vi.fn(),
}));

vi.mock('@/lib/db/cache', () => ({
  cacheQuery: hoisted.cacheQueryMock,
  invalidateCache: hoisted.invalidateCacheMock,
}));

vi.mock('@/lib/db/queries/analytics', () => ({
  getUserDashboardAnalytics: hoisted.getUserDashboardAnalyticsMock,
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: hoisted.getCurrentUserEntitlementsMock,
}));

import {
  readAuthorizedDashboardAnalytics,
  readAuthorizedProfileViews,
} from './authorized-read';

const WEB_ROOT = resolve(process.cwd());

function source(relativePath: string): string {
  return readFileSync(resolve(WEB_ROOT, relativePath), 'utf8');
}

describe('readAuthorizedDashboardAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.cacheQueryMock.mockImplementation(
      async (_key: string, fn: () => Promise<unknown>) => fn()
    );
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue({
      analyticsRetentionDays: 30,
    });
    hoisted.getUserDashboardAnalyticsMock.mockResolvedValue({
      profile_views: 12,
      top_cities: [{ city: 'Austin', count: 2 }],
    });
  });

  it('rejects a read that has no authenticated user', async () => {
    await expect(
      readAuthorizedDashboardAnalytics({ userId: '' })
    ).rejects.toThrow('Unauthorized');
    expect(hoisted.getUserDashboardAnalyticsMock).not.toHaveBeenCalled();
  });

  it('clamps the requested range to plan retention before querying', async () => {
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue({
      analyticsRetentionDays: 7,
    });

    const read = await readAuthorizedDashboardAnalytics({
      userId: 'user_123',
      range: '90d',
      view: 'full',
    });

    expect(read.range).toBe('7d');
    expect(hoisted.getUserDashboardAnalyticsMock).toHaveBeenCalledWith(
      'user_123',
      '7d',
      'full'
    );
    expect(hoisted.cacheQueryMock).toHaveBeenCalledWith(
      'dashboard-analytics:user_123:full:7d',
      expect.any(Function),
      expect.any(Object)
    );
  });

  it('keeps an unbounded range when retention is unlimited', async () => {
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue({
      analyticsRetentionDays: null,
    });

    const read = await readAuthorizedDashboardAnalytics({
      userId: 'user_123',
      range: 'all',
      view: 'full',
    });

    expect(read.range).toBe('all');
    expect(hoisted.getUserDashboardAnalyticsMock).toHaveBeenCalledWith(
      'user_123',
      'all',
      'full'
    );
  });

  it('falls back to 7 days when the entitlement lookup fails', async () => {
    hoisted.getCurrentUserEntitlementsMock.mockRejectedValue(
      new Error('billing down')
    );

    const read = await readAuthorizedDashboardAnalytics({
      userId: 'user_123',
      range: '90d',
    });

    expect(read.range).toBe('7d');
    expect(read.view).toBe('full');
  });

  it('normalizes missing leaderboards and invalidates on refresh', async () => {
    hoisted.getUserDashboardAnalyticsMock.mockResolvedValue({
      profile_views: 4,
      top_cities: undefined,
      top_countries: null,
      top_referrers: undefined,
      top_links: undefined,
    });

    const read = await readAuthorizedDashboardAnalytics({
      userId: 'user_123',
      range: '30d',
      view: 'traffic',
      forceRefresh: true,
    });

    expect(hoisted.invalidateCacheMock).toHaveBeenCalledWith(
      'dashboard-analytics:user_123:traffic:30d'
    );
    expect(read.analytics).toMatchObject({
      profile_views: 4,
      top_cities: [],
      top_countries: [],
      top_referrers: [],
      top_links: [],
    });
  });

  it('quotes agent profile views from the same default window', async () => {
    hoisted.getUserDashboardAnalyticsMock.mockResolvedValue({
      profile_views: 88,
      top_cities: [],
      top_countries: [],
      top_referrers: [],
      top_links: [],
    });

    await expect(readAuthorizedProfileViews('user_123')).resolves.toBe(88);
    expect(hoisted.getUserDashboardAnalyticsMock).toHaveBeenCalledWith(
      'user_123',
      '30d',
      'traffic'
    );
  });
});

describe('analytics read parity', () => {
  it('sends dashboard, mobile API, and agent through the authorized read', () => {
    const dashboardRoute = source('app/api/dashboard/analytics/route.ts');
    const mobileHighlights = source('lib/mobile/audience-highlights.ts');
    const chatRoute = source('app/api/chat/route.ts');
    const mobileAgent = source('lib/mobile/chat/artist-context.ts');

    expect(dashboardRoute).toContain('readAuthorizedDashboardAnalytics');
    expect(dashboardRoute).not.toContain('getUserDashboardAnalytics');
    expect(mobileHighlights).toContain('readAuthorizedDashboardAnalytics');
    expect(mobileHighlights).not.toContain('getUserDashboardAnalytics');

    const chatFetch = chatRoute.slice(
      chatRoute.indexOf('async function fetchArtistContext('),
      chatRoute.indexOf('function findReleaseByTitle(')
    );
    expect(chatFetch).toContain('readAuthorizedProfileViews');
    expect(chatFetch).not.toContain('creatorProfiles.profileViews');
    expect(mobileAgent).toContain('readAuthorizedProfileViews');
    expect(mobileAgent).not.toContain('creatorProfiles.profileViews');
  });
});
