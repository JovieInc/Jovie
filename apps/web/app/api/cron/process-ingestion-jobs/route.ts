/**
 * Cron handler for processing ingestion jobs.
 *
 * Runs every minute to claim and process pending ingestion jobs (e.g. MusicFetch enrichment).
 * Mirrors the logic in /api/ingestion/jobs but triggered by Vercel Cron instead of manual POST.
 *
 * Schedule: every 1 minute (configured in vercel.json)
 */

import { NextResponse } from 'next/server';
import { getOperationalControls } from '@/lib/admin/operational-controls';
import { verifyCronRequest } from '@/lib/cron/auth';
import { runMonitoredCron } from '@/lib/cron/monitoring';
import { captureError } from '@/lib/error-tracking';
import {
  claimPendingJobs,
  handleIngestionJobFailure,
  processJob,
  succeedJob,
} from '@/lib/ingestion/processor';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const maxDuration = 300;

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;
const MAX_CONCURRENT_JOBS = 3;
const PROCESS_INGESTION_MONITOR = {
  slug: 'cron-process-ingestion-jobs',
  schedule: '* * * * *',
  maxRuntime: 5,
  checkinMargin: 3,
} as const;

export async function GET(request: Request) {
  const authError = verifyCronRequest(request, {
    route: '/api/cron/process-ingestion-jobs',
  });
  if (authError) return authError;

  const controls = await getOperationalControls();
  if (!controls.cronFanoutEnabled) {
    return NextResponse.json(
      {
        ok: true,
        skipped: true,
        reason: 'cron_fanout_disabled',
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  }

  return runMonitoredCron(
    {
      monitor: PROCESS_INGESTION_MONITOR,
      shouldFailResult: response => response.status !== 200,
    },
    async () => {
      const now = new Date();
      let processed = 0;
      let attempted = 0;
      const errors: string[] = [];

      try {
        const claimed = await withSystemIngestionSession(tx =>
          claimPendingJobs(tx, now, 5)
        );

        attempted = claimed.length;

        const processJobTransaction = async (
          job: (typeof claimed)[number]
        ): Promise<boolean> => {
          const result = await withSystemIngestionSession(async tx => {
            try {
              await processJob(tx, job);
              await succeedJob(tx, job);
              return { ok: true as const };
            } catch (error) {
              await handleIngestionJobFailure(tx, job, error);

              const msg =
                error instanceof Error ? error.message : String(error);
              logger.error('Ingestion job failed', {
                jobId: job.id,
                error:
                  error instanceof Error
                    ? { message: error.message, stack: error.stack }
                    : String(error),
              });

              await captureError('Ingestion job failed', error, {
                route: '/api/cron/process-ingestion-jobs',
                jobId: job.id,
                jobType: job.jobType,
                attempts: job.attempts,
              });

              errors.push(`Job ${job.id}: ${msg}`);
              return { ok: false as const };
            }
          });

          return result.ok;
        };

        for (let i = 0; i < claimed.length; i += MAX_CONCURRENT_JOBS) {
          const batch = claimed.slice(i, i + MAX_CONCURRENT_JOBS);
          const results = await Promise.all(batch.map(processJobTransaction));
          processed += results.filter(Boolean).length;
        }

        return NextResponse.json(
          { ok: true, attempted, processed, errors },
          { status: 200, headers: NO_STORE_HEADERS }
        );
      } catch (error) {
        logger.error('Ingestion cron runner error', {
          error:
            error instanceof Error
              ? { message: error.message, stack: error.stack }
              : String(error),
        });
        await captureError('Ingestion cron processing failed', error, {
          route: '/api/cron/process-ingestion-jobs',
          method: 'GET',
        });
        return NextResponse.json(
          { error: 'Failed to process ingestion jobs' },
          { status: 500, headers: NO_STORE_HEADERS }
        );
      }
    }
  );
}
