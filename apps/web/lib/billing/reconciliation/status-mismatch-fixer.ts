/**
 * Status Mismatch Fixer
 *
 * Fixes mismatches between DB and Stripe subscription status.
 */

import type Stripe from 'stripe';
import { updateUserBillingStatus } from '@/lib/stripe/customer-sync';
import { extractCustomerId } from './subscription-status-resolver';

/**
 * Result of fixing a status mismatch.
 */
export interface StatusMismatchFixResult {
  success: boolean;
  error?: string;
}

/**
 * Fixes a mismatch between DB isPro status and Stripe subscription status.
 * Updates the database to match Stripe's current subscription state.
 *
 * @param user - User with status mismatch
 * @param subscription - Current Stripe subscription
 * @param expectedIsPro - Expected Pro status based on Stripe
 * @returns Result of fix operation
 */
export async function fixStatusMismatch(
  user: {
    id: string;
    clerkId: string;
    isPro: boolean;
  },
  subscription: Stripe.Subscription,
  expectedIsPro: boolean
): Promise<StatusMismatchFixResult> {
  const customerId = extractCustomerId(subscription.customer);

  const result = await updateUserBillingStatus({
    clerkUserId: user.clerkId,
    isPro: expectedIsPro,
    stripeSubscriptionId: expectedIsPro ? subscription.id : null,
    stripeCustomerId: customerId ?? undefined,
    eventType: 'reconciliation_fix',
    source: 'reconciliation',
    metadata: {
      reason: 'status_mismatch',
      dbIsPro: user.isPro,
      stripeStatus: subscription.status,
      expectedIsPro,
    },
  });

  return {
    success: result.success,
    error: result.error,
  };
}
