import type { PriceInterval, PriceLockSnapshot } from './price-versions';
export const PRICE_LOCK_VERDICTS = [
  'ok',
  'overcharged',
  'undercharged',
  'missing_lock',
  'unmapped_locked_price',
] as const;
export type PriceLockVerdict = (typeof PRICE_LOCK_VERDICTS)[number];
export interface ReconcileSubscription {
  readonly subscriptionId: string;
  readonly status: string;
  readonly priceId: string | null;
  readonly mappedPlan?: string | null;
  readonly unitAmountCents: number | null;
  readonly currency: string | null;
  readonly interval: PriceInterval | null;
}
export interface ReconcileCandidate {
  readonly userId: string;
  readonly lock: PriceLockSnapshot | null;
  readonly subscription: ReconcileSubscription | null;
}
export interface ReconcileFinding {
  readonly userId: string;
  readonly subscriptionId: string | null;
  readonly verdict: PriceLockVerdict;
  readonly detail: string;
}
const CHARGING_STATUSES = new Set(['active', 'trialing', 'past_due']);
export function judgeCandidate(
  candidate: ReconcileCandidate,
  isPriceMapped: (priceId: string) => boolean
): ReconcileFinding | null {
  const { userId, lock, subscription } = candidate;
  if (!subscription || !CHARGING_STATUSES.has(subscription.status)) return null;
  // This snapshot promises Pro pricing only; a different plan has no Pro lock obligation.
  if (subscription.mappedPlan && subscription.mappedPlan !== 'pro') return null;
  const base = { userId, subscriptionId: subscription.subscriptionId };
  const finding = (verdict: PriceLockVerdict, detail: string) => ({
    ...base,
    verdict,
    detail,
  });
  if (!lock) {
    return finding('missing_lock', 'paying subscriber has no price lock');
  }
  const lockedIds = [lock.stripePriceIdMonthly, lock.stripePriceIdYearly];
  const unmapped = lockedIds.find(id => id && !isPriceMapped(id));
  if (unmapped) {
    return finding(
      'unmapped_locked_price',
      `locked price ${unmapped} is not mapped to a plan`
    );
  }
  if (subscription.priceId && lockedIds.includes(subscription.priceId)) {
    return finding('ok', 'price id matches the lock');
  }
  const interval = subscription.interval;
  if (subscription.unitAmountCents === null || !interval) {
    return finding(
      'unmapped_locked_price',
      `subscription price ${subscription.priceId ?? 'unknown'} has no comparable amount or interval for lock ${lock.priceVersionId}`
    );
  }
  const lockedAmount =
    interval === 'month' ? lock.monthlyAmountCents : lock.yearlyAmountCents;
  // An interval absent from the snapshot was never price-locked.
  if (lockedAmount === null) return null;
  if (
    subscription.unitAmountCents === lockedAmount &&
    (subscription.currency ?? lock.currency) === lock.currency
  ) {
    return finding('ok', 'amount matches the lock');
  }
  const over = subscription.unitAmountCents > lockedAmount;
  return finding(
    over ? 'overcharged' : 'undercharged',
    `charging ${subscription.unitAmountCents} cents per ${interval}, lock ${lock.priceVersionId} is ${lockedAmount}`
  );
}
export interface ReconcileSummary {
  readonly checked: number;
  readonly counts: Readonly<Record<PriceLockVerdict, number>>;
  readonly findings: readonly ReconcileFinding[];
  readonly alarms: readonly ReconcileFinding[];
}
export function reconcilePriceLocks(
  candidates: readonly ReconcileCandidate[],
  isPriceMapped: (priceId: string) => boolean
): ReconcileSummary {
  const counts = Object.fromEntries(
    PRICE_LOCK_VERDICTS.map(verdict => [verdict, 0])
  ) as Record<PriceLockVerdict, number>;
  const findings = candidates.flatMap(
    candidate => judgeCandidate(candidate, isPriceMapped) ?? []
  );
  for (const finding of findings) counts[finding.verdict] += 1;
  return {
    checked: findings.length,
    counts,
    findings,
    alarms: findings.filter(f => f.verdict !== 'ok'),
  };
}
export function alarmSeverity(
  verdict: PriceLockVerdict
): 'blocked' | 'degraded' {
  return verdict === 'overcharged' ? 'blocked' : 'degraded';
}
