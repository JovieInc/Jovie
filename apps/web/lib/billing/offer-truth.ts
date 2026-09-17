/**
 * Published offer truth for pricing + auth handoff (JOV-6202 / JOV-5814).
 *
 * Derives from billing/entitlement config and the implemented Pro trial.
 * JOV-6218 supersedes the older public Pro/Max offer; retain helpers for auth compatibility.
 * Public marketing/pricing surfaces must read claims from this module.
 */

import { APP_ROUTES } from '@/constants/routes';
import {
  ARTIST_VISIBILITY_OFFER,
  PLAN_PRICES,
  toCents,
} from '@/lib/config/plan-prices';

import { formatAmount, formatAmountNoCents } from '@/lib/utils/format-number';

export { ARTIST_VISIBILITY_OFFER } from '@/lib/config/plan-prices';

/** Implemented Pro reverse-trial length. Matches `activateTrial` + published terms. */
export const PRO_TRIAL_DURATION_DAYS = 14;

export type BillingInterval = 'month' | 'year';
export type PublicOfferPlan = 'free' | 'pro' | 'max' | 'enterprise';
export type MaxOfferStatus = 'purchase' | 'early_access' | 'contact_sales';

export const PRO_TRIAL_TRUTH =
  '14-day Pro trial. No credit card. Returns to Free unless you upgrade.';

export const FREE_PROFILE_TRUTH =
  'Your artist profile stays free forever. Downgrading restores Jovie branding and keeps audience capture.';

export const MAX_NO_TRIAL_TRUTH = 'Paid Max plan. No Max trial.';

export const MAX_EARLY_ACCESS_TRUTH =
  'For labels and multi-artist teams, contact sales. No self-service Max checkout.';

export function isMaxPurchaseEnabled(): boolean {
  return false;
}

export function getMaxOfferStatus(): MaxOfferStatus {
  return 'contact_sales';
}

export function validateBillingInterval(
  value: string | null | undefined
): BillingInterval | null {
  if (value === 'month' || value === 'year') return value;
  if (value === 'monthly') return 'month';
  if (value === 'annual' || value === 'yearly') return 'year';
  return null;
}

export function formatUsdAmount(amount: number): string {
  return Number.isInteger(amount)
    ? formatAmountNoCents(toCents(amount))
    : formatAmount(toCents(amount));
}

export function getAnnualMonthlyEquivalentUsd(yearlyUsd: number): number {
  return yearlyUsd / 12;
}

export function formatAnnualMonthlyEquivalent(yearlyUsd: number): string {
  return `${formatUsdAmount(getAnnualMonthlyEquivalentUsd(yearlyUsd))}/mo`;
}

/** New purchases only; aliases are normalized separately for legacy auth intent. */
export function isSelfServiceOffer(
  plan: string | null | undefined,
  interval: string | null | undefined = 'month'
): boolean {
  return (
    plan === 'free' ||
    (plan === 'pro' && validateBillingInterval(interval) === 'month')
  );
}

export function getPaidPlanPriceUsd(
  plan: 'pro' | 'max',
  interval: BillingInterval
): number {
  if (plan !== 'pro' || interval !== 'month') {
    throw new Error('Only monthly Pro is available for new subscriptions');
  }
  return PLAN_PRICES.pro.monthly;
}

export function getPlanSignupHref(
  plan: PublicOfferPlan,
  interval: BillingInterval = 'month'
): string {
  if (!isSelfServiceOffer(plan, interval)) {
    throw new Error('This offer is not available for self-service signup');
  }
  const params = new URLSearchParams({ plan });
  if (plan !== 'free') {
    params.set('interval', interval);
  }
  return `${APP_ROUTES.SIGNUP}?${params.toString()}`;
}

export function getPlanCtaLabel(plan: PublicOfferPlan): string {
  if (plan === 'free') return 'Claim your profile';
  if (plan === 'pro') return `Start ${PRO_TRIAL_DURATION_DAYS}-day Pro trial`;
  return 'Contact sales';
}

export function getPlanOfferNote(plan: PublicOfferPlan): string {
  if (plan === 'free') return FREE_PROFILE_TRUTH;
  if (plan === 'pro') return PRO_TRIAL_TRUTH;
  return MAX_EARLY_ACCESS_TRUTH;
}

export function getMaxOfferBadge(): string {
  return 'Contact sales';
}

/** Public merchandising plans. Max stays visible; checkout is contact-sales. */
export const PUBLIC_PRICING_CLAIM_PLANS = ['free', 'pro', 'max'] as const;
export type PublicPricingClaimPlan =
  (typeof PUBLIC_PRICING_CLAIM_PLANS)[number];

export const PUBLIC_CUSTOM_PRICE_LABEL = 'Custom';

export type PublicPriceClaim = {
  readonly plan: PublicOfferPlan;
  readonly displayName: string;
  readonly priceUsd: number | null;
  readonly annualPriceUsd: number | null;
  readonly priceLabel: string;
  readonly cadence: string | null;
  readonly badge: string;
  readonly note: string;
  readonly ctaLabel: string;
  readonly ctaHref: string;
  readonly selfService: boolean;
};

export function getContactSalesHref(): string {
  return ARTIST_VISIBILITY_OFFER.enterprise.href;
}

export function getPlanCtaHref(
  plan: PublicOfferPlan,
  interval: BillingInterval = 'month'
): string {
  if (isSelfServiceOffer(plan, interval)) {
    return getPlanSignupHref(plan, interval);
  }
  return getContactSalesHref();
}

export function formatPublicPriceDisplay(claim: PublicPriceClaim): string {
  if (!claim.cadence) return claim.priceLabel;
  return `${claim.priceLabel}${claim.cadence}`;
}

export function getPublicPriceClaim(plan: PublicOfferPlan): PublicPriceClaim {
  if (plan === 'free') {
    return {
      plan,
      displayName: ARTIST_VISIBILITY_OFFER.free.displayName,
      priceUsd: 0,
      annualPriceUsd: null,
      priceLabel: formatUsdAmount(0),
      cadence: null,
      badge: 'Free forever',
      note: FREE_PROFILE_TRUTH,
      ctaLabel: getPlanCtaLabel(plan),
      ctaHref: getPlanCtaHref(plan),
      selfService: true,
    };
  }

  if (plan === 'pro') {
    const priceUsd = getPaidPlanPriceUsd('pro', 'month');
    return {
      plan,
      displayName: ARTIST_VISIBILITY_OFFER.pro.displayName,
      priceUsd,
      annualPriceUsd: null,
      priceLabel: formatUsdAmount(priceUsd),
      cadence: '/mo',
      badge: 'Recommended',
      note: PRO_TRIAL_TRUTH,
      ctaLabel: getPlanCtaLabel(plan),
      ctaHref: getPlanCtaHref(plan),
      selfService: true,
    };
  }

  return {
    plan,
    displayName:
      plan === 'enterprise'
        ? ARTIST_VISIBILITY_OFFER.enterprise.displayName
        : 'Max',
    priceUsd: null,
    annualPriceUsd: null,
    priceLabel: PUBLIC_CUSTOM_PRICE_LABEL,
    cadence: null,
    badge: getMaxOfferBadge(),
    note: getPlanOfferNote(plan),
    ctaLabel: getPlanCtaLabel(plan),
    ctaHref: getPlanCtaHref(plan),
    selfService: false,
  };
}

export function getPublicPriceClaims(): readonly PublicPriceClaim[] {
  return PUBLIC_PRICING_CLAIM_PLANS.map(plan => getPublicPriceClaim(plan));
}

export function hasPublicAnnualOffer(): boolean {
  return getPublicPriceClaims().some(claim => claim.annualPriceUsd !== null);
}
