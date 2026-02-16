/**
 * Batch Processor for Billing Reconciliation
 *
 * Extracted to reduce cognitive complexity of the main reconciliation route.
 * Handles single-user processing and batch fetching.
 */

import { sql as drizzleSql, isNotNull } from 'drizzle-orm';
import type Stripe from 'stripe';
import type { DbOrTransaction } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { logger } from '@/lib/utils/logger';
import { handleOrphanedSubscription } from './orphaned-subscription-handler';
import { fixStatusMismatch } from './status-mismatch-fixer';
import { retrieveSubscriptionSafely } from './subscription-error-classifier';
import { detectStatusMismatch } from './subscription-status-resolver';

/**
 * Batch size for cursor-based pagination
 */
export const BATCH_SIZE = 100;

/**
 * Fetch all Stripe subscriptions in bulk via pagination.
 * Returns a Map keyed by subscription ID for O(1) lookups.
 */
export async function fetchAllSubscriptionsMap(
  stripe: Stripe
): Promise<Map<string, Stripe.Subscription>> {
  const subscriptionsMap = new Map<string, Stripe.Subscription>();
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const params: Stripe.SubscriptionListParams = {
      status: 'all',
      limit: 100,
    };
    if (startingAfter) {
      params.starting_after = startingAfter;
    }

    const page = await stripe.subscriptions.list(params);

    for (const subscription of page.data) {
      subscriptionsMap.set(subscription.id, subscription);
    }

    hasMore = page.has_more;
    if (page.data.length > 0) {
      startingAfter = page.data[page.data.length - 1].id;
    }
  }

  return subscriptionsMap;
}

/**
 * User data structure for reconciliation
 */
export interface UserBatchItem {
  id: string;
  clerkId: string;
  isPro: boolean | null;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
}

/**
 * Result of processing a single user
 */
export interface ProcessUserResult {
  action:
    | 'skipped'
    | 'no_mismatch'
    | 'fixed'
    | 'error'
    | 'orphaned_fixed'
    | 'orphaned_error';
  error?: string;
}

/**
 * Stats structure for reconciliation
 */
export interface ReconciliationStats {
  usersChecked: number;
  mismatches: number;
  fixed: number;
  errors: number;
  orphanedSubscriptions: number;
  staleCustomers: number;
}

/**
 * Fetch a batch of users with subscriptions using cursor-based pagination
 */
export async function fetchUserBatch(
  db: DbOrTransaction,
  lastUserId: string | null
): Promise<UserBatchItem[]> {
  return db
    .select({
      id: users.id,
      clerkId: users.clerkId,
      isPro: users.isPro,
      stripeSubscriptionId: users.stripeSubscriptionId,
      stripeCustomerId: users.stripeCustomerId,
    })
    .from(users)
    .where(
      lastUserId
        ? drizzleSql`${users.stripeSubscriptionId} IS NOT NULL AND ${users.id} > ${lastUserId}`
        : isNotNull(users.stripeSubscriptionId)
    )
    .orderBy(users.id)
    .limit(BATCH_SIZE);
}

/**
 * Handle subscription retrieval errors
 */
async function handleRetrievalError(
  db: DbOrTransaction,
  user: UserBatchItem,
  retrievalError: { type: string; message: string }
): Promise<ProcessUserResult> {
  // Subscription not found in Stripe (orphaned)
  if (retrievalError.type === 'not_found') {
    const result = await handleOrphanedSubscription(db, {
      id: user.id,
      clerkId: user.clerkId,
      isPro: user.isPro ?? false,
      stripeSubscriptionId: user.stripeSubscriptionId!,
    });

    return result.success
      ? { action: 'orphaned_fixed' }
      : { action: 'orphaned_error', error: result.error };
  }

  // Other Stripe errors
  return { action: 'error', error: retrievalError.message };
}

/**
 * Handle subscription status mismatch
 */
async function handleMismatch(
  user: UserBatchItem,
  subscription: Stripe.Subscription,
  currentIsPro: boolean
): Promise<ProcessUserResult> {
  const mismatchResult = detectStatusMismatch(currentIsPro, subscription);

  if (!mismatchResult.hasMismatch) {
    return { action: 'no_mismatch' };
  }

  const fixResult = await fixStatusMismatch(
    { ...user, isPro: currentIsPro },
    subscription,
    mismatchResult.expectedIsPro
  );

  if (fixResult.success) {
    logger.info(
      `[billing-reconciliation] Fixed user ${user.id}: isPro ${user.isPro} -> ${mismatchResult.expectedIsPro}`
    );
    return { action: 'fixed' };
  }

  return { action: 'error', error: fixResult.error };
}

/**
 * Process a single user for reconciliation.
 *
 * When a pre-fetched `subscriptionsMap` is provided the subscription is looked
 * up locally (O(1)) instead of making a per-user Stripe API call.  If the
 * subscription is not found in the map it is treated as a "not_found" retrieval
 * error (same as an orphaned subscription).
 *
 * When `subscriptionsMap` is omitted the function falls back to the original
 * per-user `retrieveSubscriptionSafely()` call.
 */
export async function processSingleUser(
  db: DbOrTransaction,
  stripe: Stripe,
  user: UserBatchItem,
  subscriptionsMap?: Map<string, Stripe.Subscription>
): Promise<ProcessUserResult> {
  // Skip users without subscription ID
  if (!user.stripeSubscriptionId) {
    return { action: 'skipped' };
  }

  let subscription: Stripe.Subscription | null = null;
  let retrievalError: { type: string; message: string } | null = null;

  if (subscriptionsMap) {
    // Use pre-fetched map for O(1) lookup
    const found = subscriptionsMap.get(user.stripeSubscriptionId);
    if (found) {
      subscription = found;
    } else {
      // Subscription not in Stripe at all – treat as orphaned / not_found
      retrievalError = {
        type: 'not_found',
        message: 'Subscription not found in Stripe (bulk fetch)',
      };
    }
  } else {
    // Fallback: per-user Stripe API call
    const result = await retrieveSubscriptionSafely(
      stripe,
      user.stripeSubscriptionId
    );
    subscription = result.subscription;
    retrievalError = result.error;
  }

  // Handle retrieval errors (orphaned subscriptions, Stripe errors)
  if (retrievalError) {
    return handleRetrievalError(db, user, retrievalError);
  }

  // No subscription returned (edge case)
  if (!subscription) {
    return { action: 'skipped' };
  }

  // Check for and fix status mismatch
  const currentIsPro = user.isPro ?? false;
  return handleMismatch(user, subscription, currentIsPro);
}

/**
 * Update stats based on processing result
 */
export function updateStatsFromResult(
  stats: ReconciliationStats,
  errors: string[],
  userId: string,
  result: ProcessUserResult
): void {
  switch (result.action) {
    case 'skipped':
    case 'no_mismatch':
      // No action needed
      break;

    case 'fixed':
      stats.mismatches++;
      stats.fixed++;
      break;

    case 'orphaned_fixed':
      stats.orphanedSubscriptions++;
      stats.mismatches++;
      stats.fixed++;
      break;

    case 'orphaned_error':
      stats.orphanedSubscriptions++;
      stats.mismatches++;
      stats.errors++;
      errors.push(
        `Failed to fix orphaned subscription for user ${userId}: ${result.error}`
      );
      break;

    case 'error':
      stats.errors++;
      errors.push(`Stripe error for user ${userId}: ${result.error}`);
      break;
  }
}
