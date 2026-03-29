import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  cacheQueryMock: vi.fn(),
  invalidateCacheMock: vi.fn(),
  getUserDashboardAnalyticsMock: vi.fn(),
  getCurrentUserEntitlementsMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  requireAuth: hoisted.requireAuthMock,
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

vi.mock('@sentry/nextjs', () => ({
  captureException: hoisted.captureExceptionMock,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn() },
}));

describe('GET /api/dashboard/analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // cacheQuery should execute the callback by default
    hoisted.cacheQueryMock.mockImplementation(
      async (_key: string, fn: () => Promise<unknown>) => fn()
    );
  });

  it('returns 401 when unauthenticated', async () => {
    hoisted.requireAuthMock.mockRejectedValue(new Error('Unauthorized'));

    const { GET } = await import('@/app/api/dashboard/analytics/route');
    const request = new Request('http://localhost/api/dashboard/analytics');
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it('returns analytics data for authenticated user', async () => {
    hoisted.requireAuthMock.mockResolvedValue('user_123');
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue({
      analyticsRetentionDays: 30,
    });
    const mockAnalytics = {
      profile_views: 150,
      unique_users: 80,
      top_cities: [{ city: 'LA', count: 20 }],
      top_countries: [{ country: 'US', count: 50 }],
      top_referrers: [],
      top_links: [],
    };
    hoisted.getUserDashboardAnalyticsMock.mockResolvedValue(mockAnalytics);

    const { GET } = await import('@/app/api/dashboard/analytics/route');
    const request = new Request(
      'http://localhost/api/dashboard/analytics?range=30d&view=full'
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.profile_views).toBe(150);
    expect(body.top_cities).toHaveLength(1);
  });

  it('returns zeroed stats when profile not found', async () => {
    hoisted.requireAuthMock.mockResolvedValue('user_123');
    // Profile-not-found error comes from the data layer, not auth
    hoisted.cacheQueryMock.mockRejectedValue(
      new Error('Creator profile not found for user')
    );

    const { GET } = await import('@/app/api/dashboard/analytics/route');
    const request = new Request('http://localhost/api/dashboard/analytics');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.profile_views).toBe(0);
    expect(body.top_cities).toEqual([]);
  });

  it('clamps requested range to plan retention limit', async () => {
    hoisted.requireAuthMock.mockResolvedValue('user_123');
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue({
      analyticsRetentionDays: 7,
    });
    hoisted.getUserDashboardAnalyticsMock.mockResolvedValue({
      profile_views: 0,
      unique_users: 0,
    });

    const { GET } = await import('@/app/api/dashboard/analytics/route');
    const request = new Request(
      'http://localhost/api/dashboard/analytics?range=90d'
    );
    await GET(request);

    // The cache key should contain the clamped range (7d), not 90d
    expect(hoisted.cacheQueryMock).toHaveBeenCalledWith(
      expect.stringContaining('7d'),
      expect.any(Function),
      expect.any(Object)
    );
  });

  it('defaults range to 30d when not specified', async () => {
    hoisted.requireAuthMock.mockResolvedValue('user_123');
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue({
      analyticsRetentionDays: 90,
    });
    hoisted.getUserDashboardAnalyticsMock.mockResolvedValue({
      profile_views: 0,
      unique_users: 0,
    });

    const { GET } = await import('@/app/api/dashboard/analytics/route');
    const request = new Request('http://localhost/api/dashboard/analytics');
    await GET(request);

    // The cache key should include 30d as default
    expect(hoisted.cacheQueryMock).toHaveBeenCalledWith(
      expect.stringContaining('30d'),
      expect.any(Function),
      expect.any(Object)
    );
  });

  it('returns 500 on unexpected error', async () => {
    hoisted.requireAuthMock.mockResolvedValue('user_123');
    hoisted.cacheQueryMock.mockRejectedValue(new Error('DB crash'));

    const { GET } = await import('@/app/api/dashboard/analytics/route');
    const request = new Request('http://localhost/api/dashboard/analytics');
    const response = await GET(request);

    expect(response.status).toBe(500);
    expect(hoisted.captureExceptionMock).toHaveBeenCalled();
  });
});
