import { describe, expect, it } from 'vitest';
import { calculateConversionRate } from '@/features/dashboard/organisms/AnalyticsSidebar';

describe('calculateConversionRate', () => {
  it('returns percentage when both values are positive', () => {
    expect(calculateConversionRate(1, 3)).toBe('33%');
  });

  it('returns 100% when values are equal', () => {
    expect(calculateConversionRate(5, 5)).toBe('100%');
  });

  it('returns 0% when current is 0 and previous is positive', () => {
    expect(calculateConversionRate(0, 1)).toBe('0%');
    expect(calculateConversionRate(0, 100)).toBe('0%');
  });

  it('returns null when previous is 0 (avoids division by zero)', () => {
    expect(calculateConversionRate(0, 0)).toBeNull();
    expect(calculateConversionRate(5, 0)).toBeNull();
  });

  it('rounds to nearest integer percentage', () => {
    expect(calculateConversionRate(1, 3)).toBe('33%');
    expect(calculateConversionRate(2, 3)).toBe('67%');
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

  it('PV=3, UV=1, F=0 → 33% between PV↔UV, 0% between UV↔F', () => {
    const rates = computeFunnelRates([
      { value: 3 },
      { value: 1 },
      { value: 0 },
    ]);
    expect(rates).toEqual(['33%', '0%', null]);
  });

  it('PV=0, UV=0, F=0 → all null (no division by zero)', () => {
    const rates = computeFunnelRates([
      { value: 0 },
      { value: 0 },
      { value: 0 },
    ]);
    expect(rates).toEqual([null, null, null]);
  });

  it('PV=100, UV=0, F=0 → 0% then null', () => {
    const rates = computeFunnelRates([
      { value: 100 },
      { value: 0 },
      { value: 0 },
    ]);
    expect(rates).toEqual(['0%', null, null]);
  });

  it('PV=5, UV=5, F=5 → 100% and 100%', () => {
    const rates = computeFunnelRates([
      { value: 5 },
      { value: 5 },
      { value: 5 },
    ]);
    expect(rates).toEqual(['100%', '100%', null]);
  });

  it('PV=10, UV=3, F=1 → 30% and 33%', () => {
    const rates = computeFunnelRates([
      { value: 10 },
      { value: 3 },
      { value: 1 },
    ]);
    expect(rates).toEqual(['30%', '33%', null]);
  });
});
