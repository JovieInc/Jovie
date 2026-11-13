import 'server-only';

import { sql as drizzleSql, type SQL } from 'drizzle-orm';
import { externalAccountSql } from '@/lib/accounts/internal-account';
import { readGatewaySpendReport } from '@/lib/ai/gateway-spend';
import { db } from '@/lib/db';
import {
  createLiveFounderWorkReader,
  type FounderWorkReader,
} from '@/lib/ovie/mcp/founder-work';
import { pacificDate, pacificDayBounds } from './contract';
import type { DailyMetric } from './daily-metrics';
import type { DailyMetricSource } from './daily-metrics.server';

/*
 * The sources behind each daily metric. Called only by the hourly sync,
 * never by a read. Budgets per run (steady state is today and yesterday):
 * api-budget: github-app-core 14/hr - hourly company metrics sync, failed CI runs per Pacific day (2 steady, 14 while backfilling)
 * api-budget: linear-requests 2/hr - hourly company metrics sync, JOV issues opened and closed per Pacific day, one aliased request each
 * api-budget: ai-gateway 1/hr - hourly company metrics sync, one hourly spend report bucketed into Pacific days
 */

const CI_RESULT_CAP = 1000;
const LINEAR_PAGE = 250;

type Values = Record<string, number>;
type Read = Awaited<ReturnType<DailyMetricSource['read']>>;

function span(dates: readonly string[]) {
  const bounds = dates.map(pacificDayBounds);
  return {
    startMs: Math.min(...bounds.map(b => b.startMs)),
    endMs: Math.max(...bounds.map(b => b.endMs)),
  };
}

const isoSecond = (ms: number) =>
  new Date(Math.floor(ms / 1000) * 1000).toISOString().replace('.000Z', 'Z');

/** Every requested date gets a value: the query covered the whole span. */
function fill(dates: readonly string[], counted: Values): Values {
  return Object.fromEntries(dates.map(date => [date, counted[date] ?? 0]));
}

type DayRow = { day: string; n: number | string };

/**
 * One grouped query over the span, bucketed into Pacific days in Postgres.
 * Timestamps are stored as UTC without a zone.
 */
function databaseSource(
  metric: DailyMetric,
  query: (startIso: string, endIso: string, localDay: SQL) => SQL
): DailyMetricSource {
  return {
    metric,
    budget: 120,
    async read(dates): Promise<Read> {
      if (dates.length === 0) return { status: 'ok', values: {} };
      const { startMs, endMs } = span(dates);
      const localDay = (column: SQL) =>
        drizzleSql`to_char((${column} AT TIME ZONE 'UTC') AT TIME ZONE 'America/Los_Angeles', 'YYYY-MM-DD')`;
      const result = await db.execute<DayRow>(
        query(
          new Date(startMs).toISOString(),
          new Date(endMs).toISOString(),
          localDay(drizzleSql.raw('t.at'))
        )
      );
      const counted: Values = {};
      for (const row of result.rows ?? [])
        counted[String(row.day)] = Number(row.n);
      return { status: 'ok', values: fill(dates, counted) };
    },
  };
}

const EXTERNAL_USER = externalAccountSql(
  drizzleSql.raw('u.email'),
  drizzleSql.raw('u.account_class')
);

export const signupsSource = databaseSource(
  'signups',
  (start, end, day) => drizzleSql`
    SELECT ${day} AS day, count(*)::int AS n
    FROM (
      SELECT u.created_at AS at FROM users u
      WHERE u.deleted_at IS NULL AND ${EXTERNAL_USER}
        AND u.created_at >= ${start} AND u.created_at < ${end}
    ) t
    GROUP BY 1`
);

export const paidSignupsSource = databaseSource(
  'paid_signups',
  (start, end, day) => drizzleSql`
    SELECT ${day} AS day, count(DISTINCT t.user_id)::int AS n
    FROM (
      SELECT b.created_at AS at, b.user_id FROM billing_audit_log b
      JOIN users u ON u.id = b.user_id
      WHERE b.event_type = 'subscription_created'
        AND u.deleted_at IS NULL AND ${EXTERNAL_USER}
        AND b.created_at >= ${start} AND b.created_at < ${end}
    ) t
    GROUP BY 1`
);

export const onboardingChatsSource = databaseSource(
  'onboarding_chats',
  (start, end, day) => drizzleSql`
    SELECT ${day} AS day, count(*)::int AS n
    FROM (
      SELECT cc.created_at AS at FROM chat_conversations cc
      WHERE cc.session_id IS NOT NULL
        AND cc.created_at >= ${start} AND cc.created_at < ${end}
    ) t
    GROUP BY 1`
);

type SpendRow = { readonly hour?: string; readonly totalCost: number };

/** One hourly report over the span; each hour lands in its Pacific day. */
export function aiSpendSource(
  report: (params: {
    startDate: string;
    endDate: string;
  }) => Promise<readonly SpendRow[]> = readGatewaySpendReport
): DailyMetricSource {
  return {
    metric: 'ai_spend',
    budget: 35,
    async read(dates): Promise<Read> {
      if (dates.length === 0) return { status: 'ok', values: {} };
      const { startMs, endMs } = span(dates);
      const rows = await report({
        startDate: new Date(startMs).toISOString().slice(0, 10),
        endDate: new Date(endMs - 1).toISOString().slice(0, 10),
      });
      const dollars: Record<string, number> = {};
      for (const row of rows) {
        const raw = row.hour ?? '';
        const ms = Date.parse(
          /[zZ]|[+-]\d\d:?\d\d$/.test(raw) ? raw : `${raw}Z`
        );
        if (!Number.isFinite(ms) || !Number.isFinite(row.totalCost))
          return { status: 'unavailable', reason: 'spend-report-off-contract' };
        const date = pacificDate(ms);
        dollars[date] = (dollars[date] ?? 0) + row.totalCost;
      }
      const cents = Object.fromEntries(
        Object.entries(dollars).map(([date, usd]) => [
          date,
          Math.max(0, Math.round(usd * 100)),
        ])
      );
      return { status: 'ok', values: fill(dates, cents) };
    },
  };
}

/** One total_count per day. A day at the cap stays unknown. */
export function ciFailedRunsSource(
  reader: Pick<FounderWorkReader, 'countGithubWorkflowRuns'>
): DailyMetricSource {
  return {
    metric: 'ci_failed_runs',
    budget: 14,
    async read(dates): Promise<Read> {
      const values: Values = {};
      let failure: string | null = null;
      for (const date of dates) {
        const { startMs, endMs } = pacificDayBounds(date);
        try {
          const total = await reader.countGithubWorkflowRuns({
            created: [isoSecond(startMs), isoSecond(endMs - 1000)].join('..'),
            status: 'failure',
          });
          if (total < CI_RESULT_CAP) values[date] = total;
        } catch (error) {
          failure = error instanceof Error ? error.message : 'github-failed';
          break;
        }
      }
      return failure && Object.keys(values).length === 0
        ? { status: 'unavailable', reason: failure.slice(0, 160) }
        : { status: 'ok', values };
    },
  };
}

/** One aliased Linear request per run for the dates asked. */
export function linearSource(
  metric: 'linear_completed' | 'linear_created',
  reader: Pick<FounderWorkReader, 'countLinearIssuesInWindows'>
): DailyMetricSource {
  return {
    metric,
    budget: 10,
    async read(dates): Promise<Read> {
      const counts = await reader.countLinearIssuesInWindows(
        metric === 'linear_completed' ? 'completedAt' : 'createdAt',
        dates.map(date => {
          const { startMs, endMs } = pacificDayBounds(date);
          return {
            gte: new Date(startMs).toISOString(),
            lt: new Date(endMs).toISOString(),
          };
        }),
        LINEAR_PAGE
      );
      const values: Values = {};
      dates.forEach((date, i) => {
        const count = counts[i];
        if (typeof count === 'number') values[date] = count;
      });
      return { status: 'ok', values };
    },
  };
}

/** The production source list the hourly sync runs. */
export function configuredMetricSources(
  reader: FounderWorkReader = createLiveFounderWorkReader()
): DailyMetricSource[] {
  return [
    signupsSource,
    paidSignupsSource,
    onboardingChatsSource,
    aiSpendSource(),
    ciFailedRunsSource(reader),
    linearSource('linear_completed', reader),
    linearSource('linear_created', reader),
  ];
}
