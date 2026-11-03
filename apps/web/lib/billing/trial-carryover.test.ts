import { describe, expect, it } from 'vitest';
import {
  resolveTrialCarryEnd,
  STRIPE_CHECKOUT_MIN_TRIAL_MS,
  toStripeTrialEnd,
} from './trial-carryover';

const NOW = new Date('2026-10-25T00:00:00.000Z');
const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

describe('mid-trial upgrade carry-over', () => {
  it('defers the first charge to the entitlement trial end', () => {
    const end = at(5 * 24 * 3_600_000 + 456);
    const carried = resolveTrialCarryEnd({
      isTrialing: true,
      trialEndsAt: end,
      now: NOW,
    });
    expect(carried?.toISOString()).toBe('2026-10-30T00:00:00.000Z');
    expect(toStripeTrialEnd(carried as Date)).toBe(
      Math.floor(Date.parse('2026-10-30T00:00:00.000Z') / 1000)
    );
  });

  it('charges today when not trialing or the trial has under the Stripe minimum left', () => {
    expect(
      resolveTrialCarryEnd({
        isTrialing: false,
        trialEndsAt: at(9e9),
        now: NOW,
      })
    ).toBeNull();
    expect(
      resolveTrialCarryEnd({ isTrialing: true, trialEndsAt: null, now: NOW })
    ).toBeNull();
    expect(
      resolveTrialCarryEnd({
        isTrialing: true,
        trialEndsAt: at(STRIPE_CHECKOUT_MIN_TRIAL_MS - 1000),
        now: NOW,
      })
    ).toBeNull();
    expect(
      resolveTrialCarryEnd({
        isTrialing: true,
        trialEndsAt: 'not-a-date',
        now: NOW,
      })
    ).toBeNull();
  });
});
