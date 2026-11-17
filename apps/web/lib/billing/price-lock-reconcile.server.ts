import 'server-only';

import { eq, inArray, isNotNull } from 'drizzle-orm';
import type Stripe from 'stripe';
import { type DbOrTransaction, db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { priceLocks } from '@/lib/db/schema/billing';
import { captureCriticalError } from '@/lib/error-tracking';
import { captureRevenueSpineFailure } from '@/lib/observability/revenue-spine';
import { getPriceMappingDetails } from '@/lib/stripe/config';
import {
  backfillSubscriberPriceLocks,
  rowToSnapshot,
} from './price-lock.server';
import {
  alarmSeverity,
  PRICE_LOCK_VERDICTS,
  type ReconcileSubscription,
  reconcilePriceLocks,
} from './price-lock-reconcile';

/** Per-run cap on individual Summer alarms; the aggregate alarm is uncapped. */
export const MAX_INDIVIDUAL_ALARMS = 20;

export function toReconcileSubscription(
  sub: Stripe.Subscription
): ReconcileSubscription {
  const price = sub.items.data[0]?.price;
  const priceId = price?.id ?? null;
  const interval = price?.recurring?.interval;
  const mapping = priceId ? getPriceMappingDetails(priceId) : null;
  return {
    subscriptionId: sub.id,
    status: sub.status,
    priceId,
    mappedPlan: mapping?.plan ?? null,
    unitAmountCents: price?.unit_amount ?? null,
    currency: price?.currency ?? null,
    interval: interval === 'month' || interval === 'year' ? interval : null,
  };
}

/**
 * JOV-INV-048 consumer: daily price lock reconcile. Backfills, compares each
 * paying subscription with its lock, stamps verdicts, alarms plan_mismatch.
 */
export async function runPriceLockReconcile(deps: {
  readonly listSubscriptions: () => AsyncIterable<Stripe.Subscription>;
  readonly client?: DbOrTransaction;
  readonly now?: Date;
}) {
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

  const candidates = rows.map(row => ({
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

  // Preserve blocked findings when the per-run alarm cap truncates lower-severity noise.
  const alarms = [...summary.alarms].sort(
    (a, b) =>
      Number(alarmSeverity(b.verdict) === 'blocked') -
      Number(alarmSeverity(a.verdict) === 'blocked')
  );
  let alarmed = 0;
  for (const finding of alarms.slice(0, MAX_INDIVIDUAL_ALARMS)) {
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
        sample: alarms.slice(0, 5).map(f => ({
          userId: f.userId,
          verdict: f.verdict,
          detail: f.detail,
        })),
      }
    );
  }

  // Report observed mismatches before stamp writes; a failed write still rejects the job.
  // Stamp verdicts (one statement per verdict, not per user).
  for (const verdict of PRICE_LOCK_VERDICTS) {
    const ids = summary.findings
      .filter(f => f.verdict === verdict && f.verdict !== 'missing_lock')
      .map(f => f.userId);
    if (ids.length === 0) continue;
    await client
      .update(priceLocks)
      .set({ reconcileStatus: verdict, reconciledAt: now })
      .where(inArray(priceLocks.userId, ids));
  }

  return { backfill, summary, alarmed } as const;
}
