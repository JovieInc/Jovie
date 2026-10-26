/**
 * Status Mismatch Fixer
 *
 * Fixes mismatches between DB and Stripe subscription status.
 */

import type Stripe from 'stripe';
import { updateUserBillingStatus } from '@/lib/stripe/customer-sync';
import {
  resolvePlanFromPriceIds,
  subscriptionPriceIds,
} from '@/lib/stripe/subscription-plan';
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
    clerkId: string | null;
    isPro: boolean;
  },
  subscription: Stripe.Subscription,
  expectedIsPro: boolean
): Promise<StatusMismatchFixResult> {
  const customerId = extractCustomerId(subscription.customer);
  const base = {
    clerkUserId: user.clerkId ?? user.id,
    stripeSubscriptionId: expectedIsPro ? subscription.id : null,
    stripeCustomerId: customerId ?? undefined,
    eventType: 'reconciliation_fix' as const,
    source: 'reconciliation' as const,
    metadata: {
      reason: 'status_mismatch',
      dbIsPro: user.isPro,
      stripeStatus: subscription.status,
      expectedIsPro,
    },
  };

  if (!expectedIsPro) {
    const result = await updateUserBillingStatus({ ...base, isPro: false });
    return { success: result.success, error: result.error };
  }

  // Grant the plan the subscription's price maps to, exactly as the webhook
  // does. Never default it: that downgraded Max subscribers to Pro. An
  // unmappable price is left for manual reconciliation, not guessed.
  const priceIds = subscriptionPriceIds(subscription);
  const resolved = resolvePlanFromPriceIds(priceIds);
  if (!resolved) {
    return {
      success: false,
      error: `unknown_price_id: ${priceIds.join(',') || 'none'}`,
    };
  }
  const result = await updateUserBillingStatus({
    ...base,
    isPro: true,
    plan: resolved.plan,
    stripePriceId: resolved.priceId,
  });

  return {
    success: result.success,
    error: result.error,
  };
}
