import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLS_INTERACTION_BUDGET,
  assertClsWithinBudget,
  shouldSkipClsInDevMode,
  sumLayoutShiftEntries,
} from '../../helpers/cls-measurement';

describe('cls-measurement helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses a 0.05 interaction CLS budget', () => {
    expect(CLS_INTERACTION_BUDGET).toBe(0.05);
  });

  it('skips CLS measurement outside CI', () => {
    vi.stubEnv('CI', undefined);
    expect(shouldSkipClsInDevMode()).toBe(true);
  });

  it('allows CLS measurement in CI', () => {
    vi.stubEnv('CI', 'true');
    expect(shouldSkipClsInDevMode()).toBe(false);
  });

  it('sums layout-shift entries excluding recent input', () => {
    const entries = [
      { value: 0.02, hadRecentInput: false },
      { value: 0.01, hadRecentInput: true },
      { value: 0.03, hadRecentInput: false },
    ] as unknown as PerformanceEntryList;

    expect(sumLayoutShiftEntries(entries)).toBeCloseTo(0.05);
  });

  it('throws when CLS exceeds budget', () => {
    expect(() => assertClsWithinBudget(0.06, 0.05, 'drawer open')).toThrow(
      /drawer open/
    );
  });
});