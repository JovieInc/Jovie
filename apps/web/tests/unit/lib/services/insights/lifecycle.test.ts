import { describe, expect, it } from 'vitest';
import {
  dedupeVisibleInsights,
  prepareInsightsForPersistence,
} from '@/lib/services/insights/lifecycle';
import type { GeneratedInsight } from '@/types/insights';

const baseInsight: GeneratedInsight = {
  insightType: 'city_growth',
  category: 'geographic',
  priority: 'medium',
  title: 'Austin listeners grew this month',
  description: 'Austin traffic is accelerating.',
  actionSuggestion: 'Plan an Austin push.',
  confidence: 0.8,
  dataSnapshot: { city: 'Austin', country: 'US' },
  expiresInDays: 7,
};

describe('insight lifecycle deduplication', () => {
  it('keeps the highest priority same-fact city insight before persistence', () => {
    const result = prepareInsightsForPersistence([
      baseInsight,
      {
        ...baseInsight,
        insightType: 'new_market',
        priority: 'high',
        title: 'Austin is becoming a breakout market',
        confidence: 0.93,
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      insightType: 'new_market',
      priority: 'high',
    });
  });

  it('does not collapse different insight types for the same source', () => {
    const result = dedupeVisibleInsights([
      baseInsight,
      {
        ...baseInsight,
        insightType: 'declining_market',
        title: 'Austin listeners fell this month',
        description: 'Austin traffic is slowing.',
      },
    ]);

    expect(result.map(insight => insight.insightType)).toEqual([
      'city_growth',
      'declining_market',
    ]);
  });

  it('deduplicates top-level and nested location snapshots consistently', () => {
    const result = dedupeVisibleInsights([
      baseInsight,
      {
        ...baseInsight,
        dataSnapshot: { location: { city: 'Austin', country: 'US' } },
        title: 'Austin is breaking out',
      },
    ]);

    expect(result).toHaveLength(1);
  });

  it('uses normalized copy fallback when there is no structured source key', () => {
    const result = dedupeVisibleInsights([
      {
        ...baseInsight,
        dataSnapshot: {},
        title: '  Repeat listeners jumped   ',
        description: 'Fans came back twice as often.',
      },
      {
        ...baseInsight,
        dataSnapshot: null,
        title: 'repeat listeners jumped',
        description: 'Fans came back twice as often.',
      },
    ]);

    expect(result).toHaveLength(1);
  });
});

describe('JOV-3522 Top signals duplicate cards', () => {
  it('collapses same-fact insights that differ only by spikeDate window', () => {
    const result = dedupeVisibleInsights([
      {
        ...baseInsight,
        insightType: 'subscriber_growth',
        category: 'audience',
        title: '3 New Subscribers',
        description: 'You gained 3 subscribers.',
        dataSnapshot: { spikeDate: '2026-06-22' },
      },
      {
        ...baseInsight,
        insightType: 'subscriber_growth',
        category: 'audience',
        title: '3 New Subscribers',
        description: 'You gained 3 subscribers.',
        dataSnapshot: { spikeDate: '2026-06-24' },
      },
    ]);

    expect(result).toHaveLength(1);
  });

  it('keeps genuinely distinct subjects of the same category and family', () => {
    const result = dedupeVisibleInsights([
      baseInsight,
      {
        ...baseInsight,
        insightType: 'new_market',
        title: 'Denver is becoming a breakout market',
        dataSnapshot: { city: 'Denver', country: 'US' },
      },
    ]);

    expect(result).toHaveLength(2);
  });
});
