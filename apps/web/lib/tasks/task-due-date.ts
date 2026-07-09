/**
 * Task due-date helpers.
 *
 * Release-plan tasks derive `dueAt` from `releaseDate + offsetDays`.
 * Historical catalog releases (and bad epoch-like baselines) produced
 * absurd chips like "Due 12y ago". These helpers:
 *  - reject invalid / pre-2000 baselines
 *  - coerce seconds vs ms unix timestamps
 *  - omit dues that are too far in the past to be actionable
 */

const MS_PER_DAY = 86_400_000;

/** Years before this are treated as bad seed / epoch baselines. */
export const MIN_VALID_RELEASE_YEAR = 2000;

/**
 * Past due dates older than this many days are not actionable planning
 * signals on the Tasks list (historical releases, re-imported catalogs).
 */
export const MAX_ACTIONABLE_OVERDUE_DAYS = 180;

export function parseTaskDate(
  value: Date | string | number | null | undefined
): Date | null {
  if (value == null) return null;

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    // Unix seconds are ~1e9; ms are ~1e12+. Treat smaller values as seconds.
    const ms = Math.abs(value) < 1e12 ? value * 1000 : value;
    const fromNumber = new Date(ms);
    return Number.isFinite(fromNumber.getTime()) ? fromNumber : null;
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  // Pure integer strings (e.g. "1400000000") — parse as unix seconds/ms.
  if (/^-?\d+$/.test(trimmed)) {
    return parseTaskDate(Number(trimmed));
  }

  const fromString = new Date(trimmed);
  return Number.isFinite(fromString.getTime()) ? fromString : null;
}

function isActionableDue(due: Date, now: Date): boolean {
  if (due.getUTCFullYear() < MIN_VALID_RELEASE_YEAR) return false;
  const daysPast = Math.round((now.getTime() - due.getTime()) / MS_PER_DAY);
  return daysPast <= MAX_ACTIONABLE_OVERDUE_DAYS;
}

/**
 * Compute a task due date from a release baseline + day offset.
 * Returns null when the baseline is missing/invalid or the result would
 * be an absurd multi-month historical overdue.
 */
export function computeTaskDueDate(
  releaseDate: Date | string | number | null | undefined,
  offsetDays: number | null | undefined,
  options?: { readonly now?: Date }
): Date | null {
  if (offsetDays == null || !Number.isFinite(offsetDays)) return null;

  const base = parseTaskDate(releaseDate);
  if (!base) return null;
  if (base.getUTCFullYear() < MIN_VALID_RELEASE_YEAR) return null;

  const due = new Date(base.getTime());
  due.setDate(due.getDate() + offsetDays);

  const now = options?.now ?? new Date();
  if (!isActionableDue(due, now)) return null;
  return due;
}

/**
 * Sanitize a stored dueAt for list/board display. Drops epoch-like and
 * multi-month historical overdue values so existing bad rows do not
 * paint the Tasks surface red with "12Y ago" chips.
 */
export function sanitizeTaskDueAt(
  dueAt: Date | string | number | null | undefined,
  options?: { readonly now?: Date }
): Date | null {
  const due = parseTaskDate(dueAt);
  if (!due) return null;
  const now = options?.now ?? new Date();
  if (!isActionableDue(due, now)) return null;
  return due;
}

/** Safe ISO string for DueChip — handles Date objects and ISO strings. */
export function toDueIso(
  dueAt: Date | string | number | null | undefined
): string | null {
  const due = parseTaskDate(dueAt);
  return due ? due.toISOString() : null;
}
