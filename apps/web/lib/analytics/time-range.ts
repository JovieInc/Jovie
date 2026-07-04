/**
 * Canonical analytics time-range semantics — the single source of truth for
 * window boundaries, labels, and retention gating across every analytics
 * surface (dashboard, public profile, audience sidebar, admin).
 *
 * ## The one window rule
 *
 * Every range is a **rolling window of N × 24 hours ending at query time**.
 * Boundaries are computed with fixed millisecond arithmetic — never
 * calendar-day math (`setDate`), which drifts across DST transitions and
 * month boundaries and made different surfaces disagree about "last 7 days".
 *
 * `'all'` means **no lower bound**. Use {@link resolveRangeStartOrEpoch}
 * when a query needs a concrete timestamp.
 *
 * Any code that filters analytics rows by time MUST derive its boundary from
 * {@link resolveRangeStart} / {@link resolveRangeStartOrEpoch}. Do not write
 * ad-hoc `setDate(...)` or `Date.now() - n` window math in query files.
 */

import type { AnalyticsRange } from '@/types/analytics';

export type { AnalyticsRange };

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** All valid analytics ranges, ordered from narrowest to widest. */
export const ANALYTICS_RANGE_VALUES: readonly AnalyticsRange[] = [
  '1d',
  '7d',
  '30d',
  '90d',
  'all',
] as const;

/**
 * Rolling window size in 24-hour days. `null` = unbounded (`'all'`).
 */
export const ANALYTICS_RANGE_DAYS: Record<AnalyticsRange, number | null> = {
  '1d': 1,
  '7d': 7,
  '30d': 30,
  '90d': 90,
  all: null,
};

/**
 * Days of plan retention required for a range to be selectable.
 * `'all'` gates at 365 — only plans with a year (or unlimited) retention
 * can query the unbounded window.
 */
export const ANALYTICS_RANGE_GATE_DAYS: Record<AnalyticsRange, number> = {
  '1d': 1,
  '7d': 7,
  '30d': 30,
  '90d': 90,
  all: 365,
};

/**
 * The fixed window used for "recent activity" style metrics
 * (e.g. `recent_clicks`), regardless of the user-selected range.
 */
export const RECENT_ACTIVITY_RANGE: AnalyticsRange = '7d';

/** Concrete lower bound representing "no lower bound" for SQL comparisons. */
export const ANALYTICS_EPOCH = new Date(0);

export function isAnalyticsRange(value: string): value is AnalyticsRange {
  return (ANALYTICS_RANGE_VALUES as readonly string[]).includes(value);
}

/**
 * Inclusive lower bound of the rolling window ending at `now`,
 * or `null` for the unbounded `'all'` range.
 */
export function resolveRangeStart(
  range: AnalyticsRange,
  now: Date = new Date()
): Date | null {
  const days = ANALYTICS_RANGE_DAYS[range];
  if (days === null) return null;
  return new Date(now.getTime() - days * MS_PER_DAY);
}

/**
 * Like {@link resolveRangeStart}, but returns the Unix epoch for `'all'`
 * so callers can always emit a `>=` SQL comparison.
 */
export function resolveRangeStartOrEpoch(
  range: AnalyticsRange,
  now: Date = new Date()
): Date {
  return resolveRangeStart(range, now) ?? ANALYTICS_EPOCH;
}

export type TimeRangeLabelStyle = 'short' | 'menu' | 'description';

const TIME_RANGE_LABELS: Record<
  AnalyticsRange,
  Record<TimeRangeLabelStyle, string>
> = {
  // ui-casing-allow: compact range pills + Title Case menu labels
  '1d': { short: '1D', menu: 'Last 24 Hours', description: 'Last 24 hours' },
  '7d': { short: '7D', menu: 'Last 7 Days', description: 'Last 7 days' },
  '30d': { short: '30D', menu: 'Last 30 Days', description: 'Last 30 days' },
  '90d': { short: '90D', menu: 'Last 90 Days', description: 'Last 90 days' },
  all: { short: 'All', menu: 'All Time', description: 'All time' },
};

/**
 * Canonical label for a range.
 *
 * - `short` — compact pill label ("7D") for segmented controls
 * - `menu` — Title Case menu-item label ("Last 7 Days")
 * - `description` — sentence-case body/metadata copy ("Last 7 days")
 */
export function getTimeRangeLabel(
  range: AnalyticsRange,
  style: TimeRangeLabelStyle = 'description'
): string {
  return TIME_RANGE_LABELS[range][style];
}

/**
 * True when a range requires more retention than the plan provides.
 * `retentionDays === undefined` means "no limit known" → never gated.
 */
export function isRangeBeyondRetention(
  range: AnalyticsRange,
  retentionDays?: number
): boolean {
  if (retentionDays === undefined) return false;
  return ANALYTICS_RANGE_GATE_DAYS[range] > retentionDays;
}

/**
 * Clamp a requested range to the widest range the plan's retention allows.
 */
export function clampRangeToRetention(
  requested: AnalyticsRange,
  retentionDays: number
): AnalyticsRange {
  if (!isRangeBeyondRetention(requested, retentionDays)) return requested;

  let best: AnalyticsRange = '1d';
  for (const range of ANALYTICS_RANGE_VALUES) {
    if (ANALYTICS_RANGE_GATE_DAYS[range] <= retentionDays) best = range;
  }
  return best;
}
