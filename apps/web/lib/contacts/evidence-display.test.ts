import { describe, expect, it } from 'vitest';
import { evidenceConfidenceLabel } from './evidence-display';

describe('evidenceConfidenceLabel', () => {
  it('never shows a stale fact as currently confident', () => {
    const label = evidenceConfidenceLabel({
      confidence: 0.9,
      freshness: 'stale',
    });
    expect(label).toBe('Stale, recheck (was 90%)');
    expect(label).not.toMatch(/90% confidence/);
  });

  it('shows confidence for fresh facts and flags unknown age', () => {
    expect(
      evidenceConfidenceLabel({ confidence: 0.9, freshness: 'fresh' })
    ).toBe('90% confidence');
    expect(
      evidenceConfidenceLabel({ confidence: 0.5, freshness: 'unknown' })
    ).toBe('50% confidence · age unknown');
    expect(
      evidenceConfidenceLabel({ confidence: null, freshness: 'fresh' })
    ).toBe('Confidence unknown');
    expect(
      evidenceConfidenceLabel({ confidence: null, freshness: 'stale' })
    ).toBe('Stale, recheck');
  });
});
