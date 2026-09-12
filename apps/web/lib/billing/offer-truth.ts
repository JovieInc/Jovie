/**
 * Published offer truth for pricing + auth handoff (JOV-6202).
 *
 * Derives from billing/entitlement config and the implemented Pro trial.
 * Do not invent Max trial, metered billing, or extra paid promises here.
 */

import { APP_ROUTES } from '@/constants/routes';
import { PLAN_PRICES } from '@/lib/config/plan-prices';
import { publicEnv } from '@/lib/env-public';

/** Implemented Pro reverse-trial length. Matches `activateTrial` + published terms. */
export const PRO_TRIAL_DURATION_DAYS = 14;

export type BillingInterval = 'month' | 'year';
export type PublicOfferPlan = 'free' | 'pro' | 'max';
export type MaxOfferStatus = 'purchase' | 'early_access';

export const PRO_TRIAL_TRUTH =
  '14-day Pro trial. No credit card. Returns to Free unless you upgrade.';

export const FREE_PROFILE_TRUTH =
  'Your profile stays free. Pro trial capabilities are temporary.';

export const MAX_NO_TRIAL_TRUTH = 'Paid Max plan. No Max trial.';

export const MAX_EARLY_ACCESS_TRUTH =
  'Max is early access. Paid plan when admitted — no Max trial.';

export function isMaxPurchaseEnabled(): boolean {
  return publicEnv.NEXT_PUBLIC_FEATURE_MAX_PLAN === 'true';
}

export function getMaxOfferStatus(): MaxOfferStatus {
  return isMaxPurchaseEnabled() ? 'purchase' : 'early_access';
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
  if (Number.isInteger(amount)) return `$${amount}`;
  return `$${amount.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}`;
}

export function getAnnualMonthlyEquivalentUsd(yearlyUsd: number): number {
  return yearlyUsd / 12;
}

export function formatAnnualMonthlyEquivalent(yearlyUsd: number): string {
  return `${formatUsdAmount(getAnnualMonthlyEquivalentUsd(yearlyUsd))}/mo`;
}

export function getPaidPlanPriceUsd(
  plan: 'pro' | 'max',
  interval: BillingInterval
): number {
  return interval === 'year'
    ? PLAN_PRICES[plan].yearly
    : PLAN_PRICES[plan].monthly;
}

export function getPlanSignupHref(
  plan: PublicOfferPlan,
  interval: BillingInterval = 'month'
): string {
  const params = new URLSearchParams({ plan });
  if (plan !== 'free') {
    params.set('interval', interval);
  }
  return `${APP_ROUTES.SIGNUP}?${params.toString()}`;
}

export function getPlanCtaLabel(plan: PublicOfferPlan): string {
  if (plan === 'free') return 'Claim your profile';
  if (plan === 'pro') return `Start ${PRO_TRIAL_DURATION_DAYS}-day Pro trial`;
  return getMaxOfferStatus() === 'purchase'
    ? 'Get Max'
    : 'Join Max early access';
}

export function getPlanOfferNote(plan: PublicOfferPlan): string {
  if (plan === 'free') return FREE_PROFILE_TRUTH;
  if (plan === 'pro') return PRO_TRIAL_TRUTH;
  return getMaxOfferStatus() === 'purchase'
    ? MAX_NO_TRIAL_TRUTH
    : MAX_EARLY_ACCESS_TRUTH;
}

export function getMaxOfferBadge(): string {
  return getMaxOfferStatus() === 'purchase' ? 'Paid plan' : 'Early access';
}
