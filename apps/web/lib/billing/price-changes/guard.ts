/**
 * Price-change guard. Compares the live price table and the change registry at
 * the base ref with HEAD and returns every violation. Stateless: the only clock
 * input is `today`.
 *
 * Invariant: an existing plan's live price can only change in a commit that
 * flips it to the new amount of a record that
 *   1. was already merged to the base (so the notice window ran), and
 *   2. gave at least PRICE_CHANGE_NOTICE_DAYS between scheduledAt and effectiveDate, and
 *   3. has reached its effective date.
 * New price keys (new plans) are exempt. Price decreases are exempt.
 */

import {
  isPriceIncrease,
  PRICE_CHANGE_NOTICE_DAYS,
  validateRecordShape,
  wholeDaysBetween,
} from './rules';
import type { LivePriceTable, ScheduledPriceChange } from './types';

export interface GuardInput {
  readonly baseLive: LivePriceTable;
  readonly headLive: LivePriceTable;
  readonly baseRecords: readonly ScheduledPriceChange[];
  readonly headRecords: readonly ScheduledPriceChange[];
  /** UTC day, YYYY-MM-DD. */
  readonly today: string;
}

const MUTABLE_ADDITION = 'cancelledAt';

function stableJson(change: ScheduledPriceChange): string {
  const { [MUTABLE_ADDITION]: _ignored, ...rest } = change;
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(rest).sort(([a], [b]) => a.localeCompare(b))
    )
  );
}

export function evaluatePriceChangeGuard(input: GuardInput): string[] {
  const { baseLive, headLive, baseRecords, headRecords, today } = input;
  const violations: string[] = [];
  const baseById = new Map(baseRecords.map(record => [record.id, record]));
  const headById = new Map(headRecords.map(record => [record.id, record]));

  if (headById.size !== headRecords.length) {
    violations.push('registry has duplicate record ids');
  }

  // Merged records are immutable (cancellation may be added) and never deleted.
  for (const base of baseRecords) {
    const head = headById.get(base.id);
    if (!head) {
      violations.push(`${base.id}: a merged price-change record was removed`);
    } else if (stableJson(head) !== stableJson(base)) {
      violations.push(
        `${base.id}: a merged price-change record was edited; add a cancelledAt and a new record instead`
      );
    }
  }

  // New records must give the full notice window from today.
  for (const head of headRecords) {
    if (baseById.has(head.id)) continue;
    violations.push(...validateRecordShape(head));
    const lead = wholeDaysBetween(today, head.effectiveDate);
    if (
      isPriceIncrease(head) &&
      (lead === null || lead < PRICE_CHANGE_NOTICE_DAYS)
    ) {
      violations.push(
        `${head.id}: effectiveDate must be at least ${PRICE_CHANGE_NOTICE_DAYS} days after today (${today})`
      );
    }
    if (head.scheduledAt > today) {
      violations.push(
        `${head.id}: scheduledAt is in the future (today is ${today})`
      );
    }
    if (headLive[head.priceKey] === undefined) {
      violations.push(
        `${head.id}: priceKey ${head.priceKey} is not a live price`
      );
    } else if (headLive[head.priceKey] !== head.oldAmountCents) {
      violations.push(
        `${head.id}: oldAmountCents ${head.oldAmountCents} does not match the live price ${headLive[head.priceKey]}`
      );
    }
  }

  // A live price edit must be the application of a previously merged record.
  for (const [key, baseAmount] of Object.entries(baseLive)) {
    const headAmount = headLive[key];
    if (headAmount === undefined) {
      violations.push(`${key}: live price removed; retire it through a record`);
      continue;
    }
    if (headAmount === baseAmount) continue;
    if (headAmount < baseAmount) continue; // decreases need no notice
    const record = baseRecords.find(
      candidate =>
        candidate.priceKey === key &&
        candidate.oldAmountCents === baseAmount &&
        candidate.newAmountCents === headAmount &&
        !candidate.cancelledAt &&
        !headById.get(candidate.id)?.cancelledAt
    );
    if (!record) {
      violations.push(
        `${key}: live price changed ${baseAmount} -> ${headAmount} without a merged scheduled-change record (declare it in registry.ts first)`
      );
      continue;
    }
    const lead = wholeDaysBetween(record.scheduledAt, record.effectiveDate);
    if (lead === null || lead < PRICE_CHANGE_NOTICE_DAYS) {
      violations.push(
        `${key}: record ${record.id} gave less than ${PRICE_CHANGE_NOTICE_DAYS} days notice`
      );
    }
    const sinceEffective = wholeDaysBetween(record.effectiveDate, today);
    if (sinceEffective === null || sinceEffective < 0) {
      violations.push(
        `${key}: record ${record.id} is not effective until ${record.effectiveDate}`
      );
    }
  }
  return violations;
}
