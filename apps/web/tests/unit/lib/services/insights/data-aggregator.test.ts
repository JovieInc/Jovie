import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks (resolved before module imports)
// ---------------------------------------------------------------------------
const {
  mockDashboardQuery,
  mockDbExecute,
  mockDbSelect,
  mockDbFrom,
  mockDbWhere,
  mockDbOrderBy,
  mockDbLimit,
} = vi.hoisted(() => ({
  mockDashboardQuery: vi.fn(),
  mockDbExecute: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbFrom: vi.fn(),
  mockDbWhere: vi.fn(),
  mockDbOrderBy: vi.fn(),
  mockDbLimit: vi.fn(),
}));

// Wire up the chaining pattern: db.select().from().where().orderBy().limit()
// Note: some queries skip orderBy and go .where().limit() directly
mockDbSelect.mockReturnValue({ from: mockDbFrom });
mockDbFrom.mockReturnValue({ where: mockDbWhere });
mockDbWhere.mockReturnValue({ orderBy: mockDbOrderBy, limit: mockDbLimit });
mockDbOrderBy.mockReturnValue({ limit: mockDbLimit });

vi.mock('@/lib/db', () => ({
  db: {
    execute: mockDbExecute,
    select: mockDbSelect,
  },
}));

vi.mock('@/lib/db/query-timeout', () => ({
  dashboardQuery: mockDashboardQuery,
}));

vi.mock('@/lib/db/schema/analytics', () => ({
  audienceMembers: { creatorProfileId: 'creator_profile_id' },
  clickEvents: {
    creatorProfileId: 'creator_profile_id',
    isBot: 'is_bot',
  },
  notificationSubscriptions: { creatorProfileId: 'creator_profile_id' },
  tips: { creatorProfileId: 'creator_profile_id' },
}));

vi.mock('@/lib/db/schema/content', () => ({
  discogReleases: {
    id: 'id',
    title: 'title',
    releaseDate: 'release_date',
    creatorProfileId: 'creator_profile_id',
  },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'id',
    displayName: 'display_name',
    genres: 'genres',
    spotifyFollowers: 'spotify_followers',
    spotifyPopularity: 'spotify_popularity',
    creatorType: 'creator_type',
    profileViews: 'profile_views',
  },
}));

vi.mock('@/lib/db/schema/tour', () => ({
  tourDates: {
    profileId: 'profile_id',
    city: 'city',
    country: 'country',
    startDate: 'start_date',
    venueName: 'venue_name',
  },
}));

vi.mock('@/lib/db/sql-helpers', () => ({
  sqlTimestamp: vi.fn((d: Date) => d.toISOString()),
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  sql: vi.fn((strings: TemplateStringsArray, ..._vals: unknown[]) => strings),
  eq: vi.fn((a: unknown, b: unknown) => [a, b]),
  gte: vi.fn((a: unknown, b: unknown) => [a, b]),
}));

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe('data-aggregator.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-wire chaining defaults after clearAllMocks
    mockDbSelect.mockReturnValue({ from: mockDbFrom });
    mockDbFrom.mockReturnValue({ where: mockDbWhere });
    mockDbWhere.mockReturnValue({ orderBy: mockDbOrderBy, limit: mockDbLimit });
    mockDbOrderBy.mockReturnValue({ limit: mockDbLimit });
  });

  // =========================================================================
  // 1. computePeriods
  // =========================================================================
  describe('computePeriods', () => {
    it('returns correct period boundaries for default 30 days', async () => {
      const { computePeriods } = await import(
        '@/lib/services/insights/data-aggregator'
      );

      const before = Date.now();
      const result = computePeriods();
      const after = Date.now();

      // period.end should be approximately "now"
      expect(result.period.end.getTime()).toBeGreaterThanOrEqual(before);
      expect(result.period.end.getTime()).toBeLessThanOrEqual(after);

      // period.start should be 30 days before period.end
      const diffDays =
        (result.period.end.getTime() - result.period.start.getTime()) /
        (1000 * 60 * 60 * 24);
      expect(Math.round(diffDays)).toBe(30);

      // comparison period should be the 30 days immediately before the main period
      expect(result.comparisonPeriod.end.getTime()).toBe(
        result.period.start.getTime()
      );
      const compDiffDays =
        (result.comparisonPeriod.end.getTime() -
          result.comparisonPeriod.start.getTime()) /
        (1000 * 60 * 60 * 24);
      expect(Math.round(compDiffDays)).toBe(30);
    });

    it('returns correct period boundaries for 7 days', async () => {
      const { computePeriods } = await import(
        '@/lib/services/insights/data-aggregator'
      );

      const result = computePeriods(7);

      const diffDays =
        (result.period.end.getTime() - result.period.start.getTime()) /
        (1000 * 60 * 60 * 24);
      expect(Math.round(diffDays)).toBe(7);

      const compDiffDays =
        (result.comparisonPeriod.end.getTime() -
          result.comparisonPeriod.start.getTime()) /
        (1000 * 60 * 60 * 24);
      expect(Math.round(compDiffDays)).toBe(7);
    });

    it('returns correct period boundaries for 90 days', async () => {
      const { computePeriods } = await import(
        '@/lib/services/insights/data-aggregator'
      );

      const result = computePeriods(90);

      const diffDays =
        (result.period.end.getTime() - result.period.start.getTime()) /
        (1000 * 60 * 60 * 24);
      expect(Math.round(diffDays)).toBe(90);
    });

    it('comparison period end equals period start (contiguous windows)', async () => {
      const { computePeriods } = await import(
        '@/lib/services/insights/data-aggregator'
      );

      const result = computePeriods(14);

      expect(result.comparisonPeriod.end.getTime()).toBe(
        result.period.start.getTime()
      );
    });
  });

  // =========================================================================
  // 2. aggregateMetrics (full orchestrator)
  // =========================================================================
  describe('aggregateMetrics', () => {
    it('assembles full MetricSnapshot from all sub-aggregators', async () => {
      // dashboardQuery: used by aggregateClicks, aggregateAudience,
      // aggregateSubscribers, aggregateRevenue, aggregateTemporalPatterns
      mockDashboardQuery
        // aggregateClicks
        .mockResolvedValueOnce({
          current_top_cities: [{ city: 'Austin', country: 'US', count: 50 }],
          previous_top_cities: [{ city: 'Austin', country: 'US', count: 40 }],
          top_referrers_current: [{ referrer: 'google.com', count: 30 }],
          top_referrers_previous: [{ referrer: 'google.com', count: 20 }],
          clicks_by_link_type: [
            { link_type: 'spotify', current: 10, previous: 8 },
          ],
          total_clicks_current: '100',
          total_clicks_previous: '80',
          unique_visitors_current: '60',
          unique_visitors_previous: '50',
        })
        // aggregateAudience
        .mockResolvedValueOnce({
          total_members: '200',
          top_cities: [{ city: 'Austin', country: 'US', count: 30 }],
          intent_current: [{ level: 'high', count: 15 }],
          intent_previous: [{ level: 'high', count: 10 }],
          device_distribution: [{ device_type: 'mobile', count: 100 }],
        })
        // aggregateSubscribers
        .mockResolvedValueOnce({
          new_current: '25',
          new_previous: '20',
          unsub_current: '3',
          unsub_previous: '2',
          total_active: '150',
          subscriber_cities: [{ city: 'Austin', count: 20 }],
        })
        // aggregateRevenue
        .mockResolvedValueOnce({
          total_current: '5000',
          total_previous: '3000',
          count_current: '10',
          count_previous: '6',
          tips_by_city: [{ city: 'Austin', total_cents: 3000, count: 5 }],
        })
        // aggregateTemporalPatterns
        .mockResolvedValueOnce({
          clicks_by_hour: [{ hour: 14, count: 20 }],
          clicks_by_dow: [{ day: 1, count: 40 }],
        });

      // db.select chain for tourDates (aggregateTourData)
      const tourDate = new Date('2026-04-01');
      mockDbLimit
        // tourDates
        .mockResolvedValueOnce([
          {
            city: 'Dallas',
            country: 'US',
            startDate: tourDate,
            venueName: 'Deep Ellum',
          },
        ])
        // fetchProfileContext
        .mockResolvedValueOnce([
          {
            displayName: 'Test Artist',
            genres: ['rock'],
            spotifyFollowers: 5000,
            spotifyPopularity: 42,
            creatorType: 'artist',
            profileViews: 1200,
          },
        ])
        // aggregateReleases
        .mockResolvedValueOnce([
          {
            id: 'rel-1',
            title: 'New Album',
            releaseDate: new Date('2026-01-15'),
          },
        ]);

      const { aggregateMetrics } = await import(
        '@/lib/services/insights/data-aggregator'
      );

      const snapshot = await aggregateMetrics('profile-123', 30);

      // Period structure
      expect(snapshot.period.start).toBeInstanceOf(Date);
      expect(snapshot.period.end).toBeInstanceOf(Date);

      // Traffic
      expect(snapshot.traffic.totalClicksCurrent).toBe(100);
      expect(snapshot.traffic.totalClicksPrevious).toBe(80);
      expect(snapshot.traffic.uniqueVisitorsCurrent).toBe(60);

      // Subscribers
      expect(snapshot.subscribers.newSubscribersCurrent).toBe(25);
      expect(snapshot.subscribers.totalActive).toBe(150);

      // Revenue
      expect(snapshot.revenue.totalTipsCurrent).toBe(5000);
      expect(snapshot.revenue.averageTipCurrent).toBe(500); // 5000/10

      // Geographic
      expect(snapshot.geographic.currentTopCities).toHaveLength(1);
      expect(snapshot.geographic.cityGrowthRates[0].growthPct).toBe(25); // (50-40)/40*100

      // Tour
      expect(snapshot.tour.upcomingShows).toHaveLength(1);
      expect(snapshot.tour.upcomingShows[0].venueName).toBe('Deep Ellum');

      // Engagement - capture rate: (25/60)*100 = 41.666... rounded to 41.7
      expect(snapshot.engagement.captureRateCurrent).toBe(41.7);

      // Profile
      expect(snapshot.profile.displayName).toBe('Test Artist');
      expect(snapshot.profile.genres).toEqual(['rock']);

      // Temporal
      expect(snapshot.temporal.clicksByHour).toEqual([{ hour: 14, count: 20 }]);

      // Content
      expect(snapshot.content.recentReleases[0].title).toBe('New Album');

      // Referrers
      expect(snapshot.referrers.topReferrersCurrent[0].referrer).toBe(
        'google.com'
      );
      expect(snapshot.referrers.referrerGrowthRates[0].growthPct).toBe(50); // (30-20)/20*100
    });
  });

  // =========================================================================
  // 3. aggregateClicks
  // =========================================================================
  describe('aggregateClicks (via aggregateMetrics)', () => {
    it('handles empty click data gracefully', async () => {
      mockDashboardQuery
        .mockResolvedValueOnce(undefined) // clicks returns null row
        .mockResolvedValueOnce(undefined) // audience
        .mockResolvedValueOnce(undefined) // subscribers
        .mockResolvedValueOnce(undefined) // revenue
        .mockResolvedValueOnce(undefined); // temporal

      mockDbLimit
        .mockResolvedValueOnce([]) // tour
        .mockResolvedValueOnce([]) // profile
        .mockResolvedValueOnce([]); // releases

      const { aggregateMetrics } = await import(
        '@/lib/services/insights/data-aggregator'
      );
      const snapshot = await aggregateMetrics('profile-empty');

      expect(snapshot.traffic.totalClicksCurrent).toBe(0);
      expect(snapshot.traffic.totalClicksPrevious).toBe(0);
      expect(snapshot.traffic.uniqueVisitorsCurrent).toBe(0);
      expect(snapshot.geographic.currentTopCities).toEqual([]);
      expect(snapshot.geographic.previousTopCities).toEqual([]);
      expect(snapshot.referrers.topReferrersCurrent).toEqual([]);
    });

    it('filters out cities with null city name', async () => {
      mockDashboardQuery
        .mockResolvedValueOnce({
          current_top_cities: [
            { city: 'Austin', country: 'US', count: 10 },
            { city: null, country: 'US', count: 5 },
            { city: '', country: 'US', count: 3 },
          ],
          previous_top_cities: [],
          top_referrers_current: [],
          top_referrers_previous: [],
          clicks_by_link_type: [],
          total_clicks_current: '10',
          total_clicks_previous: '0',
          unique_visitors_current: '5',
          unique_visitors_previous: '0',
        })
        .mockResolvedValueOnce(undefined) // audience
        .mockResolvedValueOnce(undefined) // subscribers
        .mockResolvedValueOnce(undefined) // revenue
        .mockResolvedValueOnce(undefined); // temporal

      mockDbLimit
        .mockResolvedValueOnce([]) // tour
        .mockResolvedValueOnce([]) // profile
        .mockResolvedValueOnce([]); // releases

      const { aggregateMetrics } = await import(
        '@/lib/services/insights/data-aggregator'
      );
      const snapshot = await aggregateMetrics('profile-filter');

      // null and empty city names should be filtered out
      expect(snapshot.geographic.currentTopCities).toHaveLength(1);
      expect(snapshot.geographic.currentTopCities[0].city).toBe('Austin');
    });

    it('parses JSON string arrays from database', async () => {
      mockDashboardQuery
        .mockResolvedValueOnce({
          current_top_cities: JSON.stringify([
            { city: 'Berlin', country: 'DE', count: 20 },
          ]),
          previous_top_cities: '[]',
          top_referrers_current: JSON.stringify([
            { referrer: 'twitter.com', count: 15 },
          ]),
          top_referrers_previous: '[]',
          clicks_by_link_type: JSON.stringify([
            { link_type: 'spotify', current: 5, previous: 2 },
          ]),
          total_clicks_current: 20,
          total_clicks_previous: 0,
          unique_visitors_current: 10,
          unique_visitors_previous: 0,
        })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      mockDbLimit
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const { aggregateMetrics } = await import(
        '@/lib/services/insights/data-aggregator'
      );
      const snapshot = await aggregateMetrics('profile-json');

      expect(snapshot.geographic.currentTopCities[0].city).toBe('Berlin');
      expect(snapshot.referrers.topReferrersCurrent[0].referrer).toBe(
        'twitter.com'
      );
      expect(snapshot.content.clicksByLinkType[0].linkType).toBe('spotify');
    });
  });

  // =========================================================================
  // 4. aggregateAudience
  // =========================================================================
  describe('aggregateAudience (via aggregateMetrics)', () => {
    it('maps device_type to deviceType in device distribution', async () => {
      mockDashboardQuery
        .mockResolvedValueOnce({
          current_top_cities: [],
          previous_top_cities: [],
          top_referrers_current: [],
          top_referrers_previous: [],
          clicks_by_link_type: [],
          total_clicks_current: '0',
          total_clicks_previous: '0',
          unique_visitors_current: '0',
          unique_visitors_previous: '0',
        })
        .mockResolvedValueOnce({
          total_members: '500',
          top_cities: [],
          intent_current: [
            { level: 'high', count: 50 },
            { level: 'medium', count: 200 },
            { level: 'low', count: 250 },
          ],
          intent_previous: [{ level: 'high', count: 30 }],
          device_distribution: [
            { device_type: 'mobile', count: 300 },
            { device_type: 'desktop', count: 200 },
          ],
        })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      mockDbLimit
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const { aggregateMetrics } = await import(
        '@/lib/services/insights/data-aggregator'
      );
      const snapshot = await aggregateMetrics('profile-audience');

      expect(snapshot.engagement.deviceDistribution).toEqual([
        { deviceType: 'mobile', count: 300 },
        { deviceType: 'desktop', count: 200 },
      ]);
      expect(snapshot.engagement.intentDistributionCurrent).toHaveLength(3);
      expect(snapshot.profile.totalAudienceMembers).toBe(500);
    });
  });

  // =========================================================================
  // 5. aggregateSubscribers
  // =========================================================================
  describe('aggregateSubscribers (via aggregateMetrics)', () => {
    it('tracks new subscribers and unsubscribes across periods', async () => {
      mockDashboardQuery
        .mockResolvedValueOnce({
          current_top_cities: [],
          previous_top_cities: [],
          top_referrers_current: [],
          top_referrers_previous: [],
          clicks_by_link_type: [],
          total_clicks_current: '0',
          total_clicks_previous: '0',
          unique_visitors_current: '0',
          unique_visitors_previous: '0',
        })
        .mockResolvedValueOnce({
          total_members: '0',
          top_cities: [],
          intent_current: [],
          intent_previous: [],
          device_distribution: [],
        })
        .mockResolvedValueOnce({
          new_current: '45',
          new_previous: '30',
          unsub_current: '5',
          unsub_previous: '8',
          total_active: '250',
          subscriber_cities: [
            { city: 'Nashville', count: 40 },
            { city: 'Memphis', count: 20 },
          ],
        })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      mockDbLimit
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const { aggregateMetrics } = await import(
        '@/lib/services/insights/data-aggregator'
      );
      const snapshot = await aggregateMetrics('profile-subs');

      expect(snapshot.subscribers.newSubscribersCurrent).toBe(45);
      expect(snapshot.subscribers.newSubscribersPrevious).toBe(30);
      expect(snapshot.subscribers.unsubscribesCurrent).toBe(5);
      expect(snapshot.subscribers.unsubscribesPrevious).toBe(8);
      expect(snapshot.subscribers.totalActive).toBe(250);
      expect(snapshot.subscribers.subscriberCities).toHaveLength(2);
    });
  });

  // =========================================================================
  // 6. aggregateRevenue
  // =========================================================================
  describe('aggregateRevenue (via aggregateMetrics)', () => {
    it('computes revenue totals and averages correctly', async () => {
      mockDashboardQuery
        .mockResolvedValueOnce({
          current_top_cities: [],
          previous_top_cities: [],
          top_referrers_current: [],
          top_referrers_previous: [],
          clicks_by_link_type: [],
          total_clicks_current: '0',
          total_clicks_previous: '0',
          unique_visitors_current: '0',
          unique_visitors_previous: '0',
        })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          total_current: '10000',
          total_previous: '6000',
          count_current: '20',
          count_previous: '12',
          tips_by_city: [
            { city: 'Austin', total_cents: 5000, count: 10 },
            { city: 'Nashville', total_cents: 3000, count: 6 },
          ],
        })
        .mockResolvedValueOnce(undefined);

      mockDbLimit
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const { aggregateMetrics } = await import(
        '@/lib/services/insights/data-aggregator'
      );
      const snapshot = await aggregateMetrics('profile-rev');

      expect(snapshot.revenue.totalTipsCurrent).toBe(10000);
      expect(snapshot.revenue.totalTipsPrevious).toBe(6000);
      expect(snapshot.revenue.tipCountCurrent).toBe(20);
      expect(snapshot.revenue.tipCountPrevious).toBe(12);
      expect(snapshot.revenue.averageTipCurrent).toBe(500); // 10000/20
      expect(snapshot.revenue.averageTipPrevious).toBe(500); // 6000/12
      expect(snapshot.revenue.tipsByCity).toHaveLength(2);
      expect(snapshot.revenue.tipsByCity[0].totalCents).toBe(5000);
    });

    it('handles zero tip count gracefully (no division by zero)', async () => {
      mockDashboardQuery
        .mockResolvedValueOnce({
          current_top_cities: [],
          previous_top_cities: [],
          top_referrers_current: [],
          top_referrers_previous: [],
          clicks_by_link_type: [],
          total_clicks_current: '0',
          total_clicks_previous: '0',
          unique_visitors_current: '0',
          unique_visitors_previous: '0',
        })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          total_current: '0',
          total_previous: '0',
          count_current: '0',
          count_previous: '0',
          tips_by_city: [],
        })
        .mockResolvedValueOnce(undefined);

      mockDbLimit
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const { aggregateMetrics } = await import(
        '@/lib/services/insights/data-aggregator'
      );
      const snapshot = await aggregateMetrics('profile-no-rev');

      expect(snapshot.revenue.averageTipCurrent).toBe(0);
      expect(snapshot.revenue.averageTipPrevious).toBe(0);
      expect(snapshot.revenue.tipsByCity).toEqual([]);
    });
  });

  // =========================================================================
  // 7. aggregateTourData
  // =========================================================================
  describe('aggregateTourData (via aggregateMetrics)', () => {
    it('identifies audience cities without upcoming shows', async () => {
      mockDashboardQuery
        .mockResolvedValueOnce({
          current_top_cities: [],
          previous_top_cities: [],
          top_referrers_current: [],
          top_referrers_previous: [],
          clicks_by_link_type: [],
          total_clicks_current: '0',
          total_clicks_previous: '0',
          unique_visitors_current: '0',
          unique_visitors_previous: '0',
        })
        .mockResolvedValueOnce({
          total_members: '100',
          // audience top cities include Austin and Nashville
          top_cities: [
            { city: 'Austin', country: 'US', count: 50 },
            { city: 'Nashville', country: 'US', count: 30 },
            { city: 'Memphis', country: 'US', count: 5 }, // below threshold of 10
          ],
          intent_current: [],
          intent_previous: [],
          device_distribution: [],
        })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      const futureDate = new Date('2026-06-01');
      mockDbLimit
        // tour: only Austin has a show
        .mockResolvedValueOnce([
          {
            city: 'Austin',
            country: 'US',
            startDate: futureDate,
            venueName: "Stubb's",
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const { aggregateMetrics } = await import(
        '@/lib/services/insights/data-aggregator'
      );
      const snapshot = await aggregateMetrics('profile-tour');

      // Nashville has >= 10 audience members but no show -> gap
      expect(snapshot.tour.audienceCitiesWithoutShows).toEqual([
        { city: 'Nashville', country: 'US', audienceCount: 30 },
      ]);
      // Memphis has only 5 members -> excluded (below threshold)
      expect(
        snapshot.tour.audienceCitiesWithoutShows.find(c => c.city === 'Memphis')
      ).toBeUndefined();
    });
  });

  // =========================================================================
  // 8. Growth rate calculations
  // =========================================================================
  describe('growth rate calculations', () => {
    it('computes positive growth rate', async () => {
      mockDashboardQuery
        .mockResolvedValueOnce({
          current_top_cities: [{ city: 'Austin', country: 'US', count: 100 }],
          previous_top_cities: [{ city: 'Austin', country: 'US', count: 50 }],
          top_referrers_current: [],
          top_referrers_previous: [],
          clicks_by_link_type: [],
          total_clicks_current: '0',
          total_clicks_previous: '0',
          unique_visitors_current: '0',
          unique_visitors_previous: '0',
        })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      mockDbLimit
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const { aggregateMetrics } = await import(
        '@/lib/services/insights/data-aggregator'
      );
      const snapshot = await aggregateMetrics('profile-growth');

      // (100-50)/50 * 100 = 100%
      expect(snapshot.geographic.cityGrowthRates[0].growthPct).toBe(100);
    });

    it('computes negative growth rate and identifies declining cities', async () => {
      mockDashboardQuery
        .mockResolvedValueOnce({
          current_top_cities: [{ city: 'Detroit', country: 'US', count: 5 }],
          previous_top_cities: [{ city: 'Detroit', country: 'US', count: 50 }],
          top_referrers_current: [],
          top_referrers_previous: [],
          clicks_by_link_type: [],
          total_clicks_current: '0',
          total_clicks_previous: '0',
          unique_visitors_current: '0',
          unique_visitors_previous: '0',
        })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      mockDbLimit
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const { aggregateMetrics } = await import(
        '@/lib/services/insights/data-aggregator'
      );
      const snapshot = await aggregateMetrics('profile-decline');

      // (5-50)/50 * 100 = -90%
      expect(snapshot.geographic.cityGrowthRates[0].growthPct).toBe(-90);
      // decliningCities: growthPct < -20 AND previousCount >= 10
      expect(snapshot.geographic.decliningCities).toEqual([
        { city: 'Detroit', country: 'US', declinePct: 90 },
      ]);
    });

    it('handles zero baseline (new city = 100% growth)', async () => {
      mockDashboardQuery
        .mockResolvedValueOnce({
          current_top_cities: [{ city: 'Portland', country: 'US', count: 20 }],
          previous_top_cities: [], // Portland is brand new
          top_referrers_current: [],
          top_referrers_previous: [],
          clicks_by_link_type: [],
          total_clicks_current: '20',
          total_clicks_previous: '0',
          unique_visitors_current: '10',
          unique_visitors_previous: '0',
        })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      mockDbLimit
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const { aggregateMetrics } = await import(
        '@/lib/services/insights/data-aggregator'
      );
      const snapshot = await aggregateMetrics('profile-new-city');

      // previous was 0, current > 0 -> 100%
      expect(snapshot.geographic.cityGrowthRates[0].growthPct).toBe(100);
      // newCities: present in current but not previous, count >= 5
      expect(snapshot.geographic.newCities).toEqual([
        { city: 'Portland', country: 'US', count: 20 },
      ]);
    });

    it('computes referrer growth rates sorted by growth descending', async () => {
      mockDashboardQuery
        .mockResolvedValueOnce({
          current_top_cities: [],
          previous_top_cities: [],
          top_referrers_current: [
            { referrer: 'google.com', count: 100 },
            { referrer: 'twitter.com', count: 30 },
          ],
          top_referrers_previous: [
            { referrer: 'google.com', count: 80 },
            { referrer: 'twitter.com', count: 50 },
          ],
          clicks_by_link_type: [],
          total_clicks_current: '0',
          total_clicks_previous: '0',
          unique_visitors_current: '0',
          unique_visitors_previous: '0',
        })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      mockDbLimit
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const { aggregateMetrics } = await import(
        '@/lib/services/insights/data-aggregator'
      );
      const snapshot = await aggregateMetrics('profile-referrer');

      const rates = snapshot.referrers.referrerGrowthRates;
      // google: (100-80)/80*100 = 25%
      // twitter: (30-50)/50*100 = -40%
      expect(rates[0].referrer).toBe('google.com');
      expect(rates[0].growthPct).toBe(25);
      expect(rates[1].referrer).toBe('twitter.com');
      expect(rates[1].growthPct).toBe(-40);
    });
  });

  // =========================================================================
  // 9. Temporal patterns
  // =========================================================================
  describe('temporal patterns', () => {
    it('maps hour and day of week data with numeric coercion', async () => {
      mockDashboardQuery
        .mockResolvedValueOnce({
          current_top_cities: [],
          previous_top_cities: [],
          top_referrers_current: [],
          top_referrers_previous: [],
          clicks_by_link_type: [],
          total_clicks_current: '0',
          total_clicks_previous: '0',
          unique_visitors_current: '0',
          unique_visitors_previous: '0',
        })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          // Database may return numbers as strings
          clicks_by_hour: [
            { hour: '9', count: '15' },
            { hour: '14', count: '30' },
            { hour: '20', count: '25' },
          ],
          clicks_by_dow: [
            { day: '0', count: '10' },
            { day: '1', count: '50' },
            { day: '5', count: '35' },
          ],
        });

      mockDbLimit
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const { aggregateMetrics } = await import(
        '@/lib/services/insights/data-aggregator'
      );
      const snapshot = await aggregateMetrics('profile-temporal');

      // Values should be coerced to numbers
      expect(snapshot.temporal.clicksByHour).toEqual([
        { hour: 9, count: 15 },
        { hour: 14, count: 30 },
        { hour: 20, count: 25 },
      ]);
      expect(snapshot.temporal.clicksByDayOfWeek).toEqual([
        { day: 0, count: 10 },
        { day: 1, count: 50 },
        { day: 5, count: 35 },
      ]);
    });
  });

  // =========================================================================
  // 10. Empty data handling across all aggregators
  // =========================================================================
  describe('empty data handling', () => {
    it('returns zeroed MetricSnapshot when all queries return undefined', async () => {
      mockDashboardQuery.mockResolvedValue(undefined);

      mockDbLimit.mockResolvedValue([]);

      const { aggregateMetrics } = await import(
        '@/lib/services/insights/data-aggregator'
      );
      const snapshot = await aggregateMetrics('profile-empty-all');

      expect(snapshot.traffic.totalClicksCurrent).toBe(0);
      expect(snapshot.traffic.uniqueVisitorsCurrent).toBe(0);
      expect(snapshot.subscribers.totalActive).toBe(0);
      expect(snapshot.revenue.totalTipsCurrent).toBe(0);
      expect(snapshot.revenue.averageTipCurrent).toBe(0);
      expect(snapshot.geographic.currentTopCities).toEqual([]);
      expect(snapshot.geographic.cityGrowthRates).toEqual([]);
      expect(snapshot.geographic.newCities).toEqual([]);
      expect(snapshot.geographic.decliningCities).toEqual([]);
      expect(snapshot.referrers.topReferrersCurrent).toEqual([]);
      expect(snapshot.referrers.referrerGrowthRates).toEqual([]);
      expect(snapshot.engagement.captureRateCurrent).toBe(0);
      expect(snapshot.engagement.captureRatePrevious).toBe(0);
      expect(snapshot.temporal.clicksByHour).toEqual([]);
      expect(snapshot.temporal.clicksByDayOfWeek).toEqual([]);
      expect(snapshot.tour.upcomingShows).toEqual([]);
      expect(snapshot.profile.displayName).toBe('Unknown Artist');
      expect(snapshot.profile.creatorType).toBe('artist');
    });
  });

  // =========================================================================
  // 11. Capture rate calculation
  // =========================================================================
  describe('capture rate calculation', () => {
    it('computes capture rate as (newSubs / uniqueVisitors) * 100 rounded to 1 decimal', async () => {
      mockDashboardQuery
        .mockResolvedValueOnce({
          current_top_cities: [],
          previous_top_cities: [],
          top_referrers_current: [],
          top_referrers_previous: [],
          clicks_by_link_type: [],
          total_clicks_current: '100',
          total_clicks_previous: '80',
          unique_visitors_current: '300', // 300 unique visitors
          unique_visitors_previous: '200',
        })
        .mockResolvedValueOnce(undefined) // audience
        .mockResolvedValueOnce({
          new_current: '7', // 7 new subs
          new_previous: '10', // 10 previous subs
          unsub_current: '0',
          unsub_previous: '0',
          total_active: '50',
          subscriber_cities: [],
        })
        .mockResolvedValueOnce(undefined) // revenue
        .mockResolvedValueOnce(undefined); // temporal

      mockDbLimit
        .mockResolvedValueOnce([]) // tour
        .mockResolvedValueOnce([]) // profile
        .mockResolvedValueOnce([]); // releases

      const { aggregateMetrics } = await import(
        '@/lib/services/insights/data-aggregator'
      );
      const snapshot = await aggregateMetrics('profile-capture');

      // current: (7/300)*100 = 2.3333... -> rounded to 2.3
      expect(snapshot.engagement.captureRateCurrent).toBe(2.3);
      // previous: (10/200)*100 = 5.0
      expect(snapshot.engagement.captureRatePrevious).toBe(5);
    });

    it('returns 0 capture rate when there are no unique visitors', async () => {
      mockDashboardQuery
        .mockResolvedValueOnce({
          current_top_cities: [],
          previous_top_cities: [],
          top_referrers_current: [],
          top_referrers_previous: [],
          clicks_by_link_type: [],
          total_clicks_current: '0',
          total_clicks_previous: '0',
          unique_visitors_current: '0', // no visitors
          unique_visitors_previous: '0',
        })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          new_current: '5', // subs exist but no visitors
          new_previous: '0',
          unsub_current: '0',
          unsub_previous: '0',
          total_active: '5',
          subscriber_cities: [],
        })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      mockDbLimit
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const { aggregateMetrics } = await import(
        '@/lib/services/insights/data-aggregator'
      );
      const snapshot = await aggregateMetrics('profile-no-visitors');

      // Avoid division by zero
      expect(snapshot.engagement.captureRateCurrent).toBe(0);
    });
  });

  // =========================================================================
  // 12. Profile context defaults
  // =========================================================================
  describe('profile context defaults', () => {
    it('provides sensible defaults when profile not found', async () => {
      mockDashboardQuery.mockResolvedValue(undefined);

      mockDbLimit
        .mockResolvedValueOnce([]) // tour
        .mockResolvedValueOnce([]) // profile - empty = not found
        .mockResolvedValueOnce([]); // releases

      const { aggregateMetrics } = await import(
        '@/lib/services/insights/data-aggregator'
      );
      const snapshot = await aggregateMetrics('profile-missing');

      expect(snapshot.profile.displayName).toBe('Unknown Artist');
      expect(snapshot.profile.genres).toEqual([]);
      expect(snapshot.profile.spotifyFollowers).toBeNull();
      expect(snapshot.profile.spotifyPopularity).toBeNull();
      expect(snapshot.profile.creatorType).toBe('artist');
      expect(snapshot.traffic.profileViewsCurrent).toBe(0);
    });
  });

  // =========================================================================
  // 13. New cities identification
  // =========================================================================
  describe('new cities identification', () => {
    it('only flags new cities with count >= 5', async () => {
      mockDashboardQuery
        .mockResolvedValueOnce({
          current_top_cities: [
            { city: 'Tokyo', country: 'JP', count: 10 }, // new, count >= 5
            { city: 'Osaka', country: 'JP', count: 3 }, // new, but count < 5
            { city: 'Austin', country: 'US', count: 50 }, // existed before
          ],
          previous_top_cities: [{ city: 'Austin', country: 'US', count: 40 }],
          top_referrers_current: [],
          top_referrers_previous: [],
          clicks_by_link_type: [],
          total_clicks_current: '0',
          total_clicks_previous: '0',
          unique_visitors_current: '0',
          unique_visitors_previous: '0',
        })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      mockDbLimit
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const { aggregateMetrics } = await import(
        '@/lib/services/insights/data-aggregator'
      );
      const snapshot = await aggregateMetrics('profile-new-cities');

      expect(snapshot.geographic.newCities).toEqual([
        { city: 'Tokyo', country: 'JP', count: 10 },
      ]);
    });
  });

  // =========================================================================
  // 14. dashboardQuery is called with correct label
  // =========================================================================
  describe('dashboardQuery labeling', () => {
    it('passes descriptive labels to dashboardQuery', async () => {
      mockDashboardQuery.mockResolvedValue(undefined);
      mockDbLimit.mockResolvedValue([]);

      const { aggregateMetrics } = await import(
        '@/lib/services/insights/data-aggregator'
      );
      await aggregateMetrics('profile-labels');

      // 5 dashboardQuery calls with labels
      const labels = mockDashboardQuery.mock.calls.map(
        (call: unknown[]) => call[1]
      );
      expect(labels).toContain('aggregateClicks');
      expect(labels).toContain('aggregateAudience');
      expect(labels).toContain('aggregateSubscribers');
      expect(labels).toContain('aggregateRevenue');
      expect(labels).toContain('aggregateTemporalPatterns');
    });
  });
});
