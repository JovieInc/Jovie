import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { ingestionJobs } from '@/lib/db';
import { env } from '@/lib/env';
import { claimPendingJobs, processJob } from '@/lib/ingestion/processor';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

function isAuthorized(request: NextRequest): boolean {
  const secret = env.INGESTION_CRON_SECRET ?? process.env.CRON_SECRET;

  if (!secret) {
    logger.error('Ingestion cron secret is not configured');
    return false;
  }

  return request.headers.get('x-ingestion-secret') === secret;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
      try {
        await withSystemIngestionSession(async tx => {
          await processJob(tx, job);
          await tx
            .update(ingestionJobs)
            .set({
              status: 'succeeded',
              error: null,
              updatedAt: new Date(),
            })
            .where(eq(ingestionJobs.id, job.id));
        });
        processed += 1;
      } catch (error) {
        await withSystemIngestionSession(async tx => {
          await tx
            .update(ingestionJobs)
            .set({
              status: 'failed',
              error: error instanceof Error ? error.message : 'Unknown error',
              updatedAt: new Date(),
            })
            .where(eq(ingestionJobs.id, job.id));
        });
        logger.error('Ingestion job failed', {
          jobId: job.id,
          error:
            error instanceof Error ? { message: error.message } : String(error),
        });
      }
    }

    return NextResponse.json(
      { ok: true, attempted, processed },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
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
      { status: 500 }
    );
  }
}
