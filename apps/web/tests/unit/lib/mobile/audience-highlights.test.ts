import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getUserDashboardAnalyticsMock: vi.fn(),
}));

vi.mock('@/lib/db/queries/analytics', () => ({
  getUserDashboardAnalytics: hoisted.getUserDashboardAnalyticsMock,
}));

const modulePromise = import('@/lib/mobile/audience-highlights');

describe('buildMobileAudienceHighlights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getUserDashboardAnalyticsMock.mockImplementation(
      async (_userId: string, range: string) => {
        if (range === '7d') {
          return {
            profile_views: 120,
            unique_users: 80,
            subscribers: 40,
            total_clicks: 55,
            listen_clicks: 21,
          };
        }

        return {
          profile_views: 300,
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
});
