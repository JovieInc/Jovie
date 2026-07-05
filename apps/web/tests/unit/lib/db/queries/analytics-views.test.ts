import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getSessionContextMock: vi.fn(),
  setupDbSessionMock: vi.fn(),
  doesTableExistMock: vi.fn(),
  cacheQueryMock: vi.fn(),
  dashboardQueryMock: vi.fn(),
  dbExecuteMock: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  getSessionContext: hoisted.getSessionContextMock,
  setupDbSession: hoisted.setupDbSessionMock,
}));

vi.mock('@/lib/db', () => ({
  db: { execute: hoisted.dbExecuteMock },
  doesTableExist: hoisted.doesTableExistMock,
  TABLE_NAMES: { dailyProfileViews: 'daily_profile_views' },
}));

vi.mock('@/lib/db/cache', () => ({
  cacheQuery: hoisted.cacheQueryMock,
}));

vi.mock('@/lib/db/query-timeout', () => ({
  dashboardQuery: hoisted.dashboardQueryMock,
}));

vi.mock('@/lib/db/schema/analytics', () => ({
  audienceMembers: {
    creatorProfileId: 'creator_profile_id',
    lastSeenAt: 'last_seen_at',
    tags: 'tags',
    geoCity: 'geo_city',
    geoCountry: 'geo_country',
    referrerHistory: 'referrer_history',
    updatedAt: 'updated_at',
    email: 'email',
  },
  clickEvents: {
    creatorProfileId: 'creator_profile_id',
    isBot: 'is_bot',
  },
  dailyProfileViews: {
    creatorProfileId: 'creator_profile_id',
    viewDate: 'view_date',
    viewCount: 'view_count',
  },
  notificationSubscriptions: {
    creatorProfileId: 'creator_profile_id',
    createdAt: 'created_at',
  },
}));

vi.mock('@/lib/db/sql-helpers', () => ({
  sqlTimestamp: (value: Date) => value,
}));

describe('getUserDashboardAnalytics view metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getSessionContextMock.mockResolvedValue({
      profile: { id: 'profile-123' },
    });
    hoisted.setupDbSessionMock.mockResolvedValue(undefined);
    hoisted.doesTableExistMock.mockResolvedValue(true);
    hoisted.cacheQueryMock.mockImplementation(
      async (_key: string, fn: () => Promise<unknown>) => fn()
    );
    hoisted.dashboardQueryMock.mockImplementation(
      async (fn: () => Promise<unknown>) => fn()
    );
  });

  it('returns unique_views from daily_profile_views-backed total views', async () => {
    hoisted.dbExecuteMock.mockResolvedValue({
      rows: [
        {
          total_views: 150,
          unique_views: 62,
          unique_users: 70,
          total_clicks: 20,
          spotify_clicks: 10,
          social_clicks: 5,
          tip_link_visits: 1,
          recent_clicks: 3,
          listen_clicks: 10,
          subscribers: 4,
          identified_users: 2,
          top_cities: [],
          top_countries: [],
          top_referrers: [],
          top_links: [],
        },
      ],
    });

    const { getUserDashboardAnalytics } = await import(
      '@/lib/db/queries/analytics'
    );
    const result = await getUserDashboardAnalytics(
      'user_123',
      '30d',
      'traffic'
    );

    expect(result.profile_views).toBe(150);
    expect(result.unique_views).toBe(62);
    expect(result.unique_views).toBeLessThanOrEqual(result.profile_views);
  });

  it('keeps unique_views at or below profile_views for repeat-visitor totals', async () => {
    hoisted.dbExecuteMock.mockResolvedValue({
      rows: [
        {
          total_views: 500,
          unique_views: 120,
          unique_users: 130,
          total_clicks: 0,
          spotify_clicks: 0,
          social_clicks: 0,
          tip_link_visits: 0,
          recent_clicks: 0,
          listen_clicks: 0,
          subscribers: 0,
          identified_users: 0,
          top_cities: [],
          top_countries: [],
          top_referrers: [],
          top_links: [],
        },
      ],
    });

    const { getUserDashboardAnalytics } = await import(
      '@/lib/db/queries/analytics'
    );
    const result = await getUserDashboardAnalytics('user_123', '7d', 'full');

    expect(result.unique_views).toBeLessThanOrEqual(result.profile_views);
  });
});
