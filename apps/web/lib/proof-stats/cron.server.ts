import 'server-only';

import { refreshProofStats } from '@/lib/proof-stats/publish.server';

type SubJobRunner<T> = (
  name: string,
  job: () => Promise<Record<string, unknown>>
) => Promise<T>;

/**
 * Proof stats: hourly slot of /api/cron/frequent, four indexed counts plus one
 * content-record version when a value or a publishable state changed. A stat
 * that went stale is withdrawn here, which expires the cache tag so cached
 * pages drop the number. No new schedule.
 */
export async function proofStatsCronJob<T>(
  minute: number,
  run: SubJobRunner<T>
): Promise<T | { success: true; skipped: true }> {
  if (minute >= 15) return { success: true, skipped: true };
  return run('proofStats', async () => ({
    ...(await refreshProofStats(new Date())),
  }));
}
