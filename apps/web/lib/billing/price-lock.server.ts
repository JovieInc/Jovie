import 'server-only';

import { and, sql as drizzleSql, eq, isNull } from 'drizzle-orm';
import type { DbOrTransaction } from '@/lib/db';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { type PriceLockRow, priceLocks } from '@/lib/db/schema/billing';
import { captureError } from '@/lib/error-tracking';
import { getPriceMappingDetails } from '@/lib/stripe/config';
import { getStripePriceIds } from '@/lib/stripe/price-ids';
import { logger } from '@/lib/utils/logger';
import {
  type CheckoutPriceDecision,
  resolveCheckoutPrice,
} from './price-lock-checkout';
import {
  buildPriceLockFromSubscriptionPrice,
  buildPriceLockSnapshot,
  type PriceLockSnapshot,
  type PriceLockSource,
  type StripePriceIdSnapshot,
} from './price-versions';

/** Ids the list price checks out with right now (env, via the one reader). */
export function getListStripePriceIds(): StripePriceIdSnapshot {
  const ids = getStripePriceIds();
  return {
    monthly: ids.artistVisibilityProMonthly ?? null,
    yearly: ids.proAnnual || ids.proYearly || null,
  };
}

export function rowToSnapshot(row: PriceLockRow): PriceLockSnapshot {
  return {
    plan: row.plan as PriceLockSnapshot['plan'],
    priceVersionId: row.priceVersionId,
    currency: row.currency,
    monthlyAmountCents: row.monthlyAmountCents,
    yearlyAmountCents: row.yearlyAmountCents,
    stripePriceIdMonthly: row.stripePriceIdMonthly,
    stripePriceIdYearly: row.stripePriceIdYearly,
    source: row.source as PriceLockSource,
    lockedAt: row.lockedAt.toISOString(),
  };
}

function snapshotToValues(snapshot: PriceLockSnapshot) {
  return {
    plan: snapshot.plan,
    priceVersionId: snapshot.priceVersionId,
    currency: snapshot.currency,
    monthlyAmountCents: snapshot.monthlyAmountCents,
    yearlyAmountCents: snapshot.yearlyAmountCents,
    stripePriceIdMonthly: snapshot.stripePriceIdMonthly,
    stripePriceIdYearly: snapshot.stripePriceIdYearly,
    source: snapshot.source,
    lockedAt: new Date(snapshot.lockedAt),
  };
}

export async function getPriceLockRowForUser(
  userId: string,
  client: DbOrTransaction = db
): Promise<PriceLockRow | null> {
  const [row] = await client
    .select()
    .from(priceLocks)
    .where(eq(priceLocks.userId, userId))
    .limit(1);
  return row ?? null;
}

export async function getPriceLockForUser(
  userId: string,
  client: DbOrTransaction = db
): Promise<PriceLockSnapshot | null> {
  const row = await getPriceLockRowForUser(userId, client);
  return row ? rowToSnapshot(row) : null;
}

/**
 * The lock for a user, created on first need: the existing lock, else the
 * current list version snapshotted. Idempotent and safe under races (unique
 * index on user_id), and the first write wins, so the price a person first
 * gets never moves.
 */
export async function ensurePriceLockForUser(
  userId: string,
  source: PriceLockSource,
  client: DbOrTransaction = db,
  now = new Date()
): Promise<PriceLockSnapshot> {
  const existing = await getPriceLockForUser(userId, client);
  if (existing) return existing;

  const snapshot = buildPriceLockSnapshot({
    source,
    now,
    stripePriceIds: getListStripePriceIds(),
  });
  await client
    .insert(priceLocks)
    .values({ ...snapshotToValues(snapshot), userId })
    .onConflictDoNothing();
  const created = await getPriceLockForUser(userId, client);
  if (!created) throw new Error('price lock insert did not persist');
  return created;
}

/**
 * Provisioning hooks use this: a lock failure must never fail sign-in or a
 * waitlist join. The checkout path re-ensures the lock and fails closed, and
 * the daily reconcile reports users who have none.
 */
export async function ensurePriceLockForUserSafely(
  userId: string,
  source: PriceLockSource
): Promise<void> {
  try {
    await ensurePriceLockForUser(userId, source);
  } catch (error) {
    logger.warn('[price-lock] ensure failed', error);
    await captureError('Price lock ensure failed', error, {
      operation: 'ensurePriceLockForUserSafely',
      source,
    });
  }
}

/** Lock for a live subscription's price, or null when the price is unmapped. */
export function snapshotFromSubscriptionPriceId(
  stripePriceId: string,
  now = new Date()
): PriceLockSnapshot | null {
  const mapping = getPriceMappingDetails(stripePriceId);
  if (!mapping || mapping.plan !== 'pro') return null;
  return buildPriceLockFromSubscriptionPrice({
    stripePriceId,
    plan: 'pro',
    amountCents: mapping.amount,
    interval: mapping.interval,
    currency: mapping.currency,
    now,
  });
}

export interface PriceLockBackfillResult {
  readonly scanned: number;
  readonly created: number;
  readonly unmapped: readonly string[];
}

/**
 * Backfills locks for paying subscribers from the price they pay today
 * (users.stripe_price_id). Grandfathered accounts keep the price they pay
 * because the lock copies their subscription price. People with no paid subscription are locked on
 * first need (signup hook, first price view, checkout), not retroactively.
 * Idempotent; the daily reconcile runs it so a missed hook self-heals.
 */
export async function backfillSubscriberPriceLocks(
  client: DbOrTransaction = db,
  now = new Date(),
  limit = 5000
): Promise<PriceLockBackfillResult> {
  const rows = await client
    .select({ id: users.id, priceId: users.stripePriceId })
    .from(users)
    .leftJoin(priceLocks, eq(priceLocks.userId, users.id))
    .where(
      and(
        isNull(priceLocks.id),
        drizzleSql`${users.stripeSubscriptionId} IS NOT NULL`,
        drizzleSql`${users.stripePriceId} IS NOT NULL`
      )
    )
    .limit(limit);

  let created = 0;
  const unmapped: string[] = [];
  for (const row of rows) {
    if (!row.priceId) continue;
    const snapshot = snapshotFromSubscriptionPriceId(row.priceId, now);
    if (!snapshot) {
      unmapped.push(row.id);
      continue;
    }
    const inserted = await client
      .insert(priceLocks)
      .values({ ...snapshotToValues(snapshot), userId: row.id })
      .onConflictDoNothing()
      .returning({ id: priceLocks.id });
    created += inserted.length;
  }
  return { scanned: rows.length, created, unmapped };
}

/**
 * The one server entry for "which price is this person charged for the price
 * id the browser sent". Checkout, plan change and plan-change preview all call
 * it. Creates the lock on first need and fails closed if that cannot happen.
 */
export async function resolveCheckoutPriceForUser(
  userId: string,
  requestedPriceId: string
): Promise<{
  readonly decision: CheckoutPriceDecision;
  readonly lock: PriceLockSnapshot;
}> {
  const lock = await ensurePriceLockForUser(userId, 'checkout');
  const mapping = getPriceMappingDetails(requestedPriceId);
  const decision = resolveCheckoutPrice({
    requestedPriceId,
    requestedMapping: mapping
      ? { plan: mapping.plan, interval: mapping.interval }
      : null,
    lock,
  });
  return { decision, lock };
}
