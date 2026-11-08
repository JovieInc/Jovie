/** Signup price versions; amounts from plan-prices, Stripe IDs snapshotted at lock time (JOV-9769). */

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
      `price version mismatch: current version ${currentId} is ${current.monthlyUsd} USD per month, list price is ${listMonthlyUsd} USD per month (a new version must be registered and made current)`
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
/** Backfill lock from a live subscription price (matching version, else `sub-price:<id>`). */
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
/** The price a person sees and pays: their lock for the interval, else the current list version. */
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

/** Monthly or yearly label such as "$N/mo": whole dollars drop the cents. */
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

/** Disclosure: states only the person's own locked amount. */
export function priceLockDisclosure(
  price: Pick<ResolvedLockedPrice, 'amountCents' | 'interval' | 'currency'>
): string {
  return `Your price is locked at ${formatLockedPrice(price)}. It stays the same if the list price changes.`;
}
