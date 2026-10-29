/**
 * Price lock reconciliation (pure): compares what Stripe is charging each
 * subscriber with the price they locked.
 *
 * Verdicts, worst first:
 * - overcharged: Stripe charges more than the lock. Legal exposure, blocked.
 * - undercharged: Stripe charges less than the lock. Revenue leak, degraded.
 * - missing_lock: a paying subscriber has no lock. Self-heals by backfill, but
 *   a persisting one means a recording path is broken.
 * - unmapped_locked_price: the lock names a Stripe price the app cannot map to
 *   a plan, so a webhook for it would not grant the plan.
 * - ok: price id matches the lock, or a different price object has the same
 *   amount, currency and interval.
 */

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
  readonly unitAmountCents: number | null;
  readonly currency: string | null;
  readonly interval: PriceInterval | null;
}

export interface ReconcileCandidate {
  readonly userId: string;
  readonly lock: PriceLockSnapshot | null;
  /** Null when Stripe has no such subscription (handled by billing reconciliation). */
  readonly subscription: ReconcileSubscription | null;
}

export interface ReconcileFinding {
  readonly userId: string;
  readonly subscriptionId: string | null;
  readonly verdict: PriceLockVerdict;
  readonly detail: string;
}

const CHARGING_STATUSES = new Set(['active', 'trialing', 'past_due']);

export function isChargingStatus(status: string): boolean {
  return CHARGING_STATUSES.has(status);
}

export function judgeCandidate(
  candidate: ReconcileCandidate,
  /** True when the app can map this Stripe price id to a plan. */
  isPriceMapped: (priceId: string) => boolean
): ReconcileFinding | null {
  const { userId, lock, subscription } = candidate;
  if (!subscription || !isChargingStatus(subscription.status)) return null;
  const base = { userId, subscriptionId: subscription.subscriptionId };

  if (!lock) {
    return {
      ...base,
      verdict: 'missing_lock',
      detail: 'paying subscriber has no price lock',
    };
  }

  const lockedIds = [lock.stripePriceIdMonthly, lock.stripePriceIdYearly];
  for (const id of lockedIds) {
    if (id && !isPriceMapped(id)) {
      return {
        ...base,
        verdict: 'unmapped_locked_price',
        detail: `locked price ${id} is not mapped to a plan`,
      };
    }
  }

  if (subscription.priceId && lockedIds.includes(subscription.priceId)) {
    return { ...base, verdict: 'ok', detail: 'price id matches the lock' };
  }

  const interval = subscription.interval;
  const lockedAmount = interval
    ? interval === 'month'
      ? lock.monthlyAmountCents
      : lock.yearlyAmountCents
    : null;
  if (
    lockedAmount === null ||
    subscription.unitAmountCents === null ||
    !interval
  ) {
    return {
      ...base,
      verdict: 'overcharged',
      detail: `subscription price ${subscription.priceId ?? 'unknown'} (${interval ?? 'unknown interval'}) is not covered by lock ${lock.priceVersionId}`,
    };
  }
  if (
    subscription.unitAmountCents === lockedAmount &&
    (subscription.currency ?? lock.currency) === lock.currency
  ) {
    return { ...base, verdict: 'ok', detail: 'amount matches the lock' };
  }
  const over = subscription.unitAmountCents > lockedAmount;
  return {
    ...base,
    verdict: over ? 'overcharged' : 'undercharged',
    detail: `charging ${subscription.unitAmountCents} cents per ${interval}, lock ${lock.priceVersionId} is ${lockedAmount}`,
  };
}

export interface ReconcileSummary {
  readonly checked: number;
  readonly counts: Readonly<Record<PriceLockVerdict, number>>;
  readonly findings: readonly ReconcileFinding[];
  /** Findings that need an alarm (everything but ok). */
  readonly alarms: readonly ReconcileFinding[];
}

export function reconcilePriceLocks(
  candidates: readonly ReconcileCandidate[],
  isPriceMapped: (priceId: string) => boolean
): ReconcileSummary {
  const counts: Record<PriceLockVerdict, number> = {
    ok: 0,
    overcharged: 0,
    undercharged: 0,
    missing_lock: 0,
    unmapped_locked_price: 0,
  };
  const findings: ReconcileFinding[] = [];
  let checked = 0;
  for (const candidate of candidates) {
    const finding = judgeCandidate(candidate, isPriceMapped);
    if (!finding) continue;
    checked += 1;
    counts[finding.verdict] += 1;
    findings.push(finding);
  }
  return {
    checked,
    counts,
    findings,
    alarms: findings.filter(f => f.verdict !== 'ok'),
  };
}

/** Overcharge is a legal exposure; the rest degrade. */
export function alarmSeverity(
  verdict: PriceLockVerdict
): 'blocked' | 'degraded' {
  return verdict === 'overcharged' ? 'blocked' : 'degraded';
}
