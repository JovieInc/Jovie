/**
 * Orphaned Subscription Handler
 *
 * Handles subscriptions that exist in DB but not in Stripe (deleted subscriptions).
 */

import { eq, sql } from 'drizzle-orm';
import type { DbType } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { updateUserBillingStatus } from '@/lib/stripe/customer-sync';

/**
 * Result of orphaned subscription handling.
 */
export interface OrphanedSubscriptionResult {
  success: boolean;
  action: 'downgraded' | 'cleared_id';
  error?: string;
}

/**
 * Handles a user with an orphaned subscription (DB has ID but Stripe doesn't).
 * If user is Pro, downgrade them. Otherwise, just clear the subscription ID.
 *
 * @param db - Database transaction
 * @param user - User with orphaned subscription
 * @returns Result of handling operation
 */
export async function handleOrphanedSubscription(
  db: DbType,
  user: {
    id: string;
    clerkId: string;
    isPro: boolean;
    stripeSubscriptionId: string;
  }
): Promise<OrphanedSubscriptionResult> {
  if (user.isPro) {
    // User is marked as Pro but subscription is gone - downgrade
    const result = await updateUserBillingStatus({
      clerkUserId: user.clerkId,
      isPro: false,
      stripeSubscriptionId: null,
      eventType: 'reconciliation_fix',
      source: 'reconciliation',
      metadata: {
        reason: 'subscription_not_found_in_stripe',
        previousSubscriptionId: user.stripeSubscriptionId,
      },
    });

    return {
      success: result.success,
      action: 'downgraded',
      error: result.error,
    };
  }

  // User is not Pro - just clear the orphaned subscription ID
  await db
    .update(users)
    .set({
      stripeSubscriptionId: null,
      billingUpdatedAt: new Date(),
      billingVersion: sql`${users.billingVersion} + 1`,
    })
    .where(eq(users.id, user.id));

  return {
    success: true,
    action: 'cleared_id',
  };
}
