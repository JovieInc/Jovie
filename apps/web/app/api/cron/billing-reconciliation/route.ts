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

import { sql as drizzleSql, eq, isNotNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/lib/db';
import { billingAuditLog, users } from '@/lib/db/schema';
import { captureCriticalError, captureWarning } from '@/lib/error-tracking';
import { stripe } from '@/lib/stripe/client';
import { updateUserBillingStatus } from '@/lib/stripe/customer-sync';
import { logger } from '@/lib/utils/logger';

// Pagination settings
const BATCH_SIZE = 100;
const MAX_BATCHES = 50; // Safety limit: process max 5000 users per run

/**
 * Safely extract customer ID from Stripe objects
 * Handles both string IDs and expanded customer objects
 */
function getCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
): string | null {
  if (!customer) return null;
  if (typeof customer === 'string') return customer;
  if ('id' in customer && typeof customer.id === 'string') return customer.id;
  return null;
}

export const runtime = 'nodejs';
export const maxDuration = 60; // Allow up to 60 seconds for reconciliation

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

// Vercel Cron secret for authentication
const CRON_SECRET = process.env.CRON_SECRET;

interface ReconciliationStats {
  usersChecked: number;
  mismatches: number;
  fixed: number;
  errors: number;
  orphanedSubscriptions: number;
  staleCustomers: number;
}

interface ReconciliationResult {
  success: boolean;
  stats: ReconciliationStats;
  errors: string[];
  duration: number;
}

/**
 * GET /api/cron/billing-reconciliation
 *
 * Hourly cron job to reconcile billing status between DB and Stripe
 */
export async function GET(request: Request) {
  const startTime = Date.now();

  // Verify cron secret in production
  if (process.env.NODE_ENV === 'production') {
    const authHeader = request.headers.get('authorization');
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
  }

  const stats: ReconciliationStats = {
    usersChecked: 0,
    mismatches: 0,
    fixed: 0,
    errors: 0,
    orphanedSubscriptions: 0,
    staleCustomers: 0,
  };
  const errors: string[] = [];

  try {
    // 1. Check users with subscription IDs - verify they match Stripe
    await reconcileUsersWithSubscriptions(stats, errors);

    // 2. Check users marked as Pro but without subscription ID
    await reconcileProUsersWithoutSubscription(stats, errors);

    // 3. Check for stale Stripe customers (customer exists but user deleted)
    await checkStaleCustomers(stats);

    const duration = Date.now() - startTime;

    const result: ReconciliationResult = {
      success: stats.errors === 0,
      stats,
      errors,
      duration,
    };

    logger.info('[billing-reconciliation] Completed:', result);

    // Report any issues to error tracking
    if (stats.mismatches > 0 || stats.errors > 0) {
      await captureWarning('Billing reconciliation found issues', undefined, {
        stats,
        errors: errors.slice(0, 5), // Limit to first 5 errors
      });
    }

    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (error) {
    const duration = Date.now() - startTime;
    await captureCriticalError('Billing reconciliation failed', error, {
      stats,
      duration,
    });

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Reconciliation failed',
        stats,
        duration,
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

/**
 * Reconcile users who have a subscription ID stored in DB
 * Uses cursor-based pagination to handle >100 users
 */
async function reconcileUsersWithSubscriptions(
  stats: ReconciliationStats,
  errors: string[]
): Promise<void> {
  let lastUserId: string | null = null;
  let batchCount = 0;

  // Process users in batches with cursor-based pagination
  while (batchCount < MAX_BATCHES) {
    batchCount++;

    // Build query with cursor
    const usersWithSubscriptions = await db
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

    if (usersWithSubscriptions.length === 0) {
      break; // No more users to process
    }

    for (const user of usersWithSubscriptions) {
      stats.usersChecked++;
      lastUserId = user.id;

      try {
        if (!user.stripeSubscriptionId) continue;

        // Fetch subscription from Stripe
        let subscription;
        try {
          subscription = await stripe.subscriptions.retrieve(
            user.stripeSubscriptionId
          );
        } catch (stripeError) {
          // Subscription not found in Stripe - might be deleted
          const errorMessage =
            stripeError instanceof Error
              ? stripeError.message
              : String(stripeError);

          if (errorMessage.includes('No such subscription')) {
            // Subscription was deleted in Stripe but DB still has it
            stats.orphanedSubscriptions++;
            stats.mismatches++;

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

              if (result.success) {
                stats.fixed++;
              } else {
                stats.errors++;
                errors.push(`Failed to fix user ${user.id}: ${result.error}`);
              }
            } else {
              // Just clear the orphaned subscription ID
              await db
                .update(users)
                .set({
                  stripeSubscriptionId: null,
                  billingUpdatedAt: new Date(),
                  billingVersion: drizzleSql`${users.billingVersion} + 1`,
                })
                .where(eq(users.id, user.id));
              stats.fixed++;
            }
            continue;
          }

          // Other Stripe error - log and continue
          stats.errors++;
          errors.push(`Stripe error for user ${user.id}: ${errorMessage}`);
          continue;
        }

        // Determine expected Pro status from Stripe
        const shouldBePro =
          subscription.status === 'active' ||
          subscription.status === 'trialing';

        // Check for mismatch
        if (user.isPro !== shouldBePro) {
          stats.mismatches++;

          // Fix the mismatch
          const customerId = getCustomerId(subscription.customer);
          const result = await updateUserBillingStatus({
            clerkUserId: user.clerkId,
            isPro: shouldBePro,
            stripeSubscriptionId: shouldBePro ? subscription.id : null,
            stripeCustomerId: customerId ?? undefined,
            eventType: 'reconciliation_fix',
            source: 'reconciliation',
            metadata: {
              reason: 'status_mismatch',
              dbIsPro: user.isPro,
              stripeStatus: subscription.status,
              expectedIsPro: shouldBePro,
            },
          });

          if (result.success) {
            stats.fixed++;
            logger.info(
              `[billing-reconciliation] Fixed user ${user.id}: isPro ${user.isPro} -> ${shouldBePro}`
            );
          } else {
            stats.errors++;
            errors.push(`Failed to fix user ${user.id}: ${result.error}`);
          }
        }
      } catch (error) {
        stats.errors++;
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`Error processing user ${user.id}: ${message}`);
      }
    }

    // If we got fewer than BATCH_SIZE, we're done
    if (usersWithSubscriptions.length < BATCH_SIZE) {
      break;
    }
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
 * This shouldn't happen normally but could due to bugs or manual edits
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

  for (const user of proUsersWithoutSub) {
    stats.usersChecked++;

    try {
      // If they have a customer ID, check for active subscriptions
      if (user.stripeCustomerId) {
        const subscriptions = await stripe.subscriptions.list({
          customer: user.stripeCustomerId,
          status: 'active',
          limit: 1,
        });

        if (subscriptions.data.length > 0) {
          // They have an active subscription - link it
          const subscription = subscriptions.data[0];
          stats.mismatches++;

          await db
            .update(users)
            .set({
              stripeSubscriptionId: subscription.id,
              billingUpdatedAt: new Date(),
              billingVersion: drizzleSql`${users.billingVersion} + 1`,
            })
            .where(eq(users.id, user.id));

          // Log to audit
          await db.insert(billingAuditLog).values({
            userId: user.id,
            eventType: 'reconciliation_fix',
            previousState: { stripeSubscriptionId: null },
            newState: { stripeSubscriptionId: subscription.id },
            source: 'reconciliation',
            metadata: {
              reason: 'linked_active_subscription',
            },
          });

          stats.fixed++;
          continue;
        }
      }

      // No active subscription found - they shouldn't be Pro
      stats.mismatches++;

      const result = await updateUserBillingStatus({
        clerkUserId: user.clerkId,
        isPro: false,
        eventType: 'reconciliation_fix',
        source: 'reconciliation',
        metadata: {
          reason: 'pro_without_subscription',
          hadCustomerId: !!user.stripeCustomerId,
        },
      });

      if (result.success) {
        stats.fixed++;
        logger.info(
          `[billing-reconciliation] Downgraded user ${user.id}: Pro without subscription`
        );
      } else {
        stats.errors++;
        errors.push(`Failed to fix Pro user ${user.id}: ${result.error}`);
      }
    } catch (error) {
      stats.errors++;
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Error processing Pro user ${user.id}: ${message}`);
    }
  }
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
