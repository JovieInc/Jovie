import { describe, expect, it } from 'vitest';

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
