import { describe, expect, it } from 'vitest';
import { isSummerOpsCard } from './ops-card';
import {
  buildRevenueChartCard,
  buildUsersChartCard,
} from './summer-chart-cards';
import { extractSummerChartDirectives } from './summer-chart-directives';

const now = new Date('2026-11-22T02:00:00.000Z');

describe('extractSummerChartDirectives', () => {
  it('leaves a plain reply untouched', () => {
    expect(extractSummerChartDirectives('MRR is $0.')).toEqual({
      text: 'MRR is $0.',
      metrics: [],
    });
  });

  it('strips registered directives and returns them in order, once each', () => {
    expect(
      extractSummerChartDirectives(
        'Still $0 MRR and no users.\n\n[[chart:users]]\n[[chart:revenue]]\n[[chart:users]]'
      )
    ).toEqual({
      text: 'Still $0 MRR and no users.',
      metrics: ['users', 'revenue'],
    });
  });

  it('drops unregistered directives from the text without charting them', () => {
    expect(
      extractSummerChartDirectives('Here.\n[[chart:burn]]\n[[CHART:Revenue]]')
    ).toEqual({ text: 'Here.', metrics: ['revenue'] });
  });
});

describe('summer chart cards', () => {
  it('charts MRR from Stripe with no invented points', () => {
    const card = buildRevenueChartCard(
      {
        isAvailable: true,
        mrrUsd: 0,
        mrrUsd30dAgo: 0,
        mrrUsd7dAgo: 0,
        activeSubscribers: 0,
      },
      now
    );
    expect(isSummerOpsCard(card)).toBe(true);
    expect(card.series?.points.map(point => point.label)).toEqual([
      '30 days ago',
      '7 days ago',
      'Now',
    ]);
    expect(card.facts[0]).toEqual({ label: 'MRR', value: '$0' });
  });

  it('says not measured, never zero, when Stripe cannot be read', () => {
    const card = buildRevenueChartCard(null, now);
    expect(isSummerOpsCard(card)).toBe(true);
    expect(card).toMatchObject({ state: 'unavailable', series: null });
    expect(card.facts[0]?.value).toBe('Not measured');
  });

  it('charts the 7-day funnel stages as bars', () => {
    const card = buildUsersChartCard(
      {
        stages: [
          { label: 'Visited', count: 12 },
          { label: 'Accounts created', count: 0 },
        ],
        errors: [],
      },
      now
    );
    expect(isSummerOpsCard(card)).toBe(true);
    expect(card.series?.points).toEqual([
      { label: 'Visited', value: 12 },
      { label: 'Accounts created', value: 0 },
    ]);
  });

  it('is unavailable when the funnel read reports errors', () => {
    const card = buildUsersChartCard(
      { stages: [{ label: 'Visited', count: 3 }], errors: ['db down'] },
      now
    );
    expect(card).toMatchObject({ state: 'unavailable', series: null });
  });
});
