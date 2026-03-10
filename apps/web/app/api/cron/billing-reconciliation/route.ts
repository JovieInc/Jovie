/**
 * Billing Reconciliation Cron Job
 *
 * Runs hourly to reconcile database subscription status with Stripe
 * Ensures no user is stuck in wrong subscription state for >1 hour
 *
 * What it does:
 * 1. Fetches all users with stripeSubscriptionId from DB
 * 2. Compares DB isPro status with Stripe subscription status
 * 3. Fixes any mismatches and logs to audit table
 *
 * Schedule: Every hour (configured in vercel.json)
 */

import { sql as drizzleSql, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import {
  BATCH_SIZE,
  fetchUserBatch,
  processSingleUser,
  type ReconciliationStats,
  updateStatsFromResult,
} from '@/lib/billing/reconciliation/batch-processor';
import { db } from '@/lib/db';
import { runLegacyDbTransaction } from '@/lib/db/legacy-transaction';
import { users } from '@/lib/db/schema/auth';
import { billingAuditLog } from '@/lib/db/schema/billing';
import { env } from '@/lib/env-server';
import { captureCriticalError, captureWarning } from '@/lib/error-tracking';
import { stripe } from '@/lib/stripe/client';
import { isActiveSubscription } from '@/lib/stripe/webhooks/utils';
import { logger } from '@/lib/utils/logger';

// Safety limit: process max 5000 users per run
const MAX_BATCHES = 50;
const FIRST_PASS_CONCURRENCY = 5;
const SECOND_PASS_REPAIR_CONCURRENCY = 5;

export const runtime = 'nodejs';
export const maxDuration = 60; // Allow up to 60 seconds for reconciliation

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

// Vercel Cron secret for authentication
const CRON_SECRET = env.CRON_SECRET;

interface ReconciliationResult {
  success: boolean;
  stats: ReconciliationStats;
  errors: string[];
  duration: number;
}

/**
 * Core logic for billing reconciliation.
 * Exported for use by the consolidated /api/cron/daily-maintenance handler.
 */
export async function runReconciliation(): Promise<ReconciliationResult> {
  const startTime = Date.now();

  const stats: ReconciliationStats = {
    usersChecked: 0,
    mismatches: 0,
    fixed: 0,
    errors: 0,
    orphanedSubscriptions: 0,
    staleCustomers: 0,
  };
  const errors: string[] = [];

  await reconcileUsersWithSubscriptions(stats, errors);
  await reconcileProUsersWithoutSubscription(stats, errors);
  await checkStaleCustomers(stats);

  const duration = Date.now() - startTime;

  const result: ReconciliationResult = {
    success: stats.errors === 0,
    stats,
    errors,
    duration,
  };

  logger.info('[billing-reconciliation] Completed:', result);

  if (stats.mismatches > 0 || stats.errors > 0) {
    await captureWarning('Billing reconciliation found issues', undefined, {
      stats,
      errors: errors.slice(0, 5),
    });
  }

  return result;
}

/**
 * GET /api/cron/billing-reconciliation
 *
 * Daily cron job to reconcile billing status between DB and Stripe
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const result = await runReconciliation();
    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (error) {
    await captureCriticalError('Billing reconciliation failed', error, {});

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Reconciliation failed',
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

/**
 * Reconcile users who have a subscription ID stored in DB
 * Uses cursor-based pagination to handle >100 users.
 *
 * Each user's subscription is looked up individually via Stripe's retrieve
 * API rather than fetching the entire subscription corpus.
 */
async function reconcileUsersWithSubscriptions(
  stats: ReconciliationStats,
  errors: string[]
): Promise<void> {
  let lastUserId: string | null = null;
  let batchCount = 0;

  while (batchCount < MAX_BATCHES) {
    batchCount++;

    const batch = await fetchUserBatch(db, lastUserId);
    if (batch.length === 0) break;

    // Update cursor to last user in batch before parallel processing
    lastUserId = batch[batch.length - 1].id;

    // Process users with bounded concurrency to avoid Stripe rate limits
    for (
      let chunkStart = 0;
      chunkStart < batch.length;
      chunkStart += FIRST_PASS_CONCURRENCY
    ) {
      const userChunk = batch.slice(
        chunkStart,
        chunkStart + FIRST_PASS_CONCURRENCY
      );

      const results = await Promise.allSettled(
        userChunk.map(user => processSingleUser(db, stripe, user))
      );

      for (let i = 0; i < results.length; i++) {
        stats.usersChecked++;
        const result = results[i];
        const user = userChunk[i];

        if (result.status === 'fulfilled') {
          updateStatsFromResult(stats, errors, user.id, result.value);
        } else {
          stats.errors++;
          const message =
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason);
          errors.push(`Error processing user ${user.id}: ${message}`);
        }
      }
    }

    if (batch.length < BATCH_SIZE) break;
  }

  if (batchCount >= MAX_BATCHES) {
    await captureWarning('Billing reconciliation hit batch limit', undefined, {
      batchCount,
      usersChecked: stats.usersChecked,
    });
  }
}

/**
 * Reconcile users marked as Pro but without a subscription ID
 * This shouldn't happen normally but could due to bugs or manual edits.
 *
 * For each user with a Stripe customer ID, fetches their subscriptions
 * directly from Stripe rather than scanning the full corpus.
 */
async function reconcileProUsersWithoutSubscription(
  stats: ReconciliationStats,
  errors: string[]
): Promise<void> {
  // Find Pro users without subscription ID
  const proUsersWithoutSub = await db
    .select({
      id: users.id,
      clerkId: users.clerkId,
      isPro: users.isPro,
      stripeCustomerId: users.stripeCustomerId,
    })
    .from(users)
    .where(
      drizzleSql`${users.isPro} = true AND ${users.stripeSubscriptionId} IS NULL`
    )
    .limit(50);

  for (
    let chunkStart = 0;
    chunkStart < proUsersWithoutSub.length;
    chunkStart += SECOND_PASS_REPAIR_CONCURRENCY
  ) {
    const userChunk = proUsersWithoutSub.slice(
      chunkStart,
      chunkStart + SECOND_PASS_REPAIR_CONCURRENCY
    );

    const results = await Promise.allSettled(
      userChunk.map(async user => {
        try {
          return {
            userId: user.id,
            result: await repairProUserWithoutSubscription(user),
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          throw new Error(`user ${user.id}: ${message}`);
        }
      })
    );

    for (const result of results) {
      stats.usersChecked++;

      if (result.status === 'fulfilled') {
        stats.mismatches += result.value.result.mismatches;
        stats.fixed += result.value.result.fixed;
        continue;
      }

      stats.errors++;
      const message =
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);
      errors.push(`Error processing Pro user repair: ${message}`);
    }
  }
}

async function repairProUserWithoutSubscription(user: {
  id: string;
  stripeCustomerId: string | null;
}): Promise<{ mismatches: number; fixed: number }> {
  if (user.stripeCustomerId) {
    // Targeted lookup: fetch only this customer's subscriptions
    const customerSubs = await stripe.subscriptions.list({
      customer: user.stripeCustomerId,
      status: 'all',
      limit: 10,
    });
    const activeSubscription = customerSubs.data.find(subscription =>
      isActiveSubscription(subscription.status)
    );

    if (activeSubscription) {
      // They have an active subscription - link it
      await runLegacyDbTransaction(async tx => {
        await tx
          .update(users)
          .set({
            stripeSubscriptionId: activeSubscription.id,
            billingUpdatedAt: new Date(),
            billingVersion: drizzleSql`${users.billingVersion} + 1`,
          })
          .where(eq(users.id, user.id));
        await tx.insert(billingAuditLog).values({
          userId: user.id,
          eventType: 'reconciliation_fix',
          previousState: { stripeSubscriptionId: null },
          newState: { stripeSubscriptionId: activeSubscription.id },
          source: 'reconciliation',
          metadata: {
            reason: 'linked_active_subscription',
          },
        });
      });

      return { mismatches: 1, fixed: 1 };
    }
  }

  // No active subscription found - they shouldn't be Pro
  await runLegacyDbTransaction(async tx => {
    await tx
      .update(users)
      .set({
        isPro: false,
        stripeSubscriptionId: null,
        billingUpdatedAt: new Date(),
        billingVersion: drizzleSql`${users.billingVersion} + 1`,
      })
      .where(eq(users.id, user.id));
    await tx.insert(billingAuditLog).values({
      userId: user.id,
      eventType: 'reconciliation_fix',
      previousState: { stripeSubscriptionId: null },
      newState: { isPro: false },
      source: 'reconciliation',
      metadata: {
        reason: 'no_active_subscription',
      },
    });
  });

  return { mismatches: 1, fixed: 1 };
}

/**
 * Check for stale Stripe customers (customers where user might be deleted)
 * This is a lighter check - just logs issues for manual review
 */
async function checkStaleCustomers(stats: ReconciliationStats): Promise<void> {
  // Find users with customer IDs but marked as deleted
  const deletedUsersWithCustomers = await db
    .select({
      id: users.id,
      clerkId: users.clerkId,
      stripeCustomerId: users.stripeCustomerId,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(
      drizzleSql`${users.deletedAt} IS NOT NULL AND ${users.stripeCustomerId} IS NOT NULL`
    )
    .limit(20);

  for (const user of deletedUsersWithCustomers) {
    stats.staleCustomers++;

    // Just log for now - don't automatically delete Stripe customers
    // This requires manual review to avoid accidental deletion
    await captureWarning(
      'Stale Stripe customer found for deleted user',
      undefined,
      {
        userId: user.id,
        clerkId: user.clerkId,
        stripeCustomerId: user.stripeCustomerId,
        deletedAt: user.deletedAt,
      }
    );
  }
}
