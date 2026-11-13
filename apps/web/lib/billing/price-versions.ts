import { ARTIST_VISIBILITY_OFFER } from '@/lib/config/plan-prices';
export type PriceLockPlan = 'pro';
export type PriceInterval = 'month' | 'year';
export interface PriceVersion {
  readonly id: string;
  readonly plan: PriceLockPlan;
  readonly monthlyUsd: number;
  readonly yearlyUsd: number | null;
  readonly currency: 'usd';
  readonly introducedOn: string;
}
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
export const CURRENT_PRICE_VERSION_ID = 'pro-2026-10-20-m12';
export const PRICE_LOCK_SOURCES = [
  'signup',
  'waitlist',
  'checkout',
  'first_view',
  'backfill_subscription',
] as const;
export type PriceLockSource = (typeof PRICE_LOCK_SOURCES)[number];
export interface PriceLockSnapshot {
  readonly plan: PriceLockPlan;
  readonly priceVersionId: string;
  readonly currency: string;
  readonly monthlyAmountCents: number | null;
  readonly yearlyAmountCents: number | null;
  readonly stripePriceIdMonthly: string | null;
  readonly stripePriceIdYearly: string | null;
  readonly source: PriceLockSource;
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
      `price version mismatch: current version ${currentId} is ${current.monthlyUsd} USD (interval=month), list price is ${listMonthlyUsd} USD (interval=month) (a new version must be registered and made current)`
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
  readonly locked: boolean;
}
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
export function priceLockDisclosure(
  price: Pick<ResolvedLockedPrice, 'amountCents' | 'interval' | 'currency'>
): string {
  return `Your price is locked at ${formatLockedPrice(price)}. It stays the same if the list price changes.`;
}
