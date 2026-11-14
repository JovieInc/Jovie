import 'server-only';

import { getRedis } from '@/lib/redis';
import {
  COMPANY_HISTORY_TIMEZONE,
  type DailyCount,
  type DailySeries,
  decodeDailyCount,
  encodeDailyCount,
  expiredDates,
  isFinalObservation,
  summarizeWindow,
} from './contract';
import {
  COMPANY_METRICS_SCHEMA,
  type CompanyMetricsReadback,
  DAILY_METRICS,
  type DailyMetric,
  type DailyMetricReadback,
  type DailyMetricSyncReceipt,
  planDailyMetricSync,
} from './daily-metrics';

type RedisStore = NonNullable<ReturnType<typeof getRedis>>;

const KEY_PREFIX = 'summer:company-history:v1:daily';
const seriesKey = (metric: DailyMetric) => `${KEY_PREFIX}:${metric}`;
const RECEIPTS_KEY = `${KEY_PREFIX}:last-sync`;

/**
 * A source of one daily metric. `read` returns a value for each date it
 * could count; a date it leaves out stays unknown in the cache.
 */
export interface DailyMetricSource {
  readonly metric: DailyMetric;
  /** Days per sync run; backfill spreads over runs. */
  readonly budget: number;
  readonly read: (
    dates: readonly string[],
    now: Date
  ) => Promise<
    | {
        readonly status: 'ok';
        readonly values: Readonly<Record<string, number>>;
      }
    | { readonly status: 'unavailable'; readonly reason: string }
  >;
}

async function readSeries(
  redis: RedisStore,
  metric: DailyMetric
): Promise<DailySeries> {
  const hash = await redis.hgetall<Record<string, unknown>>(seriesKey(metric));
  const days: Record<string, DailyCount> = {};
  for (const [date, value] of Object.entries(hash ?? {})) {
    const decoded = decodeDailyCount(date, value);
    if (decoded) days[date] = decoded;
  }
  return days;
}

function decodeReceipt(value: unknown): DailyMetricSyncReceipt | null {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as { at?: unknown }).at === 'string'
      ? (parsed as DailyMetricSyncReceipt)
      : null;
  } catch {
    return null;
  }
}

/** One HGETALL per metric plus one for receipts. Never calls a source. */
export async function readCompanyMetrics(
  metrics: readonly DailyMetric[],
  windows: readonly number[],
  options: { readonly now?: Date; readonly redis?: RedisStore | null } = {}
): Promise<CompanyMetricsReadback | null> {
  const redis = options.redis === undefined ? getRedis() : options.redis;
  if (!redis) return null;
  const nowMs = (options.now ?? new Date()).getTime();
  const [allSeries, receipts] = await Promise.all([
    Promise.all(metrics.map(metric => readSeries(redis, metric))),
    redis.hgetall<Record<string, unknown>>(RECEIPTS_KEY),
  ]);
  const out: Partial<Record<DailyMetric, DailyMetricReadback>> = {};
  let newest = 0;
  metrics.forEach((metric, index) => {
    const series = allSeries[index]!;
    const observed = Object.values(series).map(day =>
      Date.parse(day.observedAt)
    );
    if (observed.length === 0) return;
    const metricNewest = Math.max(...observed);
    newest = Math.max(newest, metricNewest);
    const definition = DAILY_METRICS[metric];
    out[metric] = {
      title: definition.title,
      unit: definition.unit,
      format: definition.format,
      higherIsBetter: definition.higherIsBetter,
      definition: definition.definition,
      observedAt: new Date(metricNewest).toISOString(),
      lastSync: decodeReceipt(receipts?.[metric]),
      windows: Object.fromEntries(
        windows.map(days => [
          String(days),
          summarizeWindow(series, nowMs, days),
        ])
      ),
    };
  });
  if (Object.keys(out).length === 0) return null;
  return {
    schema: COMPANY_METRICS_SCHEMA,
    timezone: COMPANY_HISTORY_TIMEZONE,
    observedAt: new Date(newest).toISOString(),
    metrics: out,
    cache: { readPathUpstreamCalls: 0, modelCalls: 0 },
  };
}

async function syncOne(
  redis: RedisStore,
  source: DailyMetricSource,
  now: Date
): Promise<DailyMetricSyncReceipt> {
  const at = now.toISOString();
  const nowMs = now.getTime();
  const stored = await readSeries(redis, source.metric);
  const plan = planDailyMetricSync(nowMs, stored, source.budget);
  let read: Awaited<ReturnType<DailyMetricSource['read']>>;
  try {
    read = await source.read(plan, now);
  } catch (error) {
    read = {
      status: 'unavailable',
      reason: error instanceof Error ? error.message.slice(0, 160) : 'failed',
    };
  }
  const fields: Record<string, string> = {};
  if (read.status === 'ok') {
    for (const date of plan) {
      const value = read.values[date];
      if (value === undefined || !Number.isSafeInteger(value) || value < 0)
        continue;
      fields[date] = encodeDailyCount({
        date,
        count: value,
        final: isFinalObservation(date, nowMs),
        observedAt: at,
      });
    }
    if (Object.keys(fields).length > 0)
      await redis.hset(seriesKey(source.metric), fields);
  }
  const expired = expiredDates(nowMs, Object.keys(stored));
  if (expired.length > 0)
    await redis.hdel(seriesKey(source.metric), ...expired);
  const written = Object.keys(fields).length;
  return {
    at,
    requested: plan.length,
    written,
    status:
      read.status !== 'ok'
        ? 'unavailable'
        : written < plan.length
          ? 'partial'
          : 'ok',
    reason:
      read.status !== 'ok'
        ? read.reason
        : written < plan.length
          ? 'some-days-uncounted'
          : null,
  };
}

/** Every source in parallel; one failing source never blocks the others. */
export async function syncCompanyMetrics(
  now: Date,
  deps: {
    readonly redis: RedisStore | null;
    readonly sources: readonly DailyMetricSource[];
  }
): Promise<Partial<Record<DailyMetric, DailyMetricSyncReceipt>>> {
  const redis = deps.redis;
  if (!redis) {
    return Object.fromEntries(
      deps.sources.map(source => [
        source.metric,
        {
          at: now.toISOString(),
          requested: 0,
          written: 0,
          status: 'unavailable',
          reason: 'redis-unavailable',
        } satisfies DailyMetricSyncReceipt,
      ])
    );
  }
  const receipts = await Promise.all(
    deps.sources.map(source => syncOne(redis, source, now))
  );
  const byMetric = Object.fromEntries(
    deps.sources.map((source, i) => [source.metric, receipts[i]!])
  );
  await redis.hset(
    RECEIPTS_KEY,
    Object.fromEntries(
      Object.entries(byMetric).map(([metric, receipt]) => [
        metric,
        JSON.stringify(receipt),
      ])
    )
  );
  return byMetric;
}
