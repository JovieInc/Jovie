import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertClsWithinBudget,
  CLS_INTERACTION_BUDGET,
  formatLayoutShiftAttribution,
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

  it('names the largest shifts and their sources first', () => {
    const message = formatLayoutShiftAttribution(
      [
        {
          startTime: 120,
          value: 0.01,
          sources: ['p.small 0,0 10x10 -> 0,4 10x10'],
        },
        {
          startTime: 900,
          value: 0.1257,
          sources: [
            'main.hero 0,0 390x844 -> 0,96 390x844',
            'nav 0,0 390x64 -> 0,0 390x96',
          ],
        },
        { startTime: 40, value: 0.02, sources: [] },
      ],
      2
    );

    expect(message.split('\n')).toEqual([
      '0.1257 @900ms: main.hero 0,0 390x844 -> 0,96 390x844; nav 0,0 390x64 -> 0,0 390x96',
      '0.0200 @40ms: (no source attribution)',
    ]);
  });

  it('reports an empty shift list explicitly', () => {
    expect(formatLayoutShiftAttribution([])).toBe('no layout-shift entries');
  });

  it('throws when CLS exceeds budget', () => {
    expect(() => assertClsWithinBudget(0.06, 0.05, 'drawer open')).toThrow(
      /drawer open/
    );
  });
});
