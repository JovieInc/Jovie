import 'server-only';

import { getRedis } from '@/lib/redis';
import {
  OVIE_ROUTE_USAGE_DEFAULT_WINDOW_DAYS,
  OVIE_ROUTE_USAGE_RETENTION_DAYS,
  type OvieRouteUsageRow,
  ovieUsageDayKey,
  summarizeRouteUsage,
} from './route-usage';

const DAY_MS = 24 * 60 * 60_000;

/** Count one view of a route key. Fails soft: measurement never breaks a page. */
export async function recordOvieRouteView(
  routeKey: string,
  now: Date = new Date()
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    const key = ovieUsageDayKey(now);
    await redis.hincrby(key, routeKey, 1);
    await redis.expire(key, OVIE_ROUTE_USAGE_RETENTION_DAYS * 24 * 60 * 60);
    return true;
  } catch {
    return false;
  }
}

/** Views per route over the last `days` UTC days, most used first. */
export async function readOvieRouteUsage(
  days: number = OVIE_ROUTE_USAGE_DEFAULT_WINDOW_DAYS,
  now: Date = new Date()
): Promise<{
  readonly rows: readonly OvieRouteUsageRow[];
  readonly measured: boolean;
}> {
  const redis = getRedis();
  if (!redis) return { rows: [], measured: false };
  const window = Math.min(
    Math.max(Math.trunc(days), 1),
    OVIE_ROUTE_USAGE_RETENTION_DAYS
  );
  try {
    const dates = Array.from(
      { length: window },
      (_, i) => new Date(now.getTime() - i * DAY_MS)
    );
    const results = await Promise.all(
      dates.map(date =>
        redis.hgetall<Record<string, number | string>>(ovieUsageDayKey(date))
      )
    );
    return {
      measured: true,
      rows: summarizeRouteUsage(
        results.map((counts, i) => ({
          day: (dates[i] ?? now).toISOString().slice(0, 10),
          counts: Object.fromEntries(
            Object.entries(counts ?? {}).map(([route, n]) => [route, Number(n)])
          ),
        }))
      ),
    };
  } catch {
    return { rows: [], measured: false };
  }
}
