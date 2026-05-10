import { describe, expect, it } from 'vitest';
import {
  computeMercuryDefaultStatus,
  computeReliabilityScore,
} from '@/lib/admin/hud-metric-derivations';

// ---------------------------------------------------------------------------
// reliabilityScorePercent derivation
// ---------------------------------------------------------------------------
describe('reliabilityScorePercent derivation', () => {
  it('returns 100 when errorRatePercent is 0', () => {
    expect(computeReliabilityScore(0)).toBe(100);
  });

  it('returns 95 when errorRatePercent is 5', () => {
    expect(computeReliabilityScore(5)).toBe(95);
  });

  it('clamps to 0 when errorRatePercent exceeds 100', () => {
    expect(computeReliabilityScore(110)).toBe(0);
  });

  it('clamps to 100 when errorRatePercent is negative', () => {
    expect(computeReliabilityScore(-5)).toBe(100);
  });

  it('returns 50 when errorRatePercent is 50', () => {
    expect(computeReliabilityScore(50)).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Mercury defaultStatus derivation
// ---------------------------------------------------------------------------
describe('Mercury defaultStatus derivation', () => {
  it('returns unknown when Mercury is unavailable', () => {
    expect(computeMercuryDefaultStatus(false, 0, 0)).toBe('unknown');
  });

  it('returns unknown when Mercury is unavailable even with non-zero values', () => {
    expect(computeMercuryDefaultStatus(false, 100_000, 50_000)).toBe('unknown');
  });

  it('returns alive when balance > burn and Mercury is available', () => {
    expect(computeMercuryDefaultStatus(true, 100_000, 50_000)).toBe('alive');
  });

  it('returns dead when balance <= burn and Mercury is available', () => {
    expect(computeMercuryDefaultStatus(true, 40_000, 50_000)).toBe('dead');
  });

  it('returns dead when balance equals burn', () => {
    expect(computeMercuryDefaultStatus(true, 50_000, 50_000)).toBe('dead');
  });
});
