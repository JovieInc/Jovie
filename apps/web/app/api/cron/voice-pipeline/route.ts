/**
 * Cron handler for async voice pipeline jobs (gh-9810)
 *
 * Scheduled sweep for pending / in-progress async voice work (cloning,
 * generation, post-processing). Complements the webhook receiver:
 * - Webhook = event-driven ingress (fast path for 11Labs callbacks)
 * - Cron = reliability net + scheduled reconciliation (e.g. stuck jobs,
 *   status polling for long-running 11Labs ops that don't callback reliably)
 *
 * Follows exact patterns from process-ingestion-jobs, process-merch-fulfillment
 * etc. (gstack P3 pragmatic, P4 DRY, P5 explicit).
 *
 * Schedule: every 5 minutes (added to vercel.json crons).
 * Max duration 300s (covered by the app/api/cron/** glob in vercel.json).
 *
 * Auth: verifyCronRequest (trusted hosts + optional CRON_SECRET bearer).
 *
 * Current implementation (minimal complete per plan HOT ZONE + P1/P6):
 * - Verifies cron auth
 * - Logs structured tick (observable in logs / monitoring)
 * - Placeholder for claim/process/succeed/failure of voice jobs.
 *   When voice job tracking (table + 11Labs client) lands (9807+), this
 *   becomes the poller that advances jobs, fires memory events, etc.
 *   The webhook can also directly invoke the processor logic for
 *   low-latency event-driven runs.
 *
 * Idempotency & safety built-in via the same libs used by peer crons.
 */

import { NextResponse } from 'next/server';

import { verifyCronRequest } from '@/lib/cron/auth';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const maxDuration = 300;

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

interface VoicePipelineCronResult {
  processed: number;
  attempted: number;
  errors: string[];
}

export async function GET(request: Request) {
  const authError = verifyCronRequest(request, {
    route: '/api/cron/voice-pipeline',
  });
  if (authError) return authError;

  const now = new Date();
  const result: VoicePipelineCronResult = {
    processed: 0,
    attempted: 0,
    errors: [],
  };

  try {
    logger.info('[Voice Pipeline Cron] Tick starting', {
      at: now.toISOString(),
    });

    // === FUTURE: claim pending voice jobs ===
    // Example shape (when voice_jobs schema + processor exist):
    // const claimed = await withSystemVoiceSession(tx =>
    //   claimPendingVoiceJobs(tx, now, 10)
    // );
    // result.attempted = claimed.length;
    //
    // for (const job of claimed) {
    //   try {
    //     await processVoicePipelineJob(tx, job); // status poll 11Labs, update, side effects
    //     await succeedVoiceJob(tx, job);
    //     result.processed++;
    //   } catch (e) {
    //     await handleVoiceJobFailure(tx, job, e);
    //     result.errors.push(...);
    //     await captureError(...);
    //   }
    // }

    // Current minimal working behavior (completeness over cleverness):
    // Acknowledge the tick. This endpoint is live, authenticated, logged,
    // and will be the attachment point for real job processing without
    // requiring another cron registration change.
    logger.info('[Voice Pipeline Cron] Tick complete (stub)', {
      at: now.toISOString(),
      attempted: result.attempted,
      processed: result.processed,
      errorCount: result.errors.length,
    });

    return NextResponse.json(
      {
        ok: true,
        ...result,
        note: 'voice-pipeline cron active (gh-9810). Real job claiming will be wired when voice job model lands.',
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    logger.error('[Voice Pipeline Cron] Tick failed', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });

    await captureError('Voice pipeline cron tick crashed', err, {
      route: '/api/cron/voice-pipeline',
    });

    return NextResponse.json(
      { ok: false, error: 'cron tick failed' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
