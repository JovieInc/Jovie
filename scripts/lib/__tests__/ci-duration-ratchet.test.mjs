import { describe, expect, it } from 'vitest';
import {
  checkRatchet,
  computeElapsedSeconds,
  computeP95,
  computePercentile,
  formatDuration,
  RATCHET_SCHEMA_VERSION,
  validateDurationRatchet,
} from '../ci-duration-ratchet.mjs';

describe('computeP95', () => {
  it('returns 0 for an empty array', () => {
    expect(computeP95([])).toBe(0);
  });

  it('returns the single value for a one-element array', () => {
    expect(computeP95([120])).toBe(120);
  });

  it('returns the highest value for a two-element array', () => {
    // ceil(0.95 * 2) - 1 = ceil(1.9) - 1 = 2 - 1 = 1 → sorted[1] = 200
    expect(computeP95([100, 200])).toBe(200);
  });

  it('computes correct p95 for 20 elements', () => {
    // 20 elements: ceil(0.95 * 20) = ceil(19) = 19 → index 18 (0-based)
    const durations = Array.from({ length: 20 }, (_, i) => (i + 1) * 10);
    // sorted: [10, 20, ..., 200]. Index 18 = 190
    expect(computeP95(durations)).toBe(190);
  });

  it('handles unsorted input', () => {
    const durations = [500, 100, 300, 200, 400];
    // sorted: [100,200,300,400,500]. ceil(0.95*5)=ceil(4.75)=5 → index 4 = 500
    expect(computeP95(durations)).toBe(500);
  });

  it('does not mutate the input array', () => {
    const input = [300, 100, 200];
    computeP95(input);
    expect(input).toEqual([300, 100, 200]);
  });
});

describe('computePercentile', () => {
  it('returns 0 for empty or invalid input', () => {
    expect(computePercentile([], 50)).toBe(0);
    expect(computePercentile([10, 20], 0)).toBe(0);
    expect(computePercentile([10, 20], Number.NaN)).toBe(0);
  });

  it('computes p50/p75/p95 (nearest-rank) for a 5-element array', () => {
    const xs = [10, 20, 30, 40, 50];
    // p50: ceil(0.50*5)-1 = 3-1 = 2 → 30
    expect(computePercentile(xs, 50)).toBe(30);
    // p75: ceil(0.75*5)-1 = 4-1 = 3 → 40
    expect(computePercentile(xs, 75)).toBe(40);
    // p95: ceil(0.95*5)-1 = 5-1 = 4 → 50
    expect(computePercentile(xs, 95)).toBe(50);
  });

  it('handles unsorted input without mutating it', () => {
    const xs = [50, 10, 40, 20, 30];
    expect(computePercentile(xs, 50)).toBe(30);
    expect(xs).toEqual([50, 10, 40, 20, 30]);
  });

  it('clamps p > 100 to the max value', () => {
    expect(computePercentile([1, 2, 3], 150)).toBe(3);
  });

  it('computeP95 is computePercentile(., 95)', () => {
    const xs = Array.from({ length: 37 }, (_, i) => i * 7 + 3);
    expect(computeP95(xs)).toBe(computePercentile(xs, 95));
    expect(computeP95([])).toBe(computePercentile([], 95));
    expect(computeP95([42])).toBe(computePercentile([42], 95));
  });
});

describe('formatDuration', () => {
  it('formats seconds-only', () => {
    expect(formatDuration(45)).toBe('45s');
  });

  it('formats minutes-only', () => {
    expect(formatDuration(120)).toBe('2m');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(905)).toBe('15m 5s');
  });

  it('rounds fractional seconds', () => {
    expect(formatDuration(61.6)).toBe('1m 2s');
  });
});

describe('checkRatchet', () => {
  const baseline = {
    schemaVersion: 1,
    slo: { p95GateSeconds: 900, marginFraction: 0.2 },
  };
  // ceiling = 900 * 1.2 = 1080

  it('returns ok=true when measured p95 is within ceiling', () => {
    const result = checkRatchet(800, baseline);
    expect(result.ok).toBe(true);
    expect(result.ceilingSeconds).toBe(1080);
    expect(result.headroomSeconds).toBe(280);
  });

  it('returns ok=true when measured p95 exactly equals ceiling', () => {
    const result = checkRatchet(1080, baseline);
    expect(result.ok).toBe(true);
    expect(result.headroomSeconds).toBe(0);
  });

  it('returns ok=false when measured p95 exceeds ceiling', () => {
    const result = checkRatchet(1100, baseline);
    expect(result.ok).toBe(false);
    expect(result.headroomSeconds).toBe(-20);
  });

  it('exposes baselineP95Seconds and marginFraction', () => {
    const result = checkRatchet(500, baseline);
    expect(result.baselineP95Seconds).toBe(900);
    expect(result.marginFraction).toBe(0.2);
  });
});

describe('computeElapsedSeconds', () => {
  it('computes elapsed seconds between two ISO timestamps', () => {
    const start = '2026-06-19T10:00:00Z';
    const end = '2026-06-19T10:15:00Z';
    expect(computeElapsedSeconds(start, end)).toBe(900);
  });

  it('clamps negative values to 0', () => {
    const start = '2026-06-19T10:15:00Z';
    const end = '2026-06-19T10:00:00Z';
    expect(computeElapsedSeconds(start, end)).toBe(0);
  });
});

describe('validateDurationRatchet', () => {
  const valid = {
    schemaVersion: RATCHET_SCHEMA_VERSION,
    slo: { p95GateSeconds: 900, marginFraction: 0.2 },
  };

  it('accepts a valid baseline', () => {
    expect(validateDurationRatchet(valid).ok).toBe(true);
    expect(validateDurationRatchet(valid).errors).toEqual([]);
  });

  it('rejects wrong schemaVersion', () => {
    const result = validateDurationRatchet({ ...valid, schemaVersion: 99 });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.includes('schemaVersion'))).toBe(true);
  });

  it('rejects missing slo', () => {
    const { slo: _slo, ...noSlo } = valid;
    const result = validateDurationRatchet(noSlo);
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.includes('slo'))).toBe(true);
  });

  it('rejects non-positive p95GateSeconds', () => {
    const result = validateDurationRatchet({
      ...valid,
      slo: { ...valid.slo, p95GateSeconds: 0 },
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.includes('p95GateSeconds'))).toBe(true);
  });

  it('rejects negative marginFraction', () => {
    const result = validateDurationRatchet({
      ...valid,
      slo: { ...valid.slo, marginFraction: -0.1 },
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.includes('marginFraction'))).toBe(true);
  });

  it('accepts zero marginFraction (exact p95 match required)', () => {
    const result = validateDurationRatchet({
      ...valid,
      slo: { ...valid.slo, marginFraction: 0 },
    });
    expect(result.ok).toBe(true);
  });

  it('rejects null input', () => {
    const result = validateDurationRatchet(null);
    expect(result.ok).toBe(false);
  });

  it('validates the committed baseline file', async () => {
    // Verify the actual baseline matches the schema so CI catches any hand-edits.
    const { readFileSync } = await import('node:fs');
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const baselinePath = resolve(
      __dirname,
      '../../../.github/ci-harness/duration-ratchet.json'
    );
    const committed = JSON.parse(readFileSync(baselinePath, 'utf8'));
    const result = validateDurationRatchet(committed);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
