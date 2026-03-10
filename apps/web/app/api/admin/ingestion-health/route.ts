import { sql as drizzleSql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import { getQueueDepth } from '@/lib/ingestion/jobs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;
const STUCK_THRESHOLD_MS = 20 * 60 * 1000; // 20 minutes

/**
 * GET /api/admin/ingestion-health
 *
 * Returns ingestion pipeline health metrics:
 * - Queue depth by job type (pending + processing)
 * - Oldest pending job age (ms)
 * - Stuck job count (processing > 20 min)
 * - Recent failure count (last 24h)
 */
export async function GET() {
  const authError = await requireAdmin();
  if (authError) return authError;

  const now = new Date();

  const [queueDepth, oldestPendingResult, stuckResult, recentFailuresResult] =
    await Promise.all([
      getQueueDepth(db),

      db.execute(
        drizzleSql`
          SELECT MIN(run_at) AS oldest_run_at
          FROM ingestion_jobs
          WHERE status = 'pending'
        `
      ),

      db.execute(
        drizzleSql`
          SELECT COUNT(*)::int AS stuck_count
          FROM ingestion_jobs
          WHERE status = 'processing'
            AND updated_at < ${new Date(now.getTime() - STUCK_THRESHOLD_MS)}
        `
      ),

      db.execute(
        drizzleSql`
          SELECT COUNT(*)::int AS failure_count
          FROM ingestion_jobs
          WHERE status = 'failed'
            AND updated_at > ${new Date(now.getTime() - 24 * 60 * 60 * 1000)}
        `
      ),
    ]);

  const oldestRunAt = (
    oldestPendingResult.rows[0] as { oldest_run_at: string | null }
  ).oldest_run_at;
  const oldestPendingAgeMs = oldestRunAt
    ? now.getTime() - new Date(oldestRunAt).getTime()
    : null;

  const stuckCount = (stuckResult.rows[0] as { stuck_count: number })
    .stuck_count;
  const recentFailureCount = (
    recentFailuresResult.rows[0] as { failure_count: number }
  ).failure_count;

  return NextResponse.json(
    {
      queueDepth,
      oldestPendingAgeMs,
      stuckJobCount: stuckCount,
      recentFailureCount24h: recentFailureCount,
      timestamp: now.toISOString(),
    },
    { headers: NO_STORE_HEADERS }
  );
}
