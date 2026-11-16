import 'server-only';

import {
  configuredGithubOwner,
  readConfiguredSearchCounts,
} from '@/lib/ovie/shipping-state/configured.server';
import { getRedis } from '@/lib/redis';
import { syncCompanyHistory } from './store.server';

/** The hourly fill, with the configured HUD GitHub token and the shared Redis. */
export function syncConfiguredCompanyHistory(now = new Date()) {
  return syncCompanyHistory(now, {
    redis: getRedis(),
    owner: configuredGithubOwner(),
    searchCounts: readConfiguredSearchCounts,
  });
}

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
  return run('companyHistory', async () => ({ ...(await sync(new Date())) }));
}
