import 'server-only';

import {
  configuredGithubOwner,
  readConfiguredSearchCounts,
} from '@/lib/ovie/shipping-state/configured.server';
import { getRedis } from '@/lib/redis';
import { syncCompanyMetrics } from './daily-metrics.server';
import { configuredMetricSources } from './metric-sources.server';
import { syncCompanyHistory } from './store.server';

/**
 * The hourly fill: merged PRs through the configured HUD GitHub token, and
 * the daily metrics (funnel, AI spend, CI, Linear) beside it, into the
 * shared Redis. A failing source never blocks the others.
 */
export async function syncConfiguredCompanyHistory(now = new Date()) {
  const redis = getRedis();
  const [history, metrics] = await Promise.all([
    syncCompanyHistory(now, {
      redis,
      owner: configuredGithubOwner(),
      searchCounts: readConfiguredSearchCounts,
    }),
    syncCompanyMetrics(now, { redis, sources: configuredMetricSources() }),
  ]);
  return { ...history, metrics };
}

const UNCONFIGURED_REASONS = new Set([
  'redis-unavailable',
  'github-owner-unconfigured',
]);

type SubJobRunner<T> = (
  name: string,
  fn: () => Promise<Record<string, unknown>>
) => Promise<T>;

/**
 * The frequent cron's company-history sub-job: the hourly slot only (minute
 * under 15), at most two batched GitHub searches. Final days are never
 * refetched, so Summer's 7/30-day answers and charts stay cache reads.
 */
export async function companyHistoryCronJob<T>(
  minute: number,
  run: SubJobRunner<T>,
  sync: (now: Date) => Promise<object> = syncConfiguredCompanyHistory
): Promise<T | { success: true; skipped: true }> {
  if (minute >= 15) return { success: true, skipped: true };
  return run('companyHistory', async () => {
    const result: Record<string, unknown> = { ...(await sync(new Date())) };
    // The sync reports failures as receipts; a merged-PR sync that wrote
    // nothing must still reach the sub-job's error capture. No Redis or no
    // GitHub owner is an environment without the integration, not an alert.
    if (
      result.status === 'unavailable' &&
      !UNCONFIGURED_REASONS.has(String(result.reason))
    ) {
      throw new Error(
        `company history sync unavailable: ${String(result.reason ?? 'unknown')}`
      );
    }
    return result;
  });
}
