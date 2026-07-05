import { describe, expect, it } from 'vitest';
import { clampRangeToRetention as clampRange } from '@/lib/analytics/time-range';

/**
 * Tests for the canonical analytics range clamping logic
 * (`@/lib/analytics/time-range`), used by the analytics API route.
 */

describe('clampRange', () => {
  describe('free plan (7 days retention)', () => {
    const retention = 7;

    it('allows 1d range', () => {
      expect(clampRange('1d', retention)).toBe('1d');
    });

    it('allows 7d range', () => {
      expect(clampRange('7d', retention)).toBe('7d');
    });

    it('clamps 30d to 7d', () => {
      expect(clampRange('30d', retention)).toBe('7d');
    });

    it('clamps 90d to 7d', () => {
      expect(clampRange('90d', retention)).toBe('7d');
    });

    it('clamps "all" to 7d', () => {
      expect(clampRange('all', retention)).toBe('7d');
    });
  });

  describe('pro plan (90 days retention)', () => {
    const retention = 90;

    it('allows 1d range', () => {
      expect(clampRange('1d', retention)).toBe('1d');
    });

    it('allows 7d range', () => {
      expect(clampRange('7d', retention)).toBe('7d');
    });

    it('allows 30d range', () => {
      expect(clampRange('30d', retention)).toBe('30d');
    });

    it('allows 90d range', () => {
      expect(clampRange('90d', retention)).toBe('90d');
    });

    it('clamps "all" to 90d', () => {
      expect(clampRange('all', retention)).toBe('90d');
    });
  });

  describe('growth plan (365 days retention)', () => {
    const retention = 365;

    it('allows all ranges', () => {
      expect(clampRange('1d', retention)).toBe('1d');
      expect(clampRange('7d', retention)).toBe('7d');
      expect(clampRange('30d', retention)).toBe('30d');
      expect(clampRange('90d', retention)).toBe('90d');
      expect(clampRange('all', retention)).toBe('all');
    });
  });
});
