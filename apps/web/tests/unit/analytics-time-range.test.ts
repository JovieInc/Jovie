import { describe, expect, it } from 'vitest';
import {
  ANALYTICS_EPOCH,
  ANALYTICS_RANGE_VALUES,
  clampRangeToRetention,
  getTimeRangeLabel,
  isAnalyticsRange,
  isRangeBeyondRetention,
  MS_PER_DAY,
  RECENT_ACTIVITY_RANGE,
  resolveRangeStart,
  resolveRangeStartOrEpoch,
} from '@/lib/analytics/time-range';

describe('resolveRangeStart', () => {
  const now = new Date('2026-07-04T12:00:00.000Z');

  it('returns rolling N x 24h boundaries with exact millisecond arithmetic', () => {
    expect(resolveRangeStart('1d', now)?.getTime()).toBe(
      now.getTime() - 1 * MS_PER_DAY
    );
    expect(resolveRangeStart('7d', now)?.getTime()).toBe(
      now.getTime() - 7 * MS_PER_DAY
    );
    expect(resolveRangeStart('30d', now)?.getTime()).toBe(
      now.getTime() - 30 * MS_PER_DAY
    );
    expect(resolveRangeStart('90d', now)?.getTime()).toBe(
      now.getTime() - 90 * MS_PER_DAY
    );
  });

  it('returns null (no lower bound) for all-time', () => {
    expect(resolveRangeStart('all', now)).toBeNull();
  });

  it('is immune to DST transitions (fixed 24h days, not calendar days)', () => {
    // 2026-03-08 is a US DST spring-forward date; a setDate()-based
    // implementation would produce a boundary that drifts by an hour.
    const afterDst = new Date('2026-03-10T12:00:00.000Z');
    const start = resolveRangeStart('7d', afterDst);
    expect(afterDst.getTime() - (start?.getTime() ?? 0)).toBe(7 * MS_PER_DAY);
  });

  it('all ranges share the same window rule (window sizes strictly increase)', () => {
    const bounded = ANALYTICS_RANGE_VALUES.filter(r => r !== 'all');
    const starts = bounded.map(r => resolveRangeStart(r, now)?.getTime() ?? 0);
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i]).toBeLessThan(starts[i - 1]);
    }
  });
});

describe('resolveRangeStartOrEpoch', () => {
  it('returns the epoch for all-time so SQL comparisons stay uniform', () => {
    expect(resolveRangeStartOrEpoch('all').getTime()).toBe(
      ANALYTICS_EPOCH.getTime()
    );
  });

  it('matches resolveRangeStart for bounded ranges', () => {
    const now = new Date('2026-07-04T12:00:00.000Z');
    expect(resolveRangeStartOrEpoch('7d', now).getTime()).toBe(
      resolveRangeStart('7d', now)?.getTime()
    );
  });
});

describe('isAnalyticsRange', () => {
  it('accepts every canonical range', () => {
    for (const range of ANALYTICS_RANGE_VALUES) {
      expect(isAnalyticsRange(range)).toBe(true);
    }
  });

  it('rejects unknown values', () => {
    expect(isAnalyticsRange('14d')).toBe(false);
    expect(isAnalyticsRange('')).toBe(false);
  });
});

describe('retention gating', () => {
  it('never gates when retention is unknown', () => {
    expect(isRangeBeyondRetention('all')).toBe(false);
  });

  it('gates ranges wider than the plan retention', () => {
    expect(isRangeBeyondRetention('30d', 7)).toBe(true);
    expect(isRangeBeyondRetention('7d', 7)).toBe(false);
    // 'all' requires a full year of retention
    expect(isRangeBeyondRetention('all', 90)).toBe(true);
    expect(isRangeBeyondRetention('all', 365)).toBe(false);
  });

  it('clamps a too-wide request to the widest allowed range', () => {
    expect(clampRangeToRetention('90d', 30)).toBe('30d');
    expect(clampRangeToRetention('all', 7)).toBe('7d');
    expect(clampRangeToRetention('7d', 30)).toBe('7d');
    expect(clampRangeToRetention('all', 365)).toBe('all');
  });
});

describe('labels', () => {
  it('provides all three label styles for every range', () => {
    for (const range of ANALYTICS_RANGE_VALUES) {
      expect(getTimeRangeLabel(range, 'short')).toBeTruthy();
      expect(getTimeRangeLabel(range, 'menu')).toBeTruthy();
      expect(getTimeRangeLabel(range, 'description')).toBeTruthy();
    }
  });

  it('uses sentence-case description copy', () => {
    expect(getTimeRangeLabel('7d', 'description')).toBe('Last 7 days');
    expect(getTimeRangeLabel('all', 'description')).toBe('All time');
  });
});

describe('recent activity window', () => {
  it('is a fixed 7-day rolling window', () => {
    expect(RECENT_ACTIVITY_RANGE).toBe('7d');
  });
});
