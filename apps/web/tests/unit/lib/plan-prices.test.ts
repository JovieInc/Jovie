import { describe, expect, it } from 'vitest';
import { PLAN_PRICES, toCents } from '@/lib/config/plan-prices';

describe('toCents', () => {
  it('converts whole dollars to cents', () => {
    expect(toCents(20)).toBe(2000);
    expect(toCents(200)).toBe(20000);
    expect(toCents(192)).toBe(19200);
    expect(toCents(1920)).toBe(192000);
  });

  it('handles zero', () => {
    expect(toCents(0)).toBe(0);
  });

  it('rounds correctly for fractional dollars (float safety)', () => {
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(9.99)).toBe(999);
    expect(toCents(0.01)).toBe(1);
  });

  it('always returns an integer', () => {
    for (const tier of Object.values(PLAN_PRICES)) {
      expect(Number.isInteger(toCents(tier.monthly))).toBe(true);
      expect(Number.isInteger(toCents(tier.yearly))).toBe(true);
    }
  });
});

describe('PLAN_PRICES', () => {
  it('all prices are positive', () => {
    for (const tier of Object.values(PLAN_PRICES)) {
      expect(tier.monthly).toBeGreaterThan(0);
      expect(tier.yearly).toBeGreaterThan(0);
    }
  });

  it('yearly is a discount over 12x monthly', () => {
    for (const tier of Object.values(PLAN_PRICES)) {
      expect(tier.yearly).toBeLessThan(tier.monthly * 12);
    }
  });

  it('pro is cheaper than max', () => {
    expect(PLAN_PRICES.pro.monthly).toBeLessThan(PLAN_PRICES.max.monthly);
    expect(PLAN_PRICES.pro.yearly).toBeLessThan(PLAN_PRICES.max.yearly);
  });
});
