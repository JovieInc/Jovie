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
