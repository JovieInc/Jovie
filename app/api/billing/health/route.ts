/**
 * Billing Sync Health Check Endpoint
 *
 * Verifies the health of the billing synchronization system
 * Used for monitoring and alerting on billing sync issues
 *
 * Checks:
 * 1. Recent webhook events are being processed
 * 2. No stuck/unprocessed webhooks
 * 3. Recent reconciliation ran successfully
 * 4. Pro user count roughly matches Stripe active subscriptions
 */

import { and, eq, gte, isNull, sql as drizzleSql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { stripeWebhookEvents, users, billingAuditLog } from '@/lib/db/schema';
import { captureWarning } from '@/lib/error-tracking';
import { stripe } from '@/lib/stripe/client';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

// Health check thresholds
const PRO_COUNT_TOLERANCE_PERCENT = 10; // Allow 10% variance between DB and Stripe

interface HealthCheckResult {
  healthy: boolean;
  timestamp: string;
  checks: {
    webhooksProcessing: HealthCheck;
    noStuckWebhooks: HealthCheck;
    recentReconciliation: HealthCheck;
    proCountSync: HealthCheck;
  };
  metrics: {
    proUsersInDb: number;
    activeSubscriptionsInStripe: number;
    recentWebhookCount: number;
    unprocessedWebhookCount: number;
    lastReconciliationAt: string | null;
    lastBillingEventAt: string | null;
  };
}

interface HealthCheck {
  status: 'healthy' | 'warning' | 'critical';
  message: string;
  details?: Record<string, unknown>;
}

/**
 * GET /api/billing/health
 *
 * Health check endpoint for billing sync status
 * Returns detailed health information for monitoring
 */
export async function GET() {
  try {
    const now = new Date();
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Run all checks in parallel for efficiency
    const [
      recentWebhooks,
      stuckWebhooks,
      lastReconciliation,
      proUserCount,
      stripeSubscriptionCount,
      lastBillingEvent,
    ] = await Promise.all([
      // Count webhooks in last 24 hours
      db
        .select({ count: drizzleSql<number>`count(*)` })
        .from(stripeWebhookEvents)
        .where(gte(stripeWebhookEvents.createdAt, twentyFourHoursAgo)),

      // Count stuck (unprocessed) webhooks older than 30 minutes
      db
        .select({ count: drizzleSql<number>`count(*)` })
        .from(stripeWebhookEvents)
        .where(
          and(
            isNull(stripeWebhookEvents.processedAt),
            drizzleSql`${stripeWebhookEvents.createdAt} < ${thirtyMinutesAgo}`
          )
        ),

      // Get last reconciliation event
      db
        .select({
          createdAt: billingAuditLog.createdAt,
        })
        .from(billingAuditLog)
        .where(eq(billingAuditLog.source, 'reconciliation'))
        .orderBy(drizzleSql`${billingAuditLog.createdAt} DESC`)
        .limit(1),

      // Count Pro users in DB
      db
        .select({ count: drizzleSql<number>`count(*)` })
        .from(users)
        .where(and(eq(users.isPro, true), isNull(users.deletedAt))),

      // Get active subscription count from Stripe
      getStripeActiveSubscriptionCount(),

      // Get most recent billing event timestamp
      db
        .select({
          lastBillingEventAt: drizzleSql<Date>`MAX(${users.lastBillingEventAt})`,
        })
        .from(users),
    ]);

    // Parse results
    const recentWebhookCount = Number(recentWebhooks[0]?.count ?? 0);
    const unprocessedWebhookCount = Number(stuckWebhooks[0]?.count ?? 0);
    const proUsersInDb = Number(proUserCount[0]?.count ?? 0);
    const lastReconciliationAt = lastReconciliation[0]?.createdAt ?? null;
    const lastBillingEventAt = lastBillingEvent[0]?.lastBillingEventAt ?? null;

    // Perform health checks
    const webhooksProcessing = checkWebhooksProcessing(recentWebhookCount);
    const noStuckWebhooks = checkNoStuckWebhooks(unprocessedWebhookCount);
    const recentReconciliation = checkRecentReconciliation(
      lastReconciliationAt,
      twoHoursAgo
    );
    const proCountSync = checkProCountSync(
      proUsersInDb,
      stripeSubscriptionCount
    );

    // Determine overall health
    const allChecks = [
      webhooksProcessing,
      noStuckWebhooks,
      recentReconciliation,
      proCountSync,
    ];
    const hasCritical = allChecks.some(c => c.status === 'critical');
    const hasWarning = allChecks.some(c => c.status === 'warning');

    const result: HealthCheckResult = {
      healthy: !hasCritical,
      timestamp: now.toISOString(),
      checks: {
        webhooksProcessing,
        noStuckWebhooks,
        recentReconciliation,
        proCountSync,
      },
      metrics: {
        proUsersInDb,
        activeSubscriptionsInStripe: stripeSubscriptionCount,
        recentWebhookCount,
        unprocessedWebhookCount,
        lastReconciliationAt: lastReconciliationAt?.toISOString() ?? null,
        lastBillingEventAt: lastBillingEventAt?.toISOString() ?? null,
      },
    };

    // Log warnings/criticals to error tracking
    if (hasCritical || hasWarning) {
      await captureWarning(
        `Billing health check ${hasCritical ? 'critical' : 'warning'}`,
        undefined,
        {
          checks: result.checks,
          metrics: result.metrics,
        }
      );
    }

    const statusCode = hasCritical ? 503 : hasWarning ? 200 : 200;

    return NextResponse.json(result, {
      status: statusCode,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    console.error('Billing health check failed:', error);

    return NextResponse.json(
      {
        healthy: false,
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Health check failed',
      },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}

/**
 * Get count of active subscriptions from Stripe
 */
async function getStripeActiveSubscriptionCount(): Promise<number> {
  try {
    let count = 0;

    // Count active subscriptions
    count += await countSubscriptionsWithStatus('active');

    // Also count trialing subscriptions
    count += await countSubscriptionsWithStatus('trialing');

    return count;
  } catch (error) {
    console.error('Failed to get Stripe subscription count:', error);
    return -1; // Return -1 to indicate error
  }
}

/**
 * Count subscriptions with a specific status, handling pagination
 */
async function countSubscriptionsWithStatus(
  status: 'active' | 'trialing'
): Promise<number> {
  let count = 0;
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const result = await stripe.subscriptions.list({
      status,
      limit: 100,
      starting_after: startingAfter,
    });

    count += result.data.length;
    hasMore = result.has_more;

    if (result.data.length > 0) {
      startingAfter = result.data[result.data.length - 1].id;
    }
  }

  return count;
}

/**
 * Check if webhooks are being processed (received in last 24h)
 */
function checkWebhooksProcessing(recentCount: number): HealthCheck {
  // In a healthy system, we should receive at least some webhooks
  // But zero webhooks might be normal for a new/quiet account
  if (recentCount === 0) {
    return {
      status: 'warning',
      message: 'No webhook events in last 24 hours',
      details: { recentCount },
    };
  }

  return {
    status: 'healthy',
    message: `${recentCount} webhook events in last 24 hours`,
    details: { recentCount },
  };
}

/**
 * Check for stuck/unprocessed webhooks
 */
function checkNoStuckWebhooks(stuckCount: number): HealthCheck {
  if (stuckCount > 10) {
    return {
      status: 'critical',
      message: `${stuckCount} stuck webhooks older than 30 minutes`,
      details: { stuckCount },
    };
  }

  if (stuckCount > 0) {
    return {
      status: 'warning',
      message: `${stuckCount} unprocessed webhooks`,
      details: { stuckCount },
    };
  }

  return {
    status: 'healthy',
    message: 'No stuck webhooks',
    details: { stuckCount },
  };
}

/**
 * Check if reconciliation ran recently
 */
function checkRecentReconciliation(
  lastRun: Date | null,
  threshold: Date
): HealthCheck {
  if (!lastRun) {
    return {
      status: 'warning',
      message: 'No reconciliation events found',
      details: { lastRun: null },
    };
  }

  if (lastRun < threshold) {
    return {
      status: 'warning',
      message: `Last reconciliation was ${Math.round(
        (Date.now() - lastRun.getTime()) / (60 * 60 * 1000)
      )} hours ago`,
      details: { lastRun: lastRun.toISOString() },
    };
  }

  return {
    status: 'healthy',
    message: 'Reconciliation ran recently',
    details: { lastRun: lastRun.toISOString() },
  };
}

/**
 * Check if Pro user count matches Stripe active subscriptions
 */
function checkProCountSync(dbCount: number, stripeCount: number): HealthCheck {
  if (stripeCount === -1) {
    return {
      status: 'warning',
      message: 'Could not fetch Stripe subscription count',
      details: { dbCount, stripeCount: 'error' },
    };
  }

  // Calculate difference
  const diff = Math.abs(dbCount - stripeCount);
  const percentDiff = stripeCount > 0 ? (diff / stripeCount) * 100 : 0;

  if (percentDiff > PRO_COUNT_TOLERANCE_PERCENT && diff > 5) {
    return {
      status: 'warning',
      message: `Pro count mismatch: DB has ${dbCount}, Stripe has ${stripeCount} (${percentDiff.toFixed(
        1
      )}% diff)`,
      details: { dbCount, stripeCount, diff, percentDiff },
    };
  }

  return {
    status: 'healthy',
    message: `Pro counts in sync: DB=${dbCount}, Stripe=${stripeCount}`,
    details: { dbCount, stripeCount },
  };
}
