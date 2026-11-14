/**
 * Clock for a deliberate calendar deadline in a test: a checked-in receipt
 * that must be re-reviewed by a date.
 *
 * Required lanes get the fixed `pinned` instant, so an unrefreshed receipt
 * cannot fail every merge group for unrelated PRs (44 groups on 2026-11-10,
 * a 7 hour stall on 2026-10-31). The daily time-bomb scan
 * (scripts/time-bomb/scan.mjs) sets CALENDAR_DEADLINE_SCAN=1 and gets the real
 * clock, moved a week ahead, so the deadline files one issue for its owner
 * before it lapses. Derive `pinned` from the data under test (its newest
 * verification date), never from a typed date.
 */
export function calendarDeadlineClock(
  pinned: Date,
  env: Readonly<Record<string, string | undefined>> = process.env
): Date {
  return env.CALENDAR_DEADLINE_SCAN === '1'
    ? new Date()
    : new Date(pinned.getTime());
}
