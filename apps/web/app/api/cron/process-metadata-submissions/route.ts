import { NextResponse } from 'next/server';
import { verifyCronRequest } from '@/lib/cron/auth';
import { captureError } from '@/lib/error-tracking';
import { processQueuedMetadataSubmissions } from '@/lib/submission-agent/send-worker';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const authError = verifyCronRequest(request, {
    route: '/api/cron/process-metadata-submissions',
  });
  if (authError) {
    return authError;
  }

  try {
    const results = await processQueuedMetadataSubmissions();
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    await captureError('Metadata submission send cron failed', error, {
      route: '/api/cron/process-metadata-submissions',
    });
    return NextResponse.json(
      { ok: false, error: 'Failed to process metadata submissions' },
      { status: 500 }
    );
  }
}
