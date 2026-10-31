/**
 * Cron: /api/cron/queue-tick (every 5 minutes, fail-safe) and event kicks.
 *
 * Replaces the separate crons for summarize-interviews, process-ingestion-jobs,
 * process-workflow-runs and process-merch-fulfillment (the voice-pipeline cron
 * was a no-op stub and is removed). `?only=ingestion,merch` runs just those
 * queues; enqueue sites call it through `kickQueue` so work starts at insert
 * time instead of waiting for the next tick.
 *
 * Auth: verifyCronRequest (trusted host or CRON_SECRET bearer).
 */
import { NextResponse } from 'next/server';
import { verifyCronRequest } from '@/lib/cron/auth';
import { runQueueTick } from '@/lib/cron/queue-tick';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: Request) {
  const authError = verifyCronRequest(request, {
    route: '/api/cron/queue-tick',
  });
  if (authError) return authError;

  const only = new URL(request.url).searchParams.get('only');
  const results = await runQueueTick(request, only);
  const ok = results.every(result => result.ok);
  logger.info('[Queue Tick] done', {
    only,
    trigger: only ? 'kick' : 'cron',
    results,
  });
  return NextResponse.json(
    { ok, results },
    { status: ok ? 200 : 500, headers: NO_STORE_HEADERS }
  );
}
