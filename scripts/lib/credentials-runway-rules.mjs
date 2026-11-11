/**
 * Spend-runway resolution rules and the burn-rate measurement.
 *
 * A prepaid credit pool that is deliberately drained (no top-up, per the
 * standing budget authority) with provider failover confirmed live must stop
 * paging on runway: the balance can only reach zero, and every caller is
 * either workers-first or replayed once on the other provider
 * (apps/web/lib/ai/credit-failover.ts). The drained state is declared on the
 * spend entry as `runwayStatus: "drained"` with evidence in its notes, and
 * the evaluator stops the runway alert and the runway page for that entry.
 * An unknown status fails validation closed instead of silently muting a
 * live pool.
 *
 * `burnRate` moved here from credentials-registry.mjs so that module stays
 * within its company-guards size ceiling
 * (scripts/company-guards/size-baseline.json) while the evaluator keeps the
 * behavior.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const round = (value, digits = 2) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? null
    : Number(value.toFixed(digits));

/** Runway statuses that resolve paging for a spend entry. Only `drained`. */
const RESOLVED_RUNWAY_STATUSES = new Set(['drained']);

/**
 * True when the entry's runway paging is resolved: the pool is drained on
 * purpose and callers are failover-protected, so the balance can only fall.
 *
 * @param {{ runwayStatus?: string }} entry
 */
export function isRunwayPagingResolved(entry) {
  return RESOLVED_RUNWAY_STATUSES.has(entry.runwayStatus);
}

/**
 * Fails closed on a runway status the checker does not know, so a typo can
 * never silently mute a live pool.
 *
 * @param {{ id?: string, runwayStatus?: string }} entry
 * @returns {string[]}
 */
export function runwayStatusErrors(entry) {
  if (entry.runwayStatus === undefined) return [];
  return RESOLVED_RUNWAY_STATUSES.has(entry.runwayStatus)
    ? []
    : [`${entry.id}: unknown runway status ${entry.runwayStatus}`];
}

/**
 * Burn per day. Prefer the measured slope between the committed baseline and a
 * live read of the same cumulative counter; fall back to the declared value.
 */
export function burnRate(entry, live) {
  const base = entry.snapshot;
  if (
    live &&
    Number.isFinite(live.totalUsedUsd) &&
    Number.isFinite(base?.totalUsedUsd)
  ) {
    const days =
      (Date.parse(live.observedAt) - Date.parse(base.observedAt)) / DAY_MS;
    if (days >= 0.5) {
      const value = (live.totalUsedUsd - base.totalUsedUsd) / days;
      if (value >= 0)
        return { value, source: 'measured-slope', windowDays: round(days, 2) };
    }
  }
  if (Number.isFinite(entry.burnPerDayUsd?.value))
    return {
      value: entry.burnPerDayUsd.value,
      source: entry.burnPerDayUsd.source ?? 'declared',
      windowDays: null,
    };
  return null;
}
