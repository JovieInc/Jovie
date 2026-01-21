import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env-server';
import {
  claimPendingJobs,
  handleIngestionJobFailure,
  processJob,
  succeedJob,
} from '@/lib/ingestion/processor';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * Timing-safe verification of ingestion secret to prevent timing attacks.
 */
function isAuthorized(request: NextRequest): boolean {
  const secret = env.INGESTION_CRON_SECRET ?? process.env.CRON_SECRET;

  if (!secret) {
    logger.error('Ingestion cron secret is not configured');
    return false;
  }

  const provided = request.headers.get('x-ingestion-secret');
  if (!provided) {
    return false;
  }

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(secret);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const now = new Date();
  let processed = 0;
  let attempted = 0;

  try {
    const claimed = await withSystemIngestionSession(tx =>
      claimPendingJobs(tx, now, 5)
    );

    attempted = claimed.length;

    for (const job of claimed) {
      const result = await withSystemIngestionSession(async tx => {
        try {
          await processJob(tx, job);
          await succeedJob(tx, job);

          return { ok: true as const };
        } catch (error) {
          await handleIngestionJobFailure(tx, job, error);

          logger.error('Ingestion job failed', {
            jobId: job.id,
            error:
              error instanceof Error
                ? { message: error.message, stack: error.stack }
                : String(error),
          });

          return { ok: false as const };
        }
      });

      if (result.ok) processed += 1;
    }

    return NextResponse.json(
      { ok: true, attempted, processed },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Ingestion job runner error', {
      error:
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : String(error),
    });
    return NextResponse.json(
      { error: 'Failed to process ingestion jobs' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
