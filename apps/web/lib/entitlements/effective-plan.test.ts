import { describe, expect, it } from 'vitest';
import { getEffectivePlan } from './effective-plan';
import {
  getAllPlanIds,
  getEffectivePlan as getEffectivePlanFromRegistry,
} from './registry';

describe('effective plan entitlement boundary', () => {
  const cases = [
    ...getAllPlanIds().map(plan => [plan, plan] as const),
    ['founding', 'founding'],
    ['growth', 'growth'],
    ['unknown-plan', 'unknown-plan'],
    [' ', ' '],
    ['', 'free'],
    [null, 'free'],
    [undefined, 'free'],
  ] as const;

  it.each(cases)(
    'preserves the entitled stored plan %s without changing normalization',
    (plan, expected) => {
      expect(getEffectivePlan(plan, true)).toBe(expected);
      expect(getEffectivePlanFromRegistry(plan, true)).toBe(expected);
    }
  );

  it.each(cases)('falls back to Free without entitlement for %s', plan => {
    expect(getEffectivePlan(plan, false)).toBe('free');
    expect(getEffectivePlanFromRegistry(plan, false)).toBe('free');
  });
});
