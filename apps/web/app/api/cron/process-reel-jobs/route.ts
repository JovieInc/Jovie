/**
 * Reel Job Processor Cron
 *
 * Claims one queued reel_jobs row, renders it via Remotion, uploads the MP4
 * to Vercel Blob, and marks the row succeeded (or failed with error text).
 *
 * Schedule: every 1 minute.
 * Max duration: 300s (Remotion renders on serverless typically run 30-90s
 * for a 7-second composition).
 */

import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import {
  claimNextReelJob,
  markReelJobFailed,
  markReelJobSucceeded,
} from '@/app/app/(shell)/dashboard/releases/reel-actions';
import { verifyCronRequest } from '@/lib/cron/auth';
import { captureError } from '@/lib/error-tracking';
import { renderReel } from '@/lib/reels/render';

export const runtime = 'nodejs';
export const maxDuration = 300;

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export async function GET(request: Request) {
  const authError = verifyCronRequest(request, {
    route: '/api/cron/process-reel-jobs',
    requireTrustedOrigin: true,
  });
  if (authError) return authError;

  const job = await claimNextReelJob();
  if (!job) {
    return NextResponse.json(
      { success: true, claimed: false },
      { headers: NO_STORE }
    );
  }

  try {
    const { buffer, durationMs } = await renderReel(
      job.templateSlug,
      job.templateInputs
    );

    const { url } = await put(
      `reels/${job.creatorProfileId}/${job.id}.mp4`,
      buffer,
      {
        access: 'public',
        contentType: 'video/mp4',
        addRandomSuffix: false,
      }
    );

    await markReelJobSucceeded(job.id, url, durationMs);

    return NextResponse.json(
      {
        success: true,
        claimed: true,
        jobId: job.id,
        outputUrl: url,
        durationMs,
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown render failure';
    await markReelJobFailed(job.id, message);
    captureError('reel job render failed', error, {
      context: 'cron/process-reel-jobs',
      jobId: job.id,
    });
    return NextResponse.json(
      { success: false, claimed: true, jobId: job.id, error: message },
      { status: 500, headers: NO_STORE }
    );
  }
}
