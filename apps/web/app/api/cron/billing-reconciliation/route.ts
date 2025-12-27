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
import Stripe from 'stripe';
import { db } from '@/lib/db';
import { billingAuditLog, users } from '@/lib/db/schema';
import { captureCriticalError, captureWarning } from '@/lib/error-tracking';
import { stripe } from '@/lib/stripe/client';
import { updateUserBillingStatus } from '@/lib/stripe/customer-sync';
import { withCronAuth } from '@/lib/api/middleware';
import { successResponse, internalErrorResponse } from '@/lib/api/responses';

const BATCH_SIZE = 100;
const MAX_BATCHES = 50;

function getCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
): string | null {
  if (!customer) return null;
  if (typeof customer === 'string') return customer;
  if ('id' in customer && typeof customer.id === 'string') return customer.id;
  return null;
}

export const runtime = 'nodejs';
export const maxDuration = 60;

interface ReconciliationStats {
  usersChecked: number;
  mismatches: number;
  fixed: number;
  errors: number;
  orphanedSubscriptions: number;
  staleCustomers: number;
}

/**
 * GET /api/cron/billing-reconciliation
 *
 * Hourly cron job to reconcile billing status between DB and Stripe
 */
export const GET = withCronAuth(async () => {
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

  try {
    await reconcileUsersWithSubscriptions(stats, errors);
    await reconcileProUsersWithoutSubscription(stats, errors);
    await checkStaleCustomers(stats);

    const duration = Date.now() - startTime;

    console.log('[billing-reconciliation] Completed:', { stats, errors, duration });

    if (stats.mismatches > 0 || stats.errors > 0) {
      await captureWarning('Billing reconciliation found issues', undefined, {
        stats,
        errors: errors.slice(0, 5),
      });
    }

    return successResponse({ stats, errors, duration });
  } catch (error) {
    const duration = Date.now() - startTime;
    await captureCriticalError('Billing reconciliation failed', error, {
      stats,
      duration,
    });

    return internalErrorResponse(
      error instanceof Error ? error.message : 'Reconciliation failed'
    );
  }
});

async function reconcileUsersWithSubscriptions(
  stats: ReconciliationStats,
  errors: string[]
): Promise<void> {
  let lastUserId: string | null = null;
  let batchCount = 0;

  while (batchCount < MAX_BATCHES) {
    batchCount++;

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

    if (usersWithSubscriptions.length === 0) break;

    for (const user of usersWithSubscriptions) {
      stats.usersChecked++;
      lastUserId = user.id;

      try {
        if (!user.stripeSubscriptionId) continue;

        let subscription;
        try {
          subscription = await stripe.subscriptions.retrieve(
            user.stripeSubscriptionId
          );
        } catch (stripeError) {
          const errorMessage =
            stripeError instanceof Error
              ? stripeError.message
              : String(stripeError);

          if (errorMessage.includes('No such subscription')) {
            stats.orphanedSubscriptions++;
            stats.mismatches++;

            if (user.isPro) {
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

          stats.errors++;
          errors.push(`Stripe error for user ${user.id}: ${errorMessage}`);
          continue;
        }

        const shouldBePro =
          subscription.status === 'active' ||
          subscription.status === 'trialing';

        if (user.isPro !== shouldBePro) {
          stats.mismatches++;

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
            console.log(
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

    if (usersWithSubscriptions.length < BATCH_SIZE) break;
  }

  if (batchCount >= MAX_BATCHES) {
    await captureWarning('Billing reconciliation hit batch limit', undefined, {
      batchCount,
      usersChecked: stats.usersChecked,
    });
  }
}

async function reconcileProUsersWithoutSubscription(
  stats: ReconciliationStats,
  errors: string[]
): Promise<void> {
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
      if (user.stripeCustomerId) {
        const subscriptions = await stripe.subscriptions.list({
          customer: user.stripeCustomerId,
          status: 'active',
          limit: 1,
        });

        if (subscriptions.data.length > 0) {
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

          await db.insert(billingAuditLog).values({
            userId: user.id,
            eventType: 'reconciliation_fix',
            previousState: { stripeSubscriptionId: null },
            newState: { stripeSubscriptionId: subscription.id },
            source: 'reconciliation',
            metadata: { reason: 'linked_active_subscription' },
          });

          stats.fixed++;
          continue;
        }
      }

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
        console.log(
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

async function checkStaleCustomers(stats: ReconciliationStats): Promise<void> {
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
