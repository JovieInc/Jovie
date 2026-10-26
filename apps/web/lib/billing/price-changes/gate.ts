/**
 * Effect gate. Decides, from recorded facts only, whether a scheduled price
 * change may be applied to Stripe subscriptions. Pure and deterministic.
 *
 * Rules:
 * - Before the effective date nothing is applied.
 * - A notice counts only when the provider accepted it (status `sent`) or the
 *   address is permanently undeliverable AND an alternate-channel notice is on
 *   record. `skipped`, failed, no-recipient and soft-bounced rows are NOT
 *   notified.
 * - If any affected subscription lacks a valid notice, the WHOLE change is held
 *   and an incident is raised.
 * - A notified subscription switches only once now >= sentAt + N days. A late
 *   joiner whose notice is recent is deferred, not blocking.
 * - Price decreases are never held.
 */

import {
  isPriceIncrease,
  MS_PER_DAY,
  PRICE_CHANGE_NOTICE_DAYS,
  parseUtcDay,
} from './rules';
import type { NoticeRow, ScheduledPriceChange } from './types';

export type GateDecision =
  | { readonly kind: 'not_due' }
  | { readonly kind: 'cancelled' }
  | {
      readonly kind: 'hold';
      readonly missing: readonly string[];
      readonly reasons: Readonly<Record<string, string>>;
    }
  | {
      readonly kind: 'proceed';
      readonly ready: readonly string[];
      readonly deferred: readonly string[];
      readonly alreadyApplied: readonly string[];
    };

/** Instant a valid notice reached (or was documented for) the subscriber. */
export function validNoticeAt(row: NoticeRow | undefined): Date | null {
  if (!row) return null;
  if (row.status === 'sent' && row.sentAt && row.providerMessageId) {
    return row.sentAt;
  }
  if (row.status === 'permanent_bounce' && row.fallbackNoticeAt) {
    return row.fallbackNoticeAt;
  }
  return null;
}

export function noticeProblem(row: NoticeRow | undefined): string {
  if (!row) return 'no notice row';
  if (row.status === 'permanent_bounce') {
    return 'permanent bounce without a documented alternate-channel notice';
  }
  return `notice status ${row.status}${row.lastError ? `: ${row.lastError}` : ''}`;
}

export function evaluateGate(input: {
  readonly change: ScheduledPriceChange;
  readonly now: Date;
  /** Subscription ids currently on the old price (from Stripe). */
  readonly affectedSubscriptionIds: readonly string[];
  readonly notices: readonly NoticeRow[];
}): GateDecision {
  const { change, now, affectedSubscriptionIds, notices } = input;
  if (change.cancelledAt) return { kind: 'cancelled' };
  const effective = parseUtcDay(change.effectiveDate);
  if (!effective) {
    return {
      kind: 'hold',
      missing: ['*'],
      reasons: { '*': 'invalid effectiveDate' },
    };
  }
  if (now.getTime() < effective.getTime()) return { kind: 'not_due' };

  const bySub = new Map(notices.map(row => [row.subscriptionId, row]));
  const increase = isPriceIncrease(change);
  const missing: string[] = [];
  const reasons: Record<string, string> = {};
  const ready: string[] = [];
  const deferred: string[] = [];
  const alreadyApplied: string[] = [];

  for (const subscriptionId of affectedSubscriptionIds) {
    const row = bySub.get(subscriptionId);
    if (row?.appliedAt) {
      alreadyApplied.push(subscriptionId);
      continue;
    }
    if (!increase) {
      ready.push(subscriptionId);
      continue;
    }
    const noticeAt = validNoticeAt(row);
    if (!noticeAt) {
      missing.push(subscriptionId);
      reasons[subscriptionId] = noticeProblem(row);
      continue;
    }
    const notBefore =
      noticeAt.getTime() + PRICE_CHANGE_NOTICE_DAYS * MS_PER_DAY;
    if (now.getTime() >= notBefore) ready.push(subscriptionId);
    else deferred.push(subscriptionId);
  }

  if (missing.length > 0) return { kind: 'hold', missing, reasons };
  return { kind: 'proceed', ready, deferred, alreadyApplied };
}

/** True when every affected subscription has a valid notice on record. */
export function isFullyNotified(input: {
  readonly change: ScheduledPriceChange;
  readonly affectedSubscriptionIds: readonly string[];
  readonly notices: readonly NoticeRow[];
}): boolean {
  if (!isPriceIncrease(input.change)) return true;
  const bySub = new Map(input.notices.map(row => [row.subscriptionId, row]));
  return input.affectedSubscriptionIds.every(
    id =>
      validNoticeAt(bySub.get(id)) !== null || Boolean(bySub.get(id)?.appliedAt)
  );
}
