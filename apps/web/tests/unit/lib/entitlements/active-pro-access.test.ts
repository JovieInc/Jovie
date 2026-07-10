import { describe, expect, it } from 'vitest';
import { hasActiveProAccess } from '@/lib/entitlements/registry';

describe('hasActiveProAccess', () => {
  const now = new Date('2026-07-10T12:00:00.000Z');

  it('grants access to paid users regardless of trial fields', () => {
    expect(
      hasActiveProAccess({
        isPro: true,
        plan: 'pro',
        trialEndsAt: null,
        now,
      })
    ).toBe(true);
  });

  it('grants access to an active trial even when the legacy isPro flag is false', () => {
    expect(
      hasActiveProAccess({
        isPro: false,
        plan: 'trial',
        trialEndsAt: new Date('2026-07-11T12:00:00.000Z'),
        now,
      })
    ).toBe(true);
  });

  it('denies expired trials and free users', () => {
    expect(
      hasActiveProAccess({
        isPro: false,
        plan: 'trial',
        trialEndsAt: new Date('2026-07-10T11:59:59.000Z'),
        now,
      })
    ).toBe(false);
    expect(
      hasActiveProAccess({
        isPro: false,
        plan: 'free',
        trialEndsAt: null,
        now,
      })
    ).toBe(false);
  });
});
