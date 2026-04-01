/**
 * Metadata submission monitoring cron.
 *
 * This stays cron-driven rather than webhook-driven because
 * `monitorMetadataSubmissionRequests()` compares expected metadata against live
 * third-party pages (for example AllMusic and Amazon), and those destinations
 * do not provide a callback when page content drifts.
 *
 * This remains separate from `/api/cron/process-metadata-submissions` because
 * monitoring is a read-heavy snapshot/discovery workflow with different
 * timeout, retry, and cadence requirements than the queued send path.
 *
 * Expected volume at launch is low: a small number of monitored targets per
 * request, typically single-digit fetches per monitored submission per run.
 * The intended cadence is hourly, with `maxDuration = 60` keeping the route
 * bounded even if a third-party target is slow.
 */
import { NextResponse } from 'next/server';
import { verifyCronRequest } from '@/lib/cron/auth';
import { captureError } from '@/lib/error-tracking';
import { monitorMetadataSubmissionRequests } from '@/lib/submission-agent/monitor-worker';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const authError = verifyCronRequest(request, {
    route: '/api/cron/monitor-metadata-submissions',
  });
  if (authError) {
    return authError;
  }

  try {
    const results = await monitorMetadataSubmissionRequests();
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    await captureError('Metadata submission monitor cron failed', error, {
      route: '/api/cron/monitor-metadata-submissions',
    });
    return NextResponse.json(
      { ok: false, error: 'Failed to monitor metadata submissions' },
      { status: 500 }
    );
  }
}
