/**
 * THE canonical offer (offer-truth design, fleet/offer-truth.md).
 *
 * Structured facts only. Every sentence a user can read about price, trial,
 * billing, renewal, cancellation or limits is rendered from these facts by a
 * registered claim in `./claims.ts`. Nothing else may state them (enforced by
 * `scripts/invariants/offer-claims`).
 *
 * Client-importable: no server-only imports. Existing constants
 * (`ARTIST_VISIBILITY_OFFER`, `PRO_TRIAL_DURATION_DAYS`) stay the numeric
 * source; this module composes them into one object with the relationships
 * (what is charged when, what a trial is) that prose depends on.
 */

import { ARTIST_VISIBILITY_OFFER } from '@/lib/config/plan-prices';

/** Length of the reverse trial. Matches `activateTrial` and the published terms. */
const TRIAL_DAYS = 14;

export const OFFER = {
  /** Bump when any fact below changes. Surfaces verified against an older version are stale. */
  version: '2026-10-25.1',
  currency: ARTIST_VISIBILITY_OFFER.pro.currency,
  plans: {
    free: {
      displayName: ARTIST_VISIBILITY_OFFER.free.displayName,
      amountCents: 0,
      profileLifetime: ARTIST_VISIBILITY_OFFER.free.profileLifetime,
      downgrade: 'branded',
      audienceCapture: ARTIST_VISIBILITY_OFFER.free.audienceCapture,
    },
    pro: {
      displayName: ARTIST_VISIBILITY_OFFER.pro.displayName,
      amountCents: Math.round(ARTIST_VISIBILITY_OFFER.pro.monthlyUsd * 100),
      interval: ARTIST_VISIBILITY_OFFER.pro.interval,
      intervalCount: 1,
      selfServe: true,
    },
  },
  /**
   * Reverse trial. `mechanism: 'entitlement'` means an app-side plan state with
   * NO Stripe object and NO card, so it can never convert into a charge by
   * itself. Copy that says 'then automatically charged' is forbidden while
   * this holds (see FORBIDDEN_CLAIM_SHAPES).
   */
  trial: {
    enabled: true,
    advertised: true,
    mechanism: 'entitlement',
    days: TRIAL_DAYS,
    requiresCard: false,
    endsInto: 'free',
    chargedAutomatically: false,
    fanEmailAllowance: ARTIST_VISIBILITY_OFFER.fanSends.freeTrialEmailAllowance,
    /** Day offsets for the explicit-upgrade reminders. Emails ask; they never bill. */
    reminderDays: [10, 13],
  },
  /**
   * Stripe Checkout facts as the code sends them TODAY. The checkout-session
   * builder (onboarding worker) must match these; `offer-stripe-contract.test`
   * asserts it once that builder exists.
   */
  checkout: {
    mode: 'subscription',
    trialPeriodDays: 0,
    paymentMethodCollection: 'always',
    chargedAt: 'checkout',
    /** What a mid-trial upgrade does. Flip to 'carry_remaining_days' together with `trial_end`. */
    upgradeDuringTrial: 'billing_starts_today' as
      | 'billing_starts_today'
      | 'carry_remaining_days',
    promotionCodesAllowed: true,
  },
  terms: {
    renewal: 'monthly_until_cancelled',
    cancel: 'anytime_effective_end_of_period',
    /**
     * Tim, 2026-10-25: cancel anytime, keep Pro to the end of the paid month, no
     * partial refunds. Stripe must cancel at period end with no proration refund
     * (the live check reads the portal configuration). No guarantee is offered.
     */
    refund: 'none_partial_period' as 'none_partial_period' | null,
    guarantee: null,
  },
} as const;

export type Offer = typeof OFFER;
