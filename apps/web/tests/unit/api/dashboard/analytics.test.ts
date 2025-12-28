import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockWithDbSession = vi.hoisted(() => vi.fn());
const mockGetUserDashboardAnalytics = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/session', () => ({
  withDbSession: mockWithDbSession,
}));

vi.mock('@/lib/db/queries/analytics', () => ({
  getUserDashboardAnalytics: mockGetUserDashboardAnalytics,
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

describe('GET /api/dashboard/analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns 401 when not authenticated', async () => {
    mockWithDbSession.mockImplementation(async () => {
      throw new Error('Unauthorized');
    });

    const { GET } = await import('@/app/api/dashboard/analytics/route');
    const request = new Request('http://localhost/api/dashboard/analytics');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('returns analytics data for authenticated user', async () => {
    mockWithDbSession.mockImplementation(async callback => {
      return callback('user_123');
    });
    mockGetUserDashboardAnalytics.mockResolvedValue({
      profile_views: 1000,
      unique_users: 500,
      top_cities: [],
      top_countries: [],
      top_referrers: [],
    });

    const { GET } = await import('@/app/api/dashboard/analytics/route');
    const request = new Request('http://localhost/api/dashboard/analytics');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.profile_views).toBeDefined();
  });
});
