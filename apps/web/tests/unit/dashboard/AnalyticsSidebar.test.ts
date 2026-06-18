import { describe, expect, it } from 'vitest';
import { calculateConversionRate } from '@/features/dashboard/organisms/AnalyticsSidebar';

// calculateConversionRate now delegates to formatAnalyticsStageRate, which
// SUPPRESSES vanity percents on small bases (base < MIN_SAMPLE_FOR_PERCENT_DELTA,
// currently 30). A small denominator turns conversion into noise like "1200%",
// so we hide the percent entirely (return null) until the base is large enough
// to be meaningful. These tests assert that suppression behavior.
describe('calculateConversionRate', () => {
  it('suppresses the percent when the base is below the sample threshold', () => {
    // base < 30 → vanity noise, hide it
    expect(calculateConversionRate(1, 3)).toBeNull();
    expect(calculateConversionRate(5, 5)).toBeNull();
    expect(calculateConversionRate(2, 3)).toBeNull();
    expect(calculateConversionRate(0, 1)).toBeNull();
  });

  it('returns a percentage when the base meets the sample threshold', () => {
    expect(calculateConversionRate(1, 30)).toBe('3%');
    expect(calculateConversionRate(10, 30)).toBe('33%');
  });

  it('returns 100% when values are equal and the base is large enough', () => {
    expect(calculateConversionRate(30, 30)).toBe('100%');
    expect(calculateConversionRate(50, 50)).toBe('100%');
  });

  it('returns 0% when current is 0 and the base meets the threshold', () => {
    expect(calculateConversionRate(0, 30)).toBe('0%');
    expect(calculateConversionRate(0, 100)).toBe('0%');
  });

  it('returns null when previous is 0 (avoids division by zero)', () => {
    expect(calculateConversionRate(0, 0)).toBeNull();
    expect(calculateConversionRate(5, 0)).toBeNull();
  });

  it('rounds to nearest integer percentage on a qualifying base', () => {
    expect(calculateConversionRate(10, 30)).toBe('33%');
    expect(calculateConversionRate(20, 30)).toBe('67%');
  });
});

describe('funnel stage conversion rate mapping', () => {
  // Simulates the stage-mapping logic from AnalyticsSidebar
  function computeFunnelRates(stages: { value: number }[]) {
    return stages.map((stage, index) => {
      const isLast = index === stages.length - 1;
      const nextStage = !isLast ? stages[index + 1] : null;
      return nextStage
        ? calculateConversionRate(nextStage.value, stage.value)
        : null;
    });
  }

  it('PV=3, UV=1, F=0 → percents suppressed on small bases', () => {
    const rates = computeFunnelRates([
      { value: 3 },
      { value: 1 },
      { value: 0 },
    ]);
    expect(rates).toEqual([null, null, null]);
  });

  it('PV=0, UV=0, F=0 → all null (no division by zero)', () => {
    const rates = computeFunnelRates([
      { value: 0 },
      { value: 0 },
      { value: 0 },
    ]);
    expect(rates).toEqual([null, null, null]);
  });

  it('PV=100, UV=0, F=0 → 0% on qualifying base, then null', () => {
    const rates = computeFunnelRates([
      { value: 100 },
      { value: 0 },
      { value: 0 },
    ]);
    expect(rates).toEqual(['0%', null, null]);
  });

  it('PV=5, UV=5, F=5 → percents suppressed on small bases', () => {
    const rates = computeFunnelRates([
      { value: 5 },
      { value: 5 },
      { value: 5 },
    ]);
    expect(rates).toEqual([null, null, null]);
  });

  it('PV=10, UV=3, F=1 → percents suppressed on small bases', () => {
    const rates = computeFunnelRates([
      { value: 10 },
      { value: 3 },
      { value: 1 },
    ]);
    expect(rates).toEqual([null, null, null]);
  });

  it('PV=100, UV=30, F=30 → percents shown once the base qualifies', () => {
    const rates = computeFunnelRates([
      { value: 100 },
      { value: 30 },
      { value: 30 },
    ]);
    expect(rates).toEqual(['30%', '100%', null]);
  });
});
