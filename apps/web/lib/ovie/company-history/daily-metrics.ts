/**
 * Daily company metrics beside merged PRs: the funnel, AI spend, CI and
 * Linear, one cached number per Pacific day each. Same rules as the shipping
 * history: an hourly sync fills today, yesterday and anything missing or not
 * yet final, final days are never fetched again, and reads only touch the
 * cache. A day a source could not count stays missing; nothing becomes zero.
 *
 * Pure module: no I/O.
 */

import {
  COMPANY_HISTORY_RETENTION_DAYS,
  type DailySeries,
  pacificDate,
  shiftDate,
  type WindowSummary,
} from './contract';

export const COMPANY_METRICS_SCHEMA = 'jovie.company-metrics/v1' as const;

export type MetricFormat = 'count' | 'usd_cents';
export type MetricSource = 'database' | 'ai-gateway' | 'github' | 'linear';

export interface DailyMetricDefinition {
  /** Chart title and the word Summer uses. */
  readonly title: string;
  /** What the headline number counts, lowercase, after the number. */
  readonly unit: string;
  readonly format: MetricFormat;
  /** Up is good (signups) or bad (spend, CI failures); colors the change. */
  readonly higherIsBetter: boolean;
  readonly source: MetricSource;
  readonly definition: string;
}

export const DAILY_METRICS = {
  signups: {
    title: 'Signups',
    unit: 'accounts created',
    format: 'count',
    higherIsBetter: true,
    source: 'database',
    definition:
      'External accounts created per Pacific day: users not deleted, with internal and test accounts excluded by the same rule as the founder funnel.',
  },
  paid_signups: {
    title: 'Paid signups',
    unit: 'new paid subscriptions',
    format: 'count',
    higherIsBetter: true,
    source: 'database',
    definition:
      'Distinct external users with a subscription_created billing audit row per Pacific day.',
  },
  onboarding_chats: {
    title: 'Onboarding chats',
    unit: 'onboarding chats started',
    format: 'count',
    higherIsBetter: true,
    source: 'database',
    definition:
      'Anonymous onboarding conversations (chat_conversations with a session id) started per Pacific day, the founder funnel top.',
  },
  ai_spend: {
    title: 'AI spend',
    unit: 'AI Gateway spend',
    format: 'usd_cents',
    higherIsBetter: false,
    source: 'ai-gateway',
    definition:
      'Vercel AI Gateway totalCost, hourly rows summed into Pacific days, stored in cents.',
  },
  ci_failed_runs: {
    title: 'CI failures',
    unit: 'failed workflow runs',
    format: 'count',
    higherIsBetter: false,
    source: 'github',
    definition:
      'GitHub Actions runs on JovieInc/Jovie created that Pacific day that concluded failure (REST total_count). A day at the 1,000-result cap stays unknown.',
  },
  linear_completed: {
    title: 'Issues closed',
    unit: 'Linear issues completed',
    format: 'count',
    higherIsBetter: true,
    source: 'linear',
    definition:
      'JOV team issues, archived included, with completedAt in that Pacific day. A day with 250 or more stays unknown.',
  },
  linear_created: {
    title: 'Issues opened',
    unit: 'Linear issues created',
    format: 'count',
    higherIsBetter: true,
    source: 'linear',
    definition:
      'JOV team issues, archived included, with createdAt in that Pacific day. A day with 250 or more stays unknown.',
  },
} as const satisfies Record<string, DailyMetricDefinition>;

export type DailyMetric = keyof typeof DAILY_METRICS;
export const DAILY_METRIC_KEYS = Object.keys(DAILY_METRICS) as DailyMetric[];

export function isDailyMetric(value: unknown): value is DailyMetric {
  return typeof value === 'string' && Object.hasOwn(DAILY_METRICS, value);
}

/**
 * `?metric=signups,ai_spend` -> known metrics in the order asked, deduped.
 * Nothing valid falls back to every metric.
 */
export function parseDailyMetrics(raw: string | null): DailyMetric[] {
  const parsed = (raw ?? '')
    .split(',')
    .map(part => part.trim())
    .filter(isDailyMetric);
  const unique = [...new Set(parsed)];
  return unique.length > 0 ? unique : [...DAILY_METRIC_KEYS];
}

/**
 * Dates the next sync asks a source for, newest first: today and yesterday
 * every run, then any day in retention that is missing or not final, up to
 * the source's per-run budget.
 */
export function planDailyMetricSync(
  nowMs: number,
  stored: DailySeries,
  budget: number
): string[] {
  const today = pacificDate(nowMs);
  const plan: string[] = [];
  for (
    let back = 0;
    back < COMPANY_HISTORY_RETENTION_DAYS && plan.length < budget;
    back++
  ) {
    const date = shiftDate(today, -back);
    const known = stored[date];
    if (back < 2 || !known || !known.final) plan.push(date);
  }
  return plan;
}

/** Cents as US dollars (whole dollars on request), counts with separators. */
export function formatMetricValue(
  format: MetricFormat,
  value: number,
  options: { readonly wholeDollars?: boolean } = {}
) {
  if (format === 'usd_cents') {
    const digits = options.wholeDollars || value >= 100_000 ? 0 : 2;
    return (value / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }
  return value.toLocaleString('en-US');
}

export interface DailyMetricSyncReceipt {
  readonly at: string;
  readonly requested: number;
  readonly written: number;
  readonly status: 'ok' | 'partial' | 'unavailable';
  readonly reason: string | null;
}

export interface DailyMetricReadback {
  readonly title: string;
  readonly unit: string;
  readonly format: MetricFormat;
  readonly higherIsBetter: boolean;
  readonly definition: string;
  readonly observedAt: string | null;
  readonly lastSync: DailyMetricSyncReceipt | null;
  readonly windows: Readonly<Record<string, WindowSummary>>;
}

export interface CompanyMetricsReadback {
  readonly schema: typeof COMPANY_METRICS_SCHEMA;
  readonly timezone: 'America/Los_Angeles';
  readonly observedAt: string | null;
  /** A metric with no cached day yet is absent, never zero-filled. */
  readonly metrics: Readonly<Partial<Record<DailyMetric, DailyMetricReadback>>>;
  readonly cache: { readonly readPathUpstreamCalls: 0; readonly modelCalls: 0 };
}
