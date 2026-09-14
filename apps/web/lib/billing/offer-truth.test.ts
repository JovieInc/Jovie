import { describe, expect, it } from 'vitest';
import { ENTITLEMENT_REGISTRY } from '@/lib/entitlements/registry';
import {
  ARTIST_VISIBILITY_OFFER,
  FREE_PROFILE_TRUTH,
  formatAnnualMonthlyEquivalent,
  formatUsdAmount,
  getMaxOfferBadge,
  getMaxOfferStatus,
  getPaidPlanPriceUsd,
  getPlanCtaLabel,
  getPlanOfferNote,
  getPlanSignupHref,
  isMaxPurchaseEnabled,
  isSelfServiceOffer,
  validateBillingInterval,
} from './offer-truth';

describe('Artist Visibility offer contract', () => {
  it('uses the same $199 monthly price in public claims and Pro entitlements', () => {
    expect(getPaidPlanPriceUsd('pro', 'month')).toBe(199);
    expect(ENTITLEMENT_REGISTRY.pro.marketing.price).toEqual({
      monthly: 199,
      yearly: null,
    });
    expect(getPlanSignupHref('pro', 'month')).toBe(
      '/signup?plan=pro&interval=month'
    );
    expect(ARTIST_VISIBILITY_OFFER.enterprise).toMatchObject({
      checkout: false,
      href: 'mailto:support@jov.ie',
    });
  });
  it('rejects stale annual and Max signup offers', () => {
    expect(() => getPlanSignupHref('pro', 'year')).toThrow();
    expect(() => getPlanSignupHref('max')).toThrow();
    expect(() => getPaidPlanPriceUsd('max', 'month')).toThrow();
    expect(() => getPaidPlanPriceUsd('pro', 'year')).toThrow();
    expect(isMaxPurchaseEnabled()).toBe(false);
  });
  it('retains public identity and capture after downgrade without promising recurring sends', () => {
    expect(ARTIST_VISIBILITY_OFFER.free).toMatchObject({
      profileLifetime: 'forever',
      downgrade: 'branded',
      audienceCapture: true,
    });
    expect(FREE_PROFILE_TRUTH).toContain('forever');
    expect(ARTIST_VISIBILITY_OFFER.fanSends).toMatchObject({
      paidSendingEnabled: false,
      defaultSpendCapUsd: 0,
      recurringAllowance: null,
      freeTrialEmailAllowance: 50,
    });
  });
  it('normalizes only approved self-service checkout intent', () => {
    expect(isSelfServiceOffer('free')).toBe(true);
    expect(isSelfServiceOffer('pro', 'monthly')).toBe(true);
    expect(isSelfServiceOffer('pro', 'year')).toBe(false);
    expect(isSelfServiceOffer('max')).toBe(false);
    expect(isSelfServiceOffer('enterprise')).toBe(false);
    expect(isSelfServiceOffer('team')).toBe(false);
    expect(isSelfServiceOffer(null)).toBe(false);
  });
  it('presents the free/trial and contact-sales choices without paid Max claims', () => {
    expect(getPlanSignupHref('free')).toBe('/signup?plan=free');
    expect(getPlanCtaLabel('free')).toBe('Claim your profile');
    expect(getPlanCtaLabel('pro')).toBe('Start 14-day Pro trial');
    expect(getPlanCtaLabel('enterprise')).toBe('Contact sales');
    expect(getPlanOfferNote('free')).toContain('free forever');
    expect(getPlanOfferNote('pro')).toContain('No credit card');
    expect(getPlanOfferNote('enterprise')).toContain('contact sales');
    expect(getMaxOfferStatus()).toBe('contact_sales');
    expect(getMaxOfferBadge()).toBe('Contact sales');
    expect(() => getPlanSignupHref('enterprise')).toThrow();
  });
  it('uses canonical currency display and normalizes legacy interval aliases', () => {
    expect(formatUsdAmount(199)).toBe('$199');
    expect(formatUsdAmount(31.25)).toBe('$31.25');
    expect(formatAnnualMonthlyEquivalent(375)).toBe('$31.25/mo');
    expect(validateBillingInterval('annual')).toBe('year');
    expect(validateBillingInterval('yearly')).toBe('year');
    expect(validateBillingInterval('weekly')).toBeNull();
  });
});
