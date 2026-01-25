/**
 * Subscription Status Resolver
 *
 * Determines expected Pro status from Stripe subscription state.
 */

import type Stripe from 'stripe';

/**
 * Stripe subscription statuses that grant Pro access.
 */
const PRO_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>([
  'active',
  'trialing',
]);

/**
 * Determines if a subscription status should grant Pro access.
 *
 * @param status - Stripe subscription status
 * @returns True if status grants Pro access
 */
export function shouldGrantProAccess(
  status: Stripe.Subscription.Status
): boolean {
  return PRO_SUBSCRIPTION_STATUSES.has(status);
}

/**
 * Detects if there's a mismatch between DB and Stripe subscription status.
 *
 * @param dbIsPro - Current Pro status in database
 * @param subscription - Stripe subscription object
 * @returns Mismatch detection result
 */
export function detectStatusMismatch(
  dbIsPro: boolean,
  subscription: Stripe.Subscription
): {
  hasMismatch: boolean;
  expectedIsPro: boolean;
  reason: string;
} {
  const expectedIsPro = shouldGrantProAccess(subscription.status);

  if (dbIsPro === expectedIsPro) {
    return {
      hasMismatch: false,
      expectedIsPro,
      reason: 'status_matches',
    };
  }

  return {
    hasMismatch: true,
    expectedIsPro,
    reason: `db_is_pro_${dbIsPro}_but_stripe_status_${subscription.status}`,
  };
}

/**
 * Extracts customer ID from Stripe subscription.
 * Handles both string IDs and expanded customer objects.
 *
 * @param customer - Customer from subscription object
 * @returns Customer ID or null
 */
export function extractCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
): string | null {
  if (!customer) return null;
  if (typeof customer === 'string') return customer;
  if ('id' in customer && typeof customer.id === 'string') return customer.id;
  return null;
}
