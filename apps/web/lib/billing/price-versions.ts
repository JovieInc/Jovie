/**
 * Price versions and the price lock model (Tim, 2026-10-29).
 *
 * "Automate the price relationship with signups so they always get the price
 * they sign up at." Hard legal invariant: a person sees ONE consistent price
 * everywhere, and for a person with a lock that price is THEIR locked price.
 *
 * Reuses the existing pricing sources, adds no new price numbers:
 *   - amounts come from `lib/config/plan-prices.ts` (the list price today);
 *   - Stripe price ids come from `lib/stripe/price-ids.ts` env at lock time.
 *
 * This registry only NAMES each list price so a lock can point at it. When the
 * list price changes (JOV-9769: $12 -> $19/mo, $190/yr) a new version is added
 * here and made current; every existing lock keeps pointing at its own
 * snapshot, so the change reaches new signups only. A test fails when the
 * current version stops matching the list price, so a list-price edit cannot
 * ship without registering a version.
 *
 * Pure and client-importable (no server-only, no env).
 */

import { ARTIST_VISIBILITY_OFFER } from '@/lib/config/plan-prices';

export type PriceLockPlan = 'pro';
export type PriceInterval = 'month' | 'year';

export interface PriceVersion {
  readonly id: string;
  readonly plan: PriceLockPlan;
  readonly monthlyUsd: number;
  /** Null when no annual price is offered in this version. */
  readonly yearlyUsd: number | null;
  readonly currency: 'usd';
  /** ISO date this list price became the price for new signups. */
  readonly introducedOn: string;
}

/** Append-only. Never edit or remove a version a lock may point at. */
export const PRICE_VERSIONS: readonly PriceVersion[] = [
  {
    id: 'pro-2026-10-20-m12',
    plan: 'pro',
    monthlyUsd: 12,
    yearlyUsd: null,
    currency: 'usd',
    introducedOn: '2026-10-20',
  },
];

/** The version new signups lock to. Must match the list price (tested). */
export const CURRENT_PRICE_VERSION_ID = 'pro-2026-10-20-m12';

export const PRICE_LOCK_SOURCES = [
  'signup',
  'waitlist',
  'checkout',
  'first_view',
  'backfill_subscription',
] as const;
export type PriceLockSource = (typeof PRICE_LOCK_SOURCES)[number];

/** What a lock stores. Amounts and Stripe ids are snapshots. */
export interface PriceLockSnapshot {
  readonly plan: PriceLockPlan;
  readonly priceVersionId: string;
  readonly currency: string;
  /** Null for a lock taken from an annual subscription. */
  readonly monthlyAmountCents: number | null;
  readonly yearlyAmountCents: number | null;
  readonly stripePriceIdMonthly: string | null;
  readonly stripePriceIdYearly: string | null;
  readonly source: PriceLockSource;
  /** ISO timestamp. */
  readonly lockedAt: string;
}

export function usdToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function assertPriceVersionsValid(
  versions: readonly PriceVersion[] = PRICE_VERSIONS,
  currentId: string = CURRENT_PRICE_VERSION_ID,
  listMonthlyUsd: number = ARTIST_VISIBILITY_OFFER.pro.monthlyUsd
): void {
  const seen = new Set<string>();
  for (const v of versions) {
    if (!v.id.trim() || seen.has(v.id)) {
      throw new Error(`price version ${v.id}: id must be unique and non-empty`);
    }
    seen.add(v.id);
    if (!(v.monthlyUsd > 0) || (v.yearlyUsd !== null && !(v.yearlyUsd > 0))) {
      throw new Error(`price version ${v.id}: amounts must be positive`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.introducedOn)) {
      throw new Error(`price version ${v.id}: introducedOn date required`);
    }
  }
  const current = versions.find(v => v.id === currentId);
  if (!current) {
    throw new Error(`current price version ${currentId} is not registered`);
  }
  if (current.monthlyUsd !== listMonthlyUsd) {
    throw new Error(
      `current price version ${currentId} is $${current.monthlyUsd}/mo but the list price is $${listMonthlyUsd}/mo: register a new price version and make it current (existing locks keep their own snapshot)`
    );
  }
}

export function getCurrentPriceVersion(
  versions: readonly PriceVersion[] = PRICE_VERSIONS,
  currentId: string = CURRENT_PRICE_VERSION_ID
): PriceVersion {
  const current = versions.find(v => v.id === currentId);
  if (!current) {
    throw new Error(`current price version ${currentId} is not registered`);
  }
  return current;
}

export interface StripePriceIdSnapshot {
  readonly monthly: string | null;
  readonly yearly: string | null;
}

/** Builds the lock a new signup gets: the current list version, snapshotted. */
export function buildPriceLockSnapshot(input: {
  readonly source: PriceLockSource;
  readonly now: Date;
  readonly stripePriceIds: StripePriceIdSnapshot;
  readonly versions?: readonly PriceVersion[];
  readonly currentId?: string;
}): PriceLockSnapshot {
  const version = getCurrentPriceVersion(input.versions, input.currentId);
  return {
    plan: version.plan,
    priceVersionId: version.id,
    currency: version.currency,
    monthlyAmountCents: usdToCents(version.monthlyUsd),
    yearlyAmountCents:
      version.yearlyUsd === null ? null : usdToCents(version.yearlyUsd),
    stripePriceIdMonthly: input.stripePriceIds.monthly,
    stripePriceIdYearly:
      version.yearlyUsd === null ? null : input.stripePriceIds.yearly,
    source: input.source,
    lockedAt: input.now.toISOString(),
  };
}

/**
 * Builds a lock from a live subscription's price (backfill). The version is
 * the registered one with the same monthly amount, else a synthetic
 * `sub-price:<id>` so the lock still records exactly what the person pays.
 */
export function buildPriceLockFromSubscriptionPrice(input: {
  readonly stripePriceId: string;
  readonly plan: PriceLockPlan;
  readonly amountCents: number;
  readonly interval: PriceInterval;
  readonly currency: string;
  readonly now: Date;
  readonly versions?: readonly PriceVersion[];
}): PriceLockSnapshot {
  const versions = input.versions ?? PRICE_VERSIONS;
  const monthly = input.interval === 'month';
  const match = versions.find(
    v =>
      v.plan === input.plan &&
      usdToCents(monthly ? v.monthlyUsd : (v.yearlyUsd ?? -1)) ===
        input.amountCents
  );
  return {
    plan: input.plan,
    priceVersionId: match?.id ?? `sub-price:${input.stripePriceId}`,
    currency: input.currency,
    monthlyAmountCents: monthly ? input.amountCents : null,
    yearlyAmountCents: monthly ? null : input.amountCents,
    stripePriceIdMonthly: monthly ? input.stripePriceId : null,
    stripePriceIdYearly: monthly ? null : input.stripePriceId,
    source: 'backfill_subscription',
    lockedAt: input.now.toISOString(),
  };
}

export interface ResolvedLockedPrice {
  readonly amountCents: number;
  readonly currency: string;
  readonly interval: PriceInterval;
  readonly stripePriceId: string | null;
  readonly priceVersionId: string;
  /** True when this came from the person's lock, false when it is the list price. */
  readonly locked: boolean;
}

/**
 * The single answer to "what price does this person see and pay?" for a plan
 * and interval. A person with a lock that covers the interval gets the lock;
 * everyone else gets the current list version. Callers never read the list
 * price themselves for a person (guarded by price-lock-guard.test.ts).
 *
 * `listStripePriceIds` is the ids the list price checks out with now.
 */
export function resolveLockedPrice(input: {
  readonly lock: PriceLockSnapshot | null;
  readonly interval: PriceInterval;
  readonly listStripePriceIds?: StripePriceIdSnapshot;
  readonly versions?: readonly PriceVersion[];
  readonly currentId?: string;
}): ResolvedLockedPrice | null {
  const { lock, interval } = input;
  if (lock) {
    const amount =
      interval === 'month' ? lock.monthlyAmountCents : lock.yearlyAmountCents;
    if (amount !== null) {
      return {
        amountCents: amount,
        currency: lock.currency,
        interval,
        stripePriceId:
          interval === 'month'
            ? lock.stripePriceIdMonthly
            : lock.stripePriceIdYearly,
        priceVersionId: lock.priceVersionId,
        locked: true,
      };
    }
  }
  const version = getCurrentPriceVersion(input.versions, input.currentId);
  const listUsd = interval === 'month' ? version.monthlyUsd : version.yearlyUsd;
  if (listUsd === null) return null;
  return {
    amountCents: usdToCents(listUsd),
    currency: version.currency,
    interval,
    stripePriceId:
      (interval === 'month'
        ? input.listStripePriceIds?.monthly
        : input.listStripePriceIds?.yearly) ?? null,
    priceVersionId: version.id,
    locked: false,
  };
}

/** "$12/mo" or "$190/yr": whole dollars drop the cents. */
export function formatLockedPrice(
  price: Pick<ResolvedLockedPrice, 'amountCents' | 'interval' | 'currency'>
): string {
  const dollars = price.amountCents / 100;
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: price.currency.toUpperCase(),
    maximumFractionDigits: dollars % 1 === 0 ? 0 : 2,
  }).format(dollars);
  return `${formatted}/${price.interval === 'month' ? 'mo' : 'yr'}`;
}

/**
 * The disclosure shown where a locked price is relevant. Accurate by
 * construction: it states the person's own locked amount and nothing about
 * what happens beyond the lock (cancel and resubscribe is a new checkout that
 * still resolves through the lock, so it is not claimed as a reset).
 */
export function priceLockDisclosure(
  price: Pick<ResolvedLockedPrice, 'amountCents' | 'interval' | 'currency'>
): string {
  return `Your price is locked at ${formatLockedPrice(price)}. It stays the same if the list price changes.`;
}
