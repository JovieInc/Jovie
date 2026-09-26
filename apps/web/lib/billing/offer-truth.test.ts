import { describe, expect, it } from 'vitest';
import { ENTITLEMENT_REGISTRY } from '@/lib/entitlements/registry';
import {
  ARTIST_VISIBILITY_OFFER,
  ARTIST_VISIBILITY_OFFER_CONTRACT_ID,
  FORBIDDEN_PUBLIC_PRICING_PAGE_MARKERS,
  FREE_PROFILE_TRUTH,
  formatAnnualMonthlyEquivalent,
  formatPublicPriceDisplay,
  formatUsdAmount,
  getContactSalesHref,
  getMaxOfferBadge,
  getMaxOfferStatus,
  getPaidPlanPriceUsd,
  getPlanCtaHref,
  getPlanCtaLabel,
  getPlanOfferNote,
  getPlanSignupHref,
  getPublicPriceClaim,
  getPublicPriceClaims,
  hasPublicAnnualOffer,
  isMaxPurchaseEnabled,
  isSelfServiceOffer,
  PUBLIC_CUSTOM_PRICE_LABEL,
  validateBillingInterval,
} from './offer-truth';

describe('Artist Visibility offer contract', () => {
  it('locks artist-visibility-offer-contract-v1 to Pro $199 without a public Max price', () => {
    expect(ARTIST_VISIBILITY_OFFER_CONTRACT_ID).toBe(
      'artist-visibility-offer-contract-v1'
    );
    expect(ARTIST_VISIBILITY_OFFER.pro.monthlyUsd).toBe(199);
    expect(getPublicPriceClaims().map(claim => claim.plan)).toEqual([
      'free',
      'pro',
      'enterprise',
    ]);
    expect(getPublicPriceClaim('pro')).toMatchObject({
      priceUsd: 199,
      ctaLabel: 'Request access',
      selfService: false,
    });
    expect(FORBIDDEN_PUBLIC_PRICING_PAGE_MARKERS).toEqual([
      '$149',
      '149/mo',
      'Max Early Access',
      'marketing-pricing-plan-max',
    ]);
  });

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
  it('preserves legacy auth helpers while public claims use limited access', () => {
    expect(getPlanSignupHref('free')).toBe('/signup?plan=free');
    expect(getPlanCtaLabel('free')).toBe('Claim your profile');
    expect(getPlanCtaLabel('pro')).toBe('Start 14-day Pro trial');
    expect(getPlanCtaLabel('enterprise')).toBe('Contact sales');
    expect(getPlanOfferNote('free')).toContain('free forever');
    expect(getPlanOfferNote('pro')).toContain('No credit card');
    expect(getPlanOfferNote('enterprise')).toContain('contact sales');
    expect(getPlanCtaHref('pro')).toBe('/signup?plan=pro&interval=month');
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

  it('owns public price and offer claims from one typed module', () => {
    const free = getPublicPriceClaim('free');
    const pro = getPublicPriceClaim('pro');
    const max = getPublicPriceClaim('max');
    const enterprise = getPublicPriceClaim('enterprise');

    expect(getPublicPriceClaims().map(claim => claim.plan)).toEqual([
      'free',
      'pro',
      'enterprise',
    ]);
    expect(free).toMatchObject({
      priceUsd: 0,
      annualPriceUsd: null,
      priceLabel: '$0',
      selfService: true,
      ctaLabel: 'Claim my free profile',
      ctaHref: '/signup?plan=free',
    });
    expect(pro).toMatchObject({
      priceUsd: getPaidPlanPriceUsd('pro', 'month'),
      annualPriceUsd: null,
      priceLabel: formatUsdAmount(getPaidPlanPriceUsd('pro', 'month')),
      cadence: '/mo',
      selfService: false,
      badge: 'Limited access',
      note: 'Limited access.',
      ctaLabel: 'Request access',
      ctaHref: '/waitlist',
    });
    expect(formatPublicPriceDisplay(pro)).toBe(`${pro.priceLabel}/mo`);
    expect(max).toMatchObject({
      priceUsd: null,
      annualPriceUsd: null,
      priceLabel: PUBLIC_CUSTOM_PRICE_LABEL,
      selfService: false,
      ctaLabel: 'Contact sales',
      ctaHref: getContactSalesHref(),
    });
    expect(enterprise).toMatchObject({
      priceUsd: null,
      priceLabel: PUBLIC_CUSTOM_PRICE_LABEL,
      badge: 'Contact sales',
      note: 'Scope by agreement.',
      ctaLabel: 'Contact sales',
      ctaHref: getContactSalesHref(),
    });
    expect(getPlanCtaHref('max')).toBe(getContactSalesHref());
    expect(hasPublicAnnualOffer()).toBe(false);
  });
});
