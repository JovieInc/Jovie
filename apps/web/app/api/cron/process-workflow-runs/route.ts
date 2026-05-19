/**
 * Cron: /api/cron/process-workflow-runs (every 6 minutes)
 *
 * Decision hierarchy compliance (per .claude/rules/infra.md):
 * 1. Webhook/event: N/A — workflow runs are triggered by the approve endpoint
 *    which already inserts the row. We need a processor to execute them.
 * 2. Inline after-action: The approve endpoint inserts the run; execution
 *    happens here so the HTTP response is not delayed by the Google Calendar call.
 * 3. On-demand: Not applicable — the work must happen after approval.
 * 4. Existing cron: process-ingestion-jobs handles different workflow types;
 *    workflow_runs has different semantics (concurrent, multi-step).
 * 5. New cron: Required here because calendar API calls are external and slow.
 *
 * Cadence: 6 minutes (JOV-2500). The original every-minute cadence kept Neon's
 * production compute warm 24/7 (5-minute autosuspend never fired between ticks),
 * adding ~$10-25/month of compute overage at zero users. The 6-minute cadence
 * gives the compute a ~1-minute idle window to autosuspend between ticks. The
 * tradeoff is up to ~6 minutes between approval and execution; acceptable until
 * we move to event-driven enqueue (see JOV-2500 follow-on).
 *
 * Design:
 * - CAS claim: UPDATE ... SET status='running' WHERE status='pending' AND runAt<=now()
 * - Process MAX_RUNS_PER_TICK runs, MAX_CONCURRENT_RUNS in parallel
 * - Unknown workflow kinds are failed immediately (fail-closed)
 *
 * Cost impact: 1 DB query/tick + up to 20 Google Calendar API calls/tick
 * at 240 ticks/day = max 4,800 Google API calls/day at full load.
 * In practice: only runs when there are pending workflow_runs rows.
 */

import { and, eq, inArray, lte } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import {
  executeApprovedAction,
  markWorkflowFailed,
} from '@/lib/connectors/workflows/execute-approved-action';
import { db } from '@/lib/db';
import { workflowRuns } from '@/lib/db/schema/connectors';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

export const maxDuration = 300;

const MAX_RUNS_PER_TICK = 20;
const MAX_CONCURRENT_RUNS = 5;

export async function GET(request: Request): Promise<Response> {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();

  try {
    // Step 1: SELECT up to MAX_RUNS_PER_TICK pending runs (uses LIMIT)
    const pendingRuns = await db
      .select({ id: workflowRuns.id, kind: workflowRuns.kind })
      .from(workflowRuns)
      .where(
        and(eq(workflowRuns.status, 'pending'), lte(workflowRuns.runAt, now))
      )
      .limit(MAX_RUNS_PER_TICK);

    if (pendingRuns.length === 0) {
      return NextResponse.json({ ok: true, processed: 0 });
    }

    // Step 2: CAS claim by ID — atomically transition to 'running'
    const pendingIds = pendingRuns.map(r => r.id);
    const claimed = await db
      .update(workflowRuns)
      .set({ status: 'running', updatedAt: now })
      .where(
        and(
          inArray(workflowRuns.id, pendingIds),
          eq(workflowRuns.status, 'pending')
        )
      )
      .returning({
        id: workflowRuns.id,
        kind: workflowRuns.kind,
      });

    if (claimed.length === 0) {
      return NextResponse.json({ ok: true, processed: 0 });
    }

    logger.info('[process-workflow-runs] claimed runs', {
      count: claimed.length,
    });

    // Process in batches of MAX_CONCURRENT_RUNS
    let processed = 0;
    let failed = 0;

    for (let i = 0; i < claimed.length; i += MAX_CONCURRENT_RUNS) {
      const batch = claimed.slice(i, i + MAX_CONCURRENT_RUNS);
      await Promise.allSettled(
        batch.map(async run => {
          try {
            if (run.kind === 'execute_approved_action') {
              await executeApprovedAction({ workflowRunId: run.id });
              processed++;
            } else {
              logger.warn('[process-workflow-runs] unknown workflow kind', {
                runId: run.id,
                kind: run.kind,
              });
              await markWorkflowFailed(
                run.id,
                `unknown workflow kind: ${run.kind}`
              );
              failed++;
            }
          } catch (err) {
            logger.error('[process-workflow-runs] run threw unexpectedly', {
              runId: run.id,
              kind: run.kind,
              err,
            });
            await captureError('process-workflow-runs run error', err, {
              runId: run.id,
              kind: run.kind,
            });
            await markWorkflowFailed(
              run.id,
              err instanceof Error ? err.message : String(err)
            );
            failed++;
          }
        })
      );
    }

    return NextResponse.json({
      ok: true,
      claimed: claimed.length,
      processed,
      failed,
    });
  } catch (err) {
    logger.error('[process-workflow-runs] cron tick failed', err);
    await captureError('process-workflow-runs cron tick failed', err, {});
    return NextResponse.json({ error: 'internal-error' }, { status: 500 });
  }
}
