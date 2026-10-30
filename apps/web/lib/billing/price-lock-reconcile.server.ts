import 'server-only';

import { eq, inArray, isNotNull } from 'drizzle-orm';
import type Stripe from 'stripe';
import type { DbOrTransaction } from '@/lib/db';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { priceLocks } from '@/lib/db/schema/billing';
import { captureCriticalError } from '@/lib/error-tracking';
import { captureRevenueSpineFailure } from '@/lib/observability/revenue-spine';
import { getPriceMappingDetails } from '@/lib/stripe/config';
import {
  backfillSubscriberPriceLocks,
  type PriceLockBackfillResult,
  rowToSnapshot,
} from './price-lock.server';
import {
  alarmSeverity,
  type ReconcileCandidate,
  type ReconcileSubscription,
  type ReconcileSummary,
  reconcilePriceLocks,
} from './price-lock-reconcile';

/** Per-run cap on individual Summer alarms; the aggregate alarm is uncapped. */
export const MAX_INDIVIDUAL_ALARMS = 20;

export function toReconcileSubscription(
  sub: Stripe.Subscription
): ReconcileSubscription {
  const item = sub.items.data[0];
  const interval = item?.price?.recurring?.interval;
  return {
    subscriptionId: sub.id,
    status: sub.status,
    priceId: item?.price?.id ?? null,
    unitAmountCents: item?.price?.unit_amount ?? null,
    currency: item?.price?.currency ?? null,
    interval:
      interval === 'month' ? 'month' : interval === 'year' ? 'year' : null,
  };
}

export interface PriceLockReconcileResult {
  readonly backfill: PriceLockBackfillResult;
  readonly summary: ReconcileSummary;
  readonly alarmed: number;
}

/**
 * JOV-INV-047 consumer: daily price lock reconcile.
 */
/**
 * Daily: self-heal missing subscriber locks, then compare every paying
 * subscription in Stripe with its lock, stamp the verdict on the lock and
 * alarm Summer (revenue-spine `plan_mismatch`, the channel Summer watches) on
 * any mismatch. Runs inside the existing billing-reconciliation job, so it
 * adds no cron and one paged Stripe list (100 subscriptions per call).
 */
export async function runPriceLockReconcile(deps: {
  readonly listSubscriptions: () => AsyncIterable<Stripe.Subscription>;
  readonly client?: DbOrTransaction;
  readonly now?: Date;
}): Promise<PriceLockReconcileResult> {
  const client = deps.client ?? db;
  const now = deps.now ?? new Date();

  const backfill = await backfillSubscriberPriceLocks(client, now);

  const rows = await client
    .select({
      userId: users.id,
      subscriptionId: users.stripeSubscriptionId,
      lock: priceLocks,
    })
    .from(users)
    .leftJoin(priceLocks, eq(priceLocks.userId, users.id))
    .where(isNotNull(users.stripeSubscriptionId));

  const bySubscription = new Map<string, ReconcileSubscription>();
  for await (const sub of deps.listSubscriptions()) {
    bySubscription.set(sub.id, toReconcileSubscription(sub));
  }

  const candidates: ReconcileCandidate[] = rows.map(row => ({
    userId: row.userId,
    lock: row.lock ? rowToSnapshot(row.lock) : null,
    subscription: row.subscriptionId
      ? (bySubscription.get(row.subscriptionId) ?? null)
      : null,
  }));

  const summary = reconcilePriceLocks(
    candidates,
    priceId => getPriceMappingDetails(priceId) !== null
  );

  // Stamp verdicts (one statement per verdict, not per user).
  for (const verdict of Object.keys(summary.counts) as Array<
    keyof typeof summary.counts
  >) {
    const ids = summary.findings
      .filter(f => f.verdict === verdict && f.verdict !== 'missing_lock')
      .map(f => f.userId);
    if (ids.length === 0) continue;
    await client
      .update(priceLocks)
      .set({ reconcileStatus: verdict, reconciledAt: now })
      .where(inArray(priceLocks.userId, ids));
  }

  let alarmed = 0;
  for (const finding of summary.alarms.slice(0, MAX_INDIVIDUAL_ALARMS)) {
    captureRevenueSpineFailure({
      stage: 'stripe_sync',
      failureCode: 'plan_mismatch',
      severity: alarmSeverity(finding.verdict),
      userId: finding.userId,
    });
    alarmed += 1;
  }
  if (summary.alarms.length > 0) {
    await captureCriticalError(
      'Price lock reconcile found mismatches',
      new Error(
        `price lock mismatch: ${JSON.stringify(summary.counts)} (${summary.alarms.length} alarms)`
      ),
      {
        job: 'price-lock-reconcile',
        counts: summary.counts,
        sample: summary.alarms.slice(0, 5).map(f => ({
          userId: f.userId,
          verdict: f.verdict,
          detail: f.detail,
        })),
      }
    );
  }

  return { backfill, summary, alarmed };
}
