import { formatAmount } from '@/lib/utils/format-number';

/**
 * Billing terms shown beside the checkout button and recorded with consent.
 * Every sentence here is true of the shipped billing path:
 * - Stripe Checkout `mode: 'subscription'` charges at once and renews each
 *   interval (no `trial_period_days`);
 * - cancel sets `cancel_at_period_end`, so paid features last to period end
 *   (content/legal/terms.md, "Billing and Cancellation").
 * There is deliberately no refund sentence: no refund policy is published in
 * the Terms yet. Adding one is a product/legal decision, not a copy edit.
 */
export const CHECKOUT_TERMS_VERSION = 'checkout-terms-2026-10-25';

export type CheckoutTermsInterval = 'month' | 'year';

export interface CheckoutTerms {
  readonly version: typeof CHECKOUT_TERMS_VERSION;
  readonly price: string;
  readonly timing: string;
  readonly cancel: string;
  readonly consentLabel: string;
}

/** Deterministic UTC date so the page, the consent text and Stripe agree. */
export function formatChargeDate(date: Date): string {
  return `${new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(date)} UTC`;
}

export function buildCheckoutTerms(input: {
  readonly amountCents: number;
  readonly interval: CheckoutTermsInterval;
  /** First charge date when a mid-trial upgrade defers billing. */
  readonly firstChargeAt?: Date | null;
}): CheckoutTerms {
  const price = formatAmount(input.amountCents);
  const per = input.interval === 'year' ? 'year' : 'month';
  const first = input.firstChargeAt
    ? formatChargeDate(input.firstChargeAt)
    : null;
  return {
    version: CHECKOUT_TERMS_VERSION,
    price: `${price}/${per === 'year' ? 'yr' : 'mo'}`,
    timing: first
      ? `Your card is saved now and you won't be charged until ${first}. Then ${price} every ${per} until you cancel.`
      : `Your card is charged ${price} today, then every ${per} until you cancel.`,
    cancel:
      'Cancel anytime in Settings. You keep paid features until the end of the billing period.',
    consentLabel: first
      ? `I agree to be charged ${price} every ${per} starting ${first}, renewing automatically until I cancel.`
      : `I agree to be charged ${price} every ${per}, renewing automatically until I cancel.`,
  };
}
