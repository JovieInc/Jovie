import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  getCurrentUserEntitlementsMock: vi.fn(),
  getAiCrawlerAnalyticsForUserMock: vi.fn(),
  cacheQueryMock: vi.fn(
    async (_key: string, fn: () => Promise<unknown>) => await fn()
  ),
}));

vi.mock('@/lib/auth/session', () => ({
  requireAuth: hoisted.requireAuthMock,
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: hoisted.getCurrentUserEntitlementsMock,
}));

vi.mock('@/lib/db/queries/ai-crawler-analytics', () => ({
  getAiCrawlerAnalyticsForUser: hoisted.getAiCrawlerAnalyticsForUserMock,
}));

vi.mock('@/lib/db/cache', () => ({
  cacheQuery: hoisted.cacheQueryMock,
}));

describe('GET /api/dashboard/ai-crawlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.requireAuthMock.mockResolvedValue('user_123');
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue({
      canAccessAdvancedAnalytics: true,
    });
    hoisted.getAiCrawlerAnalyticsForUserMock.mockResolvedValue({
      totalRequests: 10,
      weeklyRequests: 3,
      crawlers: [],
      dailyTrend: [],
      syncedAt: null,
      isPro: true,
      isTeaser: false,
    });
  });

  it('returns pro analytics payload for entitled users', async () => {
    const { GET } = await import('@/app/api/dashboard/ai-crawlers/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.isPro).toBe(true);
    expect(hoisted.getAiCrawlerAnalyticsForUserMock).toHaveBeenCalledWith(
      'user_123',
      { isPro: true }
    );
  });

  it('returns teaser payload for free users', async () => {
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue({
      canAccessAdvancedAnalytics: false,
    });
    hoisted.getAiCrawlerAnalyticsForUserMock.mockResolvedValue({
      totalRequests: 8,
      weeklyRequests: 2,
      crawlers: [
        {
          id: 'teaser-1',
          name: 'AI Crawler',
          requests: 0,
          previousPeriodRequests: 0,
        },
      ],
      dailyTrend: [],
      syncedAt: null,
      isPro: false,
      isTeaser: true,
    });

    const { GET } = await import('@/app/api/dashboard/ai-crawlers/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.isTeaser).toBe(true);
    expect(hoisted.getAiCrawlerAnalyticsForUserMock).toHaveBeenCalledWith(
      'user_123',
      { isPro: false }
    );
  });
});
