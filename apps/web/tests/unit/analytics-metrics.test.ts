import { describe, expect, it } from 'vitest';
import {
  CANONICAL_METRICS,
  type CanonicalMetricKey,
  computeCaptureRate,
  computeCtr,
  computeRatePercent,
  computeUniqueVisitorShare,
} from '@/lib/analytics/metrics';

// ---------------------------------------------------------------------------
// Canonical metric definitions
// ---------------------------------------------------------------------------

describe('CANONICAL_METRICS', () => {
  it('every metric has a label, definition, source, valueType, and unit', () => {
    for (const [key, def] of Object.entries(CANONICAL_METRICS)) {
      expect(def.label, `${key}.label`).toBeTruthy();
      expect(def.definition, `${key}.definition`).toBeTruthy();
      expect(def.source, `${key}.source`).toBeTruthy();
      expect(['count', 'rate'], `${key}.valueType`).toContain(def.valueType);
      expect(['views', 'people', 'clicks', 'percent'], `${key}.unit`).toContain(
        def.unit
      );
    }
  });

  it('rate metrics are expressed in percent and document their formula', () => {
    const rateKeys = (
      Object.keys(CANONICAL_METRICS) as CanonicalMetricKey[]
    ).filter(key => CANONICAL_METRICS[key].valueType === 'rate');

    expect(rateKeys.sort()).toEqual(['capture_rate', 'ctr']);
    for (const key of rateKeys) {
      expect(CANONICAL_METRICS[key].unit).toBe('percent');
      expect(CANONICAL_METRICS[key].source).toContain('derived:');
    }
  });
});

// ---------------------------------------------------------------------------
// Derived-rate helpers
// ---------------------------------------------------------------------------

describe('computeRatePercent', () => {
  it('computes (numerator / denominator) * 100 rounded to 1 decimal by default', () => {
    expect(computeRatePercent(1, 3)).toBe(33.3);
    expect(computeRatePercent(50, 200)).toBe(25);
  });

  it('returns 0 when the denominator is zero or negative', () => {
    expect(computeRatePercent(10, 0)).toBe(0);
    expect(computeRatePercent(10, -5)).toBe(0);
  });

  it('returns 0 for non-finite inputs', () => {
    expect(computeRatePercent(Number.NaN, 10)).toBe(0);
    expect(computeRatePercent(10, Number.NaN)).toBe(0);
    expect(computeRatePercent(10, Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('supports custom decimal precision', () => {
    expect(computeRatePercent(1, 3, 0)).toBe(33);
    expect(computeRatePercent(1, 3, 2)).toBe(33.33);
  });

  it('supports negative numerators (growth deltas)', () => {
    expect(computeRatePercent(-1, 4, 0)).toBe(-25);
  });
});

describe('computeCaptureRate', () => {
  it('matches the legacy dashboard formula: round((subs / unique) * 1000) / 10', () => {
    for (const [subs, unique] of [
      [20, 80],
      [1, 3],
      [7, 9],
      [0, 100],
    ]) {
      const legacy = unique > 0 ? Math.round((subs / unique) * 1000) / 10 : 0;
      expect(computeCaptureRate(subs, unique)).toBe(legacy);
    }
  });

  it('returns 0 with no unique visitors', () => {
    expect(computeCaptureRate(5, 0)).toBe(0);
  });
});

describe('computeCtr', () => {
  it('derives clicks over views as a percentage', () => {
    expect(computeCtr(25, 100)).toBe(25);
    expect(computeCtr(1, 3)).toBe(33.3);
    expect(computeCtr(10, 0)).toBe(0);
  });
});

describe('computeUniqueVisitorShare', () => {
  it('matches the legacy funnel formula: round((unique / views) * 100)', () => {
    for (const [unique, views] of [
      [80, 100],
      [1, 3],
      [2, 3],
    ]) {
      const legacy = Math.round((unique / views) * 100);
      expect(computeUniqueVisitorShare(unique, views)).toBe(legacy);
    }
  });
});
