import { describe, expect, it } from 'vitest';
import { PLAN_PRICES } from '@/lib/config/plan-prices';
import {
  formatAnnualMonthlyEquivalent,
  formatUsdAmount,
  getMaxOfferStatus,
  getPaidPlanPriceUsd,
  getPlanCtaLabel,
  getPlanOfferNote,
  getPlanSignupHref,
  PRO_TRIAL_DURATION_DAYS,
  PRO_TRIAL_TRUTH,
  validateBillingInterval,
} from './offer-truth';

describe('offer-truth (JOV-6202)', () => {
  it('keeps the implemented Pro trial at 14 days with no Max trial', () => {
    expect(PRO_TRIAL_DURATION_DAYS).toBe(14);
    expect(PRO_TRIAL_TRUTH).toMatch(/no credit card/i);
    expect(PRO_TRIAL_TRUTH).toMatch(/returns to Free/i);
    expect(getPlanCtaLabel('pro')).toBe('Start 14-day Pro trial');
    expect(getPlanCtaLabel('max')).not.toMatch(/trial/i);
    expect(getPlanOfferNote('max')).toMatch(/no Max trial/i);
  });

  it('publishes the canonical monthly and annual prices', () => {
    expect(getPaidPlanPriceUsd('pro', 'month')).toBe(PLAN_PRICES.pro.monthly);
    expect(getPaidPlanPriceUsd('pro', 'year')).toBe(PLAN_PRICES.pro.yearly);
    expect(getPaidPlanPriceUsd('max', 'month')).toBe(PLAN_PRICES.max.monthly);
    expect(getPaidPlanPriceUsd('max', 'year')).toBe(PLAN_PRICES.max.yearly);
    expect(PLAN_PRICES.pro.monthly).toBe(39);
    expect(PLAN_PRICES.max.monthly).toBe(149);
    expect(PLAN_PRICES.pro.yearly).toBe(375);
    expect(PLAN_PRICES.max.yearly).toBe(1430);
    expect(formatUsdAmount(PLAN_PRICES.pro.monthly)).toBe('$39');
    expect(formatAnnualMonthlyEquivalent(PLAN_PRICES.pro.yearly)).toBe(
      '$31.25/mo'
    );
    expect(formatAnnualMonthlyEquivalent(PLAN_PRICES.max.yearly)).toBe(
      '$119.17/mo'
    );
  });

  it('encodes plan and interval into signup checkout intent', () => {
    expect(getPlanSignupHref('free')).toBe('/signup?plan=free');
    expect(getPlanSignupHref('pro', 'month')).toBe(
      '/signup?plan=pro&interval=month'
    );
    expect(getPlanSignupHref('pro', 'year')).toBe(
      '/signup?plan=pro&interval=year'
    );
    expect(getPlanSignupHref('max', 'year')).toBe(
      '/signup?plan=max&interval=year'
    );
  });

  it('accepts published interval aliases', () => {
    expect(validateBillingInterval('month')).toBe('month');
    expect(validateBillingInterval('year')).toBe('year');
    expect(validateBillingInterval('annual')).toBe('year');
    expect(validateBillingInterval('weekly')).toBeNull();
  });

  it('uses the Max feature flag as the only availability status', () => {
    expect(['purchase', 'early_access']).toContain(getMaxOfferStatus());
  });
});
