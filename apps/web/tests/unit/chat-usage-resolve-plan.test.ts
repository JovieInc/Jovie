import { describe, expect, it } from 'vitest';

/**
 * resolvePlan is a private function in the chat usage route.
 * We extract and test its logic here to ensure legacy plan names
 * are correctly mapped.
 */
function resolvePlan(plan: string | null | undefined): 'free' | 'pro' | 'max' {
  if (plan === 'max' || plan === 'growth') {
    return 'max';
  }
  if (plan === 'pro' || plan === 'founding') {
    return 'pro';
  }
  return 'free';
}

describe('resolvePlan', () => {
  it('maps "free" to free', () => {
    expect(resolvePlan('free')).toBe('free');
  });

  it('maps "pro" to pro', () => {
    expect(resolvePlan('pro')).toBe('pro');
  });

  it('maps legacy "founding" to pro', () => {
    expect(resolvePlan('founding')).toBe('pro');
  });

  it('maps "max" to max', () => {
    expect(resolvePlan('max')).toBe('max');
  });

  it('maps legacy "growth" to max', () => {
    expect(resolvePlan('growth')).toBe('max');
  });

  it('maps null to free', () => {
    expect(resolvePlan(null)).toBe('free');
  });

  it('maps undefined to free', () => {
    expect(resolvePlan(undefined)).toBe('free');
  });

  it('maps unknown string to free', () => {
    expect(resolvePlan('unknown')).toBe('free');
  });
});
