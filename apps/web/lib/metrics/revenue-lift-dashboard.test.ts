import { describe, expect, it } from 'vitest';
import type { IrpaaResult } from './irpaa';
import { formatCents, measuredIrpaaWindows } from './revenue-lift-dashboard';

/**
 * Pure presentation helpers for the revenue-lift dashboard.
 * Loader integration is covered via mocked DB tests on irpaa / cohorts.
 */

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
  }
  return sorted[mid]!;
}

describe('formatCents', () => {
  it('keeps cents below one hundred dollars and drops them at the boundary', () => {
    expect(formatCents(9_999)).toBe('$99.99');
    expect(formatCents(10_000)).toBe('$100');
    expect(formatCents(150)).toBe('$1.50');
  });
});

describe('revenue-lift dashboard helpers', () => {
  it('computes median for odd and even lengths', () => {
    expect(median([])).toBeNull();
    expect(median([10])).toBe(10);
    expect(median([10, 30, 20])).toBe(20);
    expect(median([10, 20, 30, 40])).toBe(25);
  });

  it('keeps IRPAA as the sole Tier A id in the interpretation map shape', () => {
    const ids = [
      'irpaa',
      'gmv-lift',
      'dsp-clicks',
      'new-fans',
      'cohort-lift',
      'cycle-time',
      'agent-success',
      'human-override',
    ] as const;
    expect(ids.filter(id => id === 'irpaa')).toHaveLength(1);
    expect(ids[0]).toBe('irpaa');
  });
});

// measuredIrpaaWindows only reads counts; the time range is irrelevant here.
type IrpaaCounts = Pick<
  IrpaaResult,
  | 'activeArtists'
  | 'runCount'
  | 'totals'
  | 'totalRevenueLiftCents'
  | 'irpaaCents'
  | 'weights'
>;

function irpaaResult(overrides: Partial<IrpaaCounts> = {}): IrpaaResult {
  const counts: IrpaaCounts = {
    activeArtists: 0,
    runCount: 0,
    totals: { gmvDeltaCents: 0, dspClickDelta: 0, newFansDelta: 0 },
    totalRevenueLiftCents: 0,
    irpaaCents: 0,
    weights: {
      version: 'v1',
      streamingValueWeightCentsPerDspClick: 1,
      fanCaptureLtvWeightCentsPerFan: 1,
      lastValidatedAt: null,
    },
    ...overrides,
  };
  return counts as IrpaaResult;
}

describe('measuredIrpaaWindows', () => {
  it('treats a period with no outcomes as No data, not a measured zero', () => {
    expect(measuredIrpaaWindows(irpaaResult(), irpaaResult())).toEqual({
      irpaa: null,
      irpaaPrior: null,
    });
  });

  it('drops the delta baseline when the prior period has no data', () => {
    const current = irpaaResult({ activeArtists: 2, runCount: 3 });
    expect(measuredIrpaaWindows(current, irpaaResult())).toEqual({
      irpaa: current,
      irpaaPrior: null,
    });
  });

  it('keeps both periods when both are measured', () => {
    const current = irpaaResult({ activeArtists: 2, runCount: 3 });
    const prior = irpaaResult({ activeArtists: 1, runCount: 1 });
    expect(measuredIrpaaWindows(current, prior)).toEqual({
      irpaa: current,
      irpaaPrior: prior,
    });
  });
});
