import { describe, expect, it } from 'vitest';
import {
  DEFAULT_UPSELL_PLAN,
  GROWTH_FOLLOWER_THRESHOLD,
  recommendPlan,
} from '@/lib/auth/plan-intent';

describe('recommendPlan', () => {
  it('returns pro for null followers', () => {
    expect(recommendPlan(null)).toBe('pro');
  });

  it('returns pro for 0 followers', () => {
    expect(recommendPlan(0)).toBe('pro');
  });

  it('returns pro for low follower counts', () => {
    expect(recommendPlan(500)).toBe('pro');
  });

  it('returns pro just below the threshold', () => {
    expect(recommendPlan(GROWTH_FOLLOWER_THRESHOLD - 1)).toBe('pro');
  });

  it('returns growth at the threshold', () => {
    expect(recommendPlan(GROWTH_FOLLOWER_THRESHOLD)).toBe('growth');
  });

  it('returns growth above the threshold', () => {
    expect(recommendPlan(50_000)).toBe('growth');
  });
});

describe('DEFAULT_UPSELL_PLAN', () => {
  it('is pro', () => {
    expect(DEFAULT_UPSELL_PLAN).toBe('pro');
  });
});

describe('GROWTH_FOLLOWER_THRESHOLD', () => {
  it('is 10,000', () => {
    expect(GROWTH_FOLLOWER_THRESHOLD).toBe(10_000);
  });
});
