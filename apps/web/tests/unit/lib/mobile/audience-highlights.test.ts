import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  readAuthorizedDashboardAnalyticsMock: vi.fn(),
}));

vi.mock('@/lib/analytics/authorized-read', () => ({
  readAuthorizedDashboardAnalytics:
    hoisted.readAuthorizedDashboardAnalyticsMock,
}));

const modulePromise = import('@/lib/mobile/audience-highlights');

describe('buildMobileAudienceHighlights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.readAuthorizedDashboardAnalyticsMock.mockImplementation(
      async (input: { range?: string }) => {
        if (input.range === '7d') {
          return {
            range: '7d',
            view: 'traffic',
            analytics: {
              profile_views: 120,
              unique_users: 80,
              subscribers: 40,
              total_clicks: 55,
              listen_clicks: 21,
              top_cities: [],
              top_countries: [],
              top_referrers: [],
            },
          };
        }

        return {
          range: '30d',
          view: 'traffic',
          analytics: {
            profile_views: 300,
            top_cities: [],
            top_countries: [],
            top_referrers: [],
          },
        };
      }
    );
  });

  it('builds hero metric, delta, four stat tiles, and audience chat prompt', async () => {
    const { buildMobileAudienceHighlights } = await modulePromise;
    const payload = await buildMobileAudienceHighlights('user_123');

    expect(payload.rangeLabel).toBe('Last 7 days');
    expect(payload.heroLabel).toBe('Profile views');
    expect(payload.heroValue).toBe(120);
    expect(payload.heroDeltaLabel).toBe('+100% vs last week');
    expect(payload.statTiles).toHaveLength(4);
    expect(payload.statTiles.map(tile => tile.label)).toEqual([
      'Unique fans',
      'Subscribed fans',
      'Link clicks',
      'Listen clicks',
    ]);
    expect(payload.chatPrompt).toContain('audience');
  });

  it('omits the week-over-week delta when retention clamps both windows together', async () => {
    hoisted.readAuthorizedDashboardAnalyticsMock.mockResolvedValue({
      range: '7d',
      view: 'traffic',
      analytics: {
        profile_views: 120,
        unique_users: 80,
        subscribers: 40,
        total_clicks: 55,
        listen_clicks: 21,
        top_cities: [],
        top_countries: [],
        top_referrers: [],
      },
    });

    const { buildMobileAudienceHighlights } = await modulePromise;
    const payload = await buildMobileAudienceHighlights('user_123');

    expect(payload.heroValue).toBe(120);
    expect(payload.heroDeltaLabel).toBeNull();
  });
});
