import 'server-only';

import { getRedis } from '@/lib/redis';
import {
  COMPANY_HISTORY_ALIASES_PER_REQUEST,
  COMPANY_HISTORY_MAX_REQUESTS_PER_SYNC,
  COMPANY_HISTORY_METRICS,
  COMPANY_HISTORY_SCHEMA,
  COMPANY_HISTORY_TIMEZONE,
  type CompanyHistoryReadback,
  type CompanyHistorySyncReceipt,
  type DailyCount,
  type DailySeries,
  decodeDailyCount,
  encodeDailyCount,
  expiredDates,
  isFinalObservation,
  MERGED_PR_SCOPES,
  type MergedPrScope,
  mergedPrSearchQuery,
  planMergedPrSync,
  summarizeWindow,
} from './contract';

type RedisStore = NonNullable<ReturnType<typeof getRedis>>;

const KEY_PREFIX = 'summer:company-history:v1';
const seriesKey = (scope: MergedPrScope) => `${KEY_PREFIX}:merged_prs:${scope}`;
const RECEIPT_KEY = `${KEY_PREFIX}:last-sync`;

type StoredSeries = Record<MergedPrScope, DailySeries>;

function emptyStoredSeries(): StoredSeries {
  return Object.fromEntries(
    MERGED_PR_SCOPES.map(scope => [scope, {}])
  ) as unknown as StoredSeries;
}

/** One HGETALL per scope. The read path never calls a provider. */
export async function readMergedPrSeries(
  redis: RedisStore
): Promise<StoredSeries> {
  const result = emptyStoredSeries();
  const hashes = await Promise.all(
    MERGED_PR_SCOPES.map(scope =>
      redis.hgetall<Record<string, unknown>>(seriesKey(scope))
    )
  );
  MERGED_PR_SCOPES.forEach((scope, index) => {
    const days: Record<string, DailyCount> = {};
    for (const [date, value] of Object.entries(hashes[index] ?? {})) {
      const decoded = decodeDailyCount(date, value);
      if (decoded) days[date] = decoded;
    }
    result[scope] = days;
  });
  return result;
}

function decodeReceipt(value: unknown): CompanyHistorySyncReceipt | null {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as { at?: unknown }).at === 'string'
      ? (parsed as CompanyHistorySyncReceipt)
      : null;
  } catch {
    return null;
  }
}

export async function readCompanyHistory(
  windows: readonly number[],
  options: { readonly now?: Date; readonly redis?: RedisStore | null } = {}
): Promise<CompanyHistoryReadback | null> {
  const redis = options.redis === undefined ? getRedis() : options.redis;
  if (!redis) return null;
  const nowMs = (options.now ?? new Date()).getTime();
  const [series, receipt] = await Promise.all([
    readMergedPrSeries(redis),
    redis.get<unknown>(RECEIPT_KEY).then(decodeReceipt),
  ]);
  const observed = MERGED_PR_SCOPES.flatMap(scope =>
    Object.values(series[scope]).map(day => Date.parse(day.observedAt))
  );
  if (observed.length === 0) return null;
  return {
    schema: COMPANY_HISTORY_SCHEMA,
    metric: 'merged_prs',
    definition: COMPANY_HISTORY_METRICS.merged_prs.definition,
    timezone: COMPANY_HISTORY_TIMEZONE,
    observedAt: new Date(Math.max(...observed)).toISOString(),
    lastSync: receipt,
    windows: Object.fromEntries(
      windows.map(days => [
        String(days),
        Object.fromEntries(
          MERGED_PR_SCOPES.map(scope => [
            scope,
            summarizeWindow(series[scope], nowMs, days),
          ])
        ),
      ])
    ) as CompanyHistoryReadback['windows'],
    cache: { readPathUpstreamCalls: 0, modelCalls: 0 },
  };
}

export type SearchCounts = (
  queries: Readonly<Record<string, string>>
) => Promise<
  | { readonly status: 'ok'; readonly counts: Readonly<Record<string, number>> }
  | { readonly status: 'unavailable'; readonly reason: string }
>;

export interface CompanyHistorySyncDependencies {
  readonly redis: RedisStore | null;
  readonly owner: string | null;
  readonly searchCounts: SearchCounts;
}

/**
 * Incremental fill: today and yesterday every run, then missing or
 * not-yet-final days in retention, at most two GraphQL requests per run.
 * Final days are never fetched again.
 */
export async function syncCompanyHistory(
  now: Date,
  deps: CompanyHistorySyncDependencies
): Promise<CompanyHistorySyncReceipt> {
  const at = now.toISOString();
  const unavailable = (reason: string): CompanyHistorySyncReceipt => ({
    at,
    requested: 0,
    written: 0,
    requests: 0,
    status: 'unavailable',
    reason,
  });
  if (!deps.redis) return unavailable('redis-unavailable');
  const owner = deps.owner;
  if (!owner) return unavailable('github-owner-unconfigured');
  const redis = deps.redis;
  const nowMs = now.getTime();
  const stored = await readMergedPrSeries(redis);
  const plan = planMergedPrSync(nowMs, stored);
  let written = 0;
  let requests = 0;
  let failure: string | null = null;
  for (
    let start = 0;
    start < plan.length && requests < COMPANY_HISTORY_MAX_REQUESTS_PER_SYNC;
    start += COMPANY_HISTORY_ALIASES_PER_REQUEST
  ) {
    const chunk = plan.slice(
      start,
      start + COMPANY_HISTORY_ALIASES_PER_REQUEST
    );
    const queries = Object.fromEntries(
      chunk.map((item, i) => [
        `q${i}`,
        mergedPrSearchQuery(owner, item.scope, item.date),
      ])
    );
    requests += 1;
    const read = await deps.searchCounts(queries);
    if (read.status !== 'ok') {
      failure = read.reason;
      break;
    }
    const byScope = new Map<MergedPrScope, Record<string, string>>();
    chunk.forEach((item, i) => {
      const count = read.counts[`q${i}`];
      if (count === undefined) return;
      const fields = byScope.get(item.scope) ?? {};
      fields[item.date] = encodeDailyCount({
        date: item.date,
        count,
        final: isFinalObservation(item.date, nowMs),
        observedAt: at,
      });
      byScope.set(item.scope, fields);
      written += 1;
    });
    await Promise.all(
      [...byScope].map(([scope, fields]) =>
        redis.hset(seriesKey(scope), fields)
      )
    );
  }
  const expired = MERGED_PR_SCOPES.flatMap(scope =>
    expiredDates(nowMs, Object.keys(stored[scope])).map(
      date => [scope, date] as const
    )
  );
  await Promise.all(
    expired.map(([scope, date]) => redis.hdel(seriesKey(scope), date))
  );
  const receipt: CompanyHistorySyncReceipt = {
    at,
    requested: plan.length,
    written,
    requests,
    status: failure ? (written > 0 ? 'partial' : 'unavailable') : 'ok',
    reason: failure,
  };
  await redis.set(RECEIPT_KEY, JSON.stringify(receipt));
  return receipt;
}
