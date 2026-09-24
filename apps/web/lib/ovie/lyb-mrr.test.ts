import { describe, expect, it } from 'vitest';
import { parseLybMrrChart, parseLybMrrDayResolution } from './lyb-mrr';

const NOW = new Date('2026-09-24T05:00:00.000Z');
const DAY = Date.parse('2026-09-24T00:00:00.000Z');
const OBSERVED = Date.parse('2026-09-24T04:00:00.000Z');

function chart(value: unknown = 42.5, computed: unknown = OBSERVED) {
  return {
    object: 'chart_data',
    resolution: 'day',
    yaxis_currency: 'USD',
    yaxis: '$',
    start_date: DAY,
    end_date: DAY,
    last_computed_at: computed,
    values: [[value]],
    segments: [],
  };
}

describe('LogYourBody daily MRR chart', () => {
  it('discovers the provider day resolution and rejects ambiguous options', () => {
    expect(
      parseLybMrrDayResolution({
        object: 'chart_options',
        resolutions: [{ id: 'day', display_name: 'day' }],
      })
    ).toBe('day');
    expect(() =>
      parseLybMrrDayResolution({
        object: 'chart_options',
        resolutions: [],
      })
    ).toThrow();
  });

  it('records one dated gross recurring USD value with provenance', () => {
    expect(
      parseLybMrrChart(chart(), 'proj_lyb', '2026-09-24', NOW)
    ).toMatchObject({
      product: 'logyourbody',
      definition: 'active-paid-subscriptions-monthly-normalized-gross',
      currency: 'USD',
      asOfDate: '2026-09-24',
      observedAt: '2026-09-24T04:00:00.000Z',
      state: 'fresh',
      mrrCents: 4250,
      source: { provider: 'revenuecat', metric: 'mrr', projectId: 'proj_lyb' },
    });
  });

  it('preserves measured zero and suppresses stale values', () => {
    expect(
      parseLybMrrChart(chart(0), 'proj_lyb', '2026-09-24', NOW).mrrCents
    ).toBe(0);
    const stale = parseLybMrrChart(
      chart(42.5, Date.parse('2026-09-24T01:00:00Z')),
      'proj_lyb',
      '2026-09-24',
      new Date('2026-09-26T01:00:00Z')
    );
    expect(stale).toMatchObject({ state: 'stale', mrrCents: null });
  });

  it('rejects ambiguous or invalid daily points', () => {
    const invalid = [
      { ...chart(), values: [[]] },
      { ...chart(), values: [[1, 2]] },
      { ...chart(), values: [[-1]] },
      { ...chart(), yaxis_currency: 'EUR' },
      { ...chart(), resolution: 'week' },
      { ...chart(), last_computed_at: NOW.getTime() + 1 },
      { ...chart(), segments: [{ id: 'a' }, { id: 'b' }] },
      { ...chart(), user_selectors: { revenue_type: 'proceeds' } },
    ];
    for (const payload of invalid) {
      expect(() =>
        parseLybMrrChart(payload, 'proj_lyb', '2026-09-24', NOW)
      ).toThrow();
    }
  });
});
