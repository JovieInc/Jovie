/**
 * Price-change notice rules shared by the CI guard, the notice pipeline and
 * the effect gate. Pure: no server-only imports, no I/O.
 */

import type { ScheduledPriceChange } from './types';

/**
 * Minimum days between a notice being sent and the new price applying.
 *
 * The Terms (PR #23317) promise "notice of a price change before it applies to
 * your next renewal" without a number. 30 days is the chosen reading; Tim can
 * change it here and every consumer follows. It is the minimum, not a cap.
 */
export const PRICE_CHANGE_NOTICE_DAYS = 30;

export const MS_PER_DAY = 86_400_000;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** UTC midnight of a YYYY-MM-DD day; NaN-safe (returns null when invalid). */
export function parseUtcDay(day: string): Date | null {
  if (!DAY_RE.test(day)) return null;
  const date = new Date(`${day}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day
    ? null
    : date;
}

export function toUtcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function wholeDaysBetween(
  fromDay: string,
  toDay: string
): number | null {
  const from = parseUtcDay(fromDay);
  const to = parseUtcDay(toDay);
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/** A price drop never needs notice and is never held back. */
export function isPriceIncrease(
  change: Pick<ScheduledPriceChange, 'oldAmountCents' | 'newAmountCents'>
): boolean {
  return change.newAmountCents > change.oldAmountCents;
}

/** Structural problems with one record, independent of any other state. */
export function validateRecordShape(change: ScheduledPriceChange): string[] {
  const problems: string[] = [];
  const effective = parseUtcDay(change.effectiveDate);
  const scheduled = parseUtcDay(change.scheduledAt);
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(change.id)) {
    problems.push(`${change.id}: id must be a lowercase slug (3-64 chars)`);
  }
  if (!effective)
    problems.push(`${change.id}: effectiveDate is not YYYY-MM-DD`);
  if (!scheduled) problems.push(`${change.id}: scheduledAt is not YYYY-MM-DD`);
  if (effective && scheduled) {
    const lead = wholeDaysBetween(change.scheduledAt, change.effectiveDate);
    if (isPriceIncrease(change) && (lead ?? 0) < PRICE_CHANGE_NOTICE_DAYS) {
      problems.push(
        `${change.id}: effectiveDate must be at least ${PRICE_CHANGE_NOTICE_DAYS} days after scheduledAt (got ${lead})`
      );
    }
  }
  if (!Number.isInteger(change.oldAmountCents) || change.oldAmountCents <= 0) {
    problems.push(`${change.id}: oldAmountCents must be a positive integer`);
  }
  if (!Number.isInteger(change.newAmountCents) || change.newAmountCents <= 0) {
    problems.push(`${change.id}: newAmountCents must be a positive integer`);
  }
  if (change.oldAmountCents === change.newAmountCents) {
    problems.push(`${change.id}: old and new amount are equal`);
  }
  if (change.interval !== 'month') {
    problems.push(
      `${change.id}: only monthly changes are supported (annual needs a renewal-aligned notice window)`
    );
  }
  if (!change.reason.trim()) problems.push(`${change.id}: reason is required`);
  if (!change.newStripePriceEnvKey.startsWith('STRIPE_PRICE_')) {
    problems.push(
      `${change.id}: newStripePriceEnvKey must be a STRIPE_PRICE_* key`
    );
  }
  if (!change.oldStripePriceEnvKey.startsWith('STRIPE_PRICE_')) {
    problems.push(
      `${change.id}: oldStripePriceEnvKey must be a STRIPE_PRICE_* key`
    );
  }
  if (change.newStripePriceEnvKey === change.oldStripePriceEnvKey) {
    problems.push(
      `${change.id}: new Stripe price must differ from the old one`
    );
  }
  return problems;
}
