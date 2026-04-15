import { describe, expect, it } from 'vitest';

import { buildGreeting } from '@/components/jovie/lib/greeting';
import type { InsightResponse } from '@/types/insights';

function createInsight(
  overrides: Partial<InsightResponse> = {}
): InsightResponse {
  return {
    id: 'insight-1',
    insightType: 'subscriber_surge',
    category: 'growth',
    priority: 'high',
    title: 'Your subscribers jumped 23% in LA this week',
    description: 'Insight description',
    actionSuggestion: null,
    confidence: '0.92',
    status: 'active',
    periodStart: '2026-03-01T00:00:00.000Z',
    periodEnd: '2026-03-08T00:00:00.000Z',
    createdAt: '2026-03-08T00:00:00.000Z',
    expiresAt: '2026-03-15T00:00:00.000Z',
    ...overrides,
  };
}

const emptyTippingStats = {
  tipClicks: 0,
  tipsSubmitted: 0,
  totalReceivedCents: 0,
  monthReceivedCents: 0,
} as const;

describe('buildGreeting', () => {
  it('builds the first-session greeting with a profile link', () => {
    const greeting = buildGreeting({
      username: 'timwhite',
      isFirstSession: true,
      insights: [],
      tippingStats: emptyTippingStats,
    });

    expect(greeting).toEqual({
      label: 'Artist ready',
      body: 'Your profile is live at',
      profileHref: 'https://jov.ie/timwhite',
      profileLabel: 'jov.ie/timwhite',
    });
  });

  it('falls back to jov.ie when the username is missing on first session', () => {
    const greeting = buildGreeting({
      isFirstSession: true,
      insights: [],
      tippingStats: emptyTippingStats,
    });

    expect(greeting.profileHref).toBe('https://jov.ie');
    expect(greeting.profileLabel).toBe('jov.ie');
  });

  it('uses the top insight for returning users', () => {
    const greeting = buildGreeting({
      isFirstSession: false,
      insights: [createInsight()],
      tippingStats: emptyTippingStats,
    });

    expect(greeting.label).toBe('Welcome back');
    expect(greeting.body).toBe('Your subscribers jumped 23% in LA this week.');
    expect(greeting.profileHref).toBeNull();
  });

  it('falls back to payment activity when no insights are available', () => {
    const greeting = buildGreeting({
      isFirstSession: false,
      insights: [],
      tippingStats: {
        ...emptyTippingStats,
        tipsSubmitted: 2,
      },
    });

    expect(greeting.body).toBe(
      "You've received 2 payments since your last check-in."
    );
  });

  it('falls back to audience-building guidance when no data is available', () => {
    const greeting = buildGreeting({
      isFirstSession: false,
      insights: [],
      tippingStats: emptyTippingStats,
    });

    expect(greeting.body).toBe(
      'Share your profile to start building your audience.'
    );
  });
});
