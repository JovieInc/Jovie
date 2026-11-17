import { describe, expect, it } from 'vitest';
import { shiftDate } from './contract';
import {
  DAILY_METRIC_KEYS,
  formatMetricValue,
  parseDailyMetrics,
  planDailyMetricSync,
} from './daily-metrics';

const NOW = Date.parse('2026-11-08T20:40:00Z');
const day = (date: string, final: boolean) => ({
  date,
  count: 1,
  final,
  observedAt: '2026-11-08T20:00:00.000Z',
});

describe('parseDailyMetrics', () => {
  it('keeps known metrics in order and falls back to all', () => {
    expect(parseDailyMetrics('ai_spend, signups,nope,signups')).toEqual([
      'ai_spend',
      'signups',
    ]);
    expect(parseDailyMetrics(null)).toEqual(DAILY_METRIC_KEYS);
    expect(parseDailyMetrics('__proto__')).toEqual(DAILY_METRIC_KEYS);
  });
});

describe('planDailyMetricSync', () => {
  it('always refreshes today and yesterday, then fills gaps within budget', () => {
    const stored = Object.fromEntries(
      [0, 1, 2, 3].map(back => {
        const date = shiftDate('2026-11-08', -back);
        return [date, day(date, back !== 3)];
      })
    );
    expect(planDailyMetricSync(NOW, stored, 4)).toEqual([
      '2026-11-08',
      '2026-11-07',
      '2026-11-05',
      '2026-11-04',
    ]);
  });

  it('backfills a cold store newest first and stops at the budget', () => {
    const plan = planDailyMetricSync(NOW, {}, 120);
    expect(plan).toHaveLength(120);
    expect(plan[0]).toBe('2026-11-08');
    expect(plan.at(-1)).toBe(shiftDate('2026-11-08', -119));
  });
});

describe('formatMetricValue', () => {
  it('formats counts and cents', () => {
    expect(formatMetricValue('count', 1234)).toBe('1,234');
    expect(formatMetricValue('usd_cents', 1234)).toBe('$12.34');
    expect(formatMetricValue('usd_cents', 123_456)).toBe('$1,235');
    expect(formatMetricValue('usd_cents', 4149, { wholeDollars: true })).toBe(
      '$41'
    );
  });
});
