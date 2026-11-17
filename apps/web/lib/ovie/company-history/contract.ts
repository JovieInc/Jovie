/**
 * Company history: one cached store of daily company numbers that every agent
 * reads with zero provider calls and zero model calls.
 *
 * Days are America/Los_Angeles calendar days, the same buckets Summer's
 * shipping card uses. A day is fetched until it is final (observed an hour or
 * more after it ended, so the search index has caught up), then it is never
 * fetched again. Reads only ever touch the cache.
 *
 * Pure module: no I/O, so the read path, the sync planner and the chart
 * renderer share one definition of a day and one definition of each metric.
 */

import { computeRatePercent } from '@/lib/analytics/metrics';

export const COMPANY_HISTORY_SCHEMA = 'jovie.company-history/v1' as const;
export const COMPANY_HISTORY_TIMEZONE = 'America/Los_Angeles';

/** Days kept per series. 90 days serves a 30-day window against the 30 before, with room. */
export const COMPANY_HISTORY_RETENTION_DAYS = 120;
/** Searches per GraphQL request, and requests per sync run. */
export const COMPANY_HISTORY_ALIASES_PER_REQUEST = 60;
export const COMPANY_HISTORY_MAX_REQUESTS_PER_SYNC = 2;
/** A day is final once observed this long after it ended. */
export const COMPANY_HISTORY_FINAL_AFTER_MS = 60 * 60_000;
/** Windows a caller may ask for. */
export const COMPANY_HISTORY_WINDOWS = [7, 14, 30, 90] as const;
export type CompanyHistoryWindow = (typeof COMPANY_HISTORY_WINDOWS)[number];

/**
 * Merged pull requests, the number Summer calls "shipped". `org` is every
 * JovieInc repository; the named repositories are subtotals.
 */
export const MERGED_PR_SCOPES = [
  'org',
  'Jovie',
  'LogYourBody',
  'summer-config',
] as const;
export type MergedPrScope = (typeof MERGED_PR_SCOPES)[number];

export const COMPANY_HISTORY_METRICS = {
  merged_prs: {
    label: 'Merged pull requests',
    unit: 'PRs',
    scopes: MERGED_PR_SCOPES,
    definition:
      'GitHub search issueCount for "is:pr is:merged" per Pacific day, merged:[local midnight, next local midnight). Same query family as Summer\'s shipping card.',
  },
} as const;
export type CompanyHistoryMetric = keyof typeof COMPANY_HISTORY_METRICS;

export interface DailyCount {
  /** YYYY-MM-DD, Pacific. */
  readonly date: string;
  readonly count: number;
  /** Observed an hour or more after the day ended; never fetched again. */
  readonly final: boolean;
  readonly observedAt: string;
}

/** Stored day values for one series, keyed by date. */
export type DailySeries = Readonly<Record<string, DailyCount>>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

const pacificDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: COMPANY_HISTORY_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const pacificClockFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: COMPANY_HISTORY_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function isHistoryDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    DATE_RE.test(value) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  );
}

/** Pacific calendar date of an instant. */
export function pacificDate(ms: number): string {
  return pacificDateFormat.format(new Date(ms));
}

/** Calendar arithmetic on a YYYY-MM-DD date (noon UTC avoids DST edges). */
export function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** UTC instant of local midnight at the start of a Pacific date. */
export function pacificMidnightMs(date: string): number {
  // 08:00Z is midnight PST or 01:00 PDT on the date; subtract the local clock.
  const guess = Date.parse(`${date}T08:00:00Z`);
  const [h, m] = pacificClockFormat.format(new Date(guess)).split(':');
  return guess - (Number(h) * 60 + Number(m)) * 60_000;
}

function searchTime(ms: number): string {
  return new Date(Math.floor(ms / 1000) * 1000)
    .toISOString()
    .replace('.000Z', 'Z');
}

/** [start, end) of a Pacific day; `end` is the next local midnight (23 or 25 hours on DST days). */
export function pacificDayBounds(date: string): {
  readonly startMs: number;
  readonly endMs: number;
} {
  return {
    startMs: pacificMidnightMs(date),
    endMs: pacificMidnightMs(shiftDate(date, 1)),
  };
}

/**
 * The exact GitHub search for one scope and day. GitHub ranges are inclusive,
 * so the range ends one second before the next local midnight.
 */
export function mergedPrSearchQuery(
  owner: string,
  scope: MergedPrScope,
  date: string
): string {
  const { startMs, endMs } = pacificDayBounds(date);
  const target = scope === 'org' ? `org:${owner}` : `repo:${owner}/${scope}`;
  const range = [searchTime(startMs), searchTime(endMs - 1000)].join('..');
  return [target, 'is:pr', 'is:merged', `merged:${range}`].join(' ');
}

export function isFinalObservation(date: string, observedAtMs: number) {
  return (
    observedAtMs >=
    pacificDayBounds(date).endMs + COMPANY_HISTORY_FINAL_AFTER_MS
  );
}

/** Dates in a window ending today (inclusive), oldest first. */
export function windowDates(today: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => shiftDate(today, i - days + 1));
}

export interface SyncPlanItem {
  readonly scope: MergedPrScope;
  readonly date: string;
}

/**
 * What the next sync fetches, newest first: today and yesterday every run,
 * then any day in retention that is missing or not yet final. Bounded by the
 * per-run search budget, so a cold store backfills over a few runs.
 */
export function planMergedPrSync(
  nowMs: number,
  stored: Readonly<Record<MergedPrScope, DailySeries>>,
  budget = COMPANY_HISTORY_ALIASES_PER_REQUEST *
    COMPANY_HISTORY_MAX_REQUESTS_PER_SYNC
): SyncPlanItem[] {
  const today = pacificDate(nowMs);
  const plan: SyncPlanItem[] = [];
  for (let back = 0; back < COMPANY_HISTORY_RETENTION_DAYS; back++) {
    const date = shiftDate(today, -back);
    for (const scope of MERGED_PR_SCOPES) {
      if (plan.length >= budget) return plan;
      const known = stored[scope]?.[date];
      if (back < 2 || !known || !known.final) plan.push({ scope, date });
    }
  }
  return plan;
}

/** Dates older than retention, for trimming. */
export function expiredDates(nowMs: number, dates: readonly string[]) {
  const oldest = shiftDate(
    pacificDate(nowMs),
    -(COMPANY_HISTORY_RETENTION_DAYS - 1)
  );
  return dates.filter(date => !isHistoryDate(date) || date < oldest);
}

export interface WindowPoint {
  readonly date: string;
  readonly count: number | null;
  readonly final: boolean;
}

export interface WindowSummary {
  readonly days: number;
  readonly from: string;
  readonly to: string;
  readonly points: readonly WindowPoint[];
  /** Sum of known days; null when any day in the window is missing. */
  readonly total: number | null;
  /** Same-length window just before, for change; null when not fully known. */
  readonly priorTotal: number | null;
  readonly changePercent: number | null;
  /** Average per full day. Today is partial, so it is excluded from the average. */
  readonly averagePerFullDay: number | null;
  readonly best: { readonly date: string; readonly count: number } | null;
  /** Every day in the window is present. */
  readonly complete: boolean;
  /** Today is still counting. */
  readonly includesPartialToday: boolean;
}

function sumKnown(points: readonly WindowPoint[]) {
  return points.every(p => p.count !== null)
    ? points.reduce((total, p) => total + (p.count ?? 0), 0)
    : null;
}

/** A window of `days` ending today, plus the same-length window before it. */
export function summarizeWindow(
  series: DailySeries,
  nowMs: number,
  days: number
): WindowSummary {
  const today = pacificDate(nowMs);
  const toPoint = (date: string): WindowPoint => {
    const known = series[date];
    return {
      date,
      count: known ? known.count : null,
      final: known?.final ?? false,
    };
  };
  const points = windowDates(today, days).map(toPoint);
  const prior = windowDates(shiftDate(today, -days), days).map(toPoint);
  const total = sumKnown(points);
  const priorTotal = sumKnown(prior);
  const fullDays = points.slice(0, -1);
  const fullTotal = sumKnown(fullDays);
  const best = points.reduce<WindowSummary['best']>(
    (top, p) =>
      p.count !== null && (top === null || p.count > top.count)
        ? { date: p.date, count: p.count }
        : top,
    null
  );
  return {
    days,
    from: points[0]!.date,
    to: today,
    points,
    total,
    priorTotal,
    changePercent:
      total !== null && priorTotal !== null && priorTotal > 0
        ? computeRatePercent(total - priorTotal, priorTotal, 0)
        : null,
    averagePerFullDay:
      fullTotal !== null && fullDays.length > 0
        ? Math.round((fullTotal / fullDays.length) * 10) / 10
        : null,
    best,
    complete: total !== null,
    includesPartialToday: true,
  };
}

export interface CompanyHistoryReadback {
  readonly schema: typeof COMPANY_HISTORY_SCHEMA;
  readonly metric: CompanyHistoryMetric;
  readonly definition: string;
  readonly timezone: typeof COMPANY_HISTORY_TIMEZONE;
  readonly observedAt: string | null;
  readonly lastSync: CompanyHistorySyncReceipt | null;
  readonly windows: Readonly<
    Record<string, Readonly<Record<MergedPrScope, WindowSummary>>>
  >;
  readonly cache: { readonly readPathUpstreamCalls: 0; readonly modelCalls: 0 };
}

export interface CompanyHistorySyncReceipt {
  readonly at: string;
  readonly requested: number;
  readonly written: number;
  readonly requests: number;
  readonly status: 'ok' | 'partial' | 'unavailable';
  readonly reason: string | null;
}

/** Parse a stored hash value; anything malformed is treated as missing. */
export function decodeDailyCount(
  date: string,
  value: unknown
): DailyCount | null {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object' || !isHistoryDate(date))
    return null;
  const record = parsed as Record<string, unknown>;
  const count = record.c;
  const observedAt = record.o;
  if (
    !Number.isSafeInteger(count) ||
    (count as number) < 0 ||
    typeof observedAt !== 'string' ||
    !Number.isFinite(Date.parse(observedAt))
  )
    return null;
  return {
    date,
    count: count as number,
    final: record.f === true,
    observedAt,
  };
}

export function encodeDailyCount(value: DailyCount): string {
  return JSON.stringify({
    c: value.count,
    f: value.final,
    o: value.observedAt,
  });
}
