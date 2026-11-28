import { describe, expect, it } from 'vitest';
import type { DashboardAnalyticsResponse } from '@/types/analytics';
import {
  buildEvidenceReceiptSet,
  buildMetricReceipt,
  resolveEvidenceWindow,
} from './evidence-receipt';
import { audienceFunnelView, requestedOpsFunnel } from './funnel-view';

describe('funnel view', () => {
  it('routes read requests without taking over operating instructions or other named funnels', () => {
    expect(requestedOpsFunnel('Show the Golden Path')).toBe('golden-path');
    expect(requestedOpsFunnel('What is our current bottleneck?')).toBe(
      'golden-path'
    );
    expect(requestedOpsFunnel('Show onboarding conversion rates')).toBe(
      'customer'
    );
    expect(requestedOpsFunnel('Show the audience funnel')).toBeNull();
    expect(
      requestedOpsFunnel('Show the Golden Path and fix the bottleneck')
    ).toBeNull();
  });

  it('labels audience ratios with a measured denominator and suppresses small or unavailable bases', () => {
    const analytics = {
      profile_views: 120,
      unique_users: 48,
      subscribers: 12,
    } as DashboardAnalyticsResponse;
    expect(audienceFunnelView(analytics, '30d').stages[2].rate).toBe('25%');
    expect(
      audienceFunnelView({ ...analytics, unique_users: 12 }, '30d').stages[2]
        .rate
    ).toBeUndefined();
    expect(
      audienceFunnelView(undefined, '30d').stages.every(
        stage => stage.status === 'unknown'
      )
    ).toBe(true);
  });

  it('does not show a legacy zero when the analytics receipt says the metric is unavailable', () => {
    const rangeEnd = new Date('2026-11-25T00:00:00.000Z');
    const context = {
      profileId: 'test-profile',
      rangeEnd,
      computedAt: rangeEnd,
    };
    const window = resolveEvidenceWindow(rangeEnd, null);
    const analytics = {
      profile_views: 0,
      unique_users: 20,
      subscribers: 0,
      top_cities: [],
      top_countries: [],
      top_referrers: [],
      evidence: buildEvidenceReceiptSet(
        [
          buildMetricReceipt(
            {
              metric: 'profile_views',
              availability: 'unavailable',
              value: 0,
              grain: 'daily_bucket',
            },
            context,
            window
          ),
          buildMetricReceipt(
            {
              metric: 'subscribers',
              availability: 'measured_zero',
              value: 0,
              grain: 'event',
            },
            context,
            window
          ),
        ],
        context
      ),
    } satisfies DashboardAnalyticsResponse;

    expect(audienceFunnelView(analytics, '30d').stages).toMatchObject([
      { id: 'views', status: 'unknown' },
      { id: 'visitors', status: 'measured', count: 20 },
      { id: 'subscribers', status: 'measured', count: 0 },
    ]);
  });
});
