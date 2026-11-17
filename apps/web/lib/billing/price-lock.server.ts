import 'server-only';
import { and, sql as drizzleSql, eq, isNull } from 'drizzle-orm';
import { type DbOrTransaction, db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { type PriceLockRow, priceLocks } from '@/lib/db/schema/billing';
import { captureError } from '@/lib/error-tracking';
import { getPriceMappingDetails } from '@/lib/stripe/config';
import { getStripePriceIds } from '@/lib/stripe/price-ids';
import { logger } from '@/lib/utils/logger';
import { resolveCheckoutPrice } from './price-lock-checkout';
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
  return { ...snapshot, lockedAt: new Date(snapshot.lockedAt) };
}
export async function getPriceLockForUser(
  userId: string,
  client: DbOrTransaction = db
): Promise<PriceLockSnapshot | null> {
  const [row] = await client
    .select()
    .from(priceLocks)
    .where(eq(priceLocks.userId, userId))
    .limit(1);
  return row ? rowToSnapshot(row) : null;
}
/** Existing lock, else the current version snapshotted; idempotent, first write wins. */
export async function ensurePriceLockForUser(
  userId: string,
  source: PriceLockSource,
  client: DbOrTransaction = db,
  now = new Date()
): Promise<PriceLockSnapshot> {
  const existing = await getPriceLockForUser(userId, client);
  if (existing) return existing;
  // Snapshot an existing subscriber before the daily backfill can race first access.
  const [subscriber] = await client
    .select({
      subscriptionId: users.stripeSubscriptionId,
      priceId: users.stripePriceId,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const mapping = subscriber?.priceId
    ? getPriceMappingDetails(subscriber.priceId)
    : null;
  if (subscriber?.subscriptionId && (!subscriber.priceId || !mapping)) {
    throw new Error('Cannot preserve an unknown subscriber price');
  }
  const snapshot =
    subscriber?.subscriptionId && mapping?.plan === 'pro'
      ? snapshotFromSubscriptionPriceId(subscriber.priceId!, now)!
      : buildPriceLockSnapshot({
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
/** For provisioning hooks: never fails sign-in; checkout re-ensures and fails closed. */
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
/** Idempotent backfill: paying subscribers lock at the price they pay today. */
export async function backfillSubscriberPriceLocks(
  client: DbOrTransaction = db,
  now = new Date(),
  limit = 5000
) {
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
  const scanned = rows.length;
  return { scanned, created, unmapped: unmapped as readonly string[] } as const;
}
/** The price charged for a requested price id; creates the lock or fails closed. */
export async function resolveCheckoutPriceForUser(
  userId: string,
  requestedPriceId: string
) {
  const lock = await ensurePriceLockForUser(userId, 'checkout');
  return {
    decision: resolveCheckoutPrice({
      requestedPriceId,
      requestedMapping: getPriceMappingDetails(requestedPriceId),
      lock,
    }),
    lock,
  } as const;
}
