import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { getSubmissionProvidersForApi } from '@/lib/submission-agent/service';

export async function GET() {
  try {
    const providers = await getSubmissionProvidersForApi();
    return NextResponse.json({ success: true, providers });
  } catch (error) {
    await captureError('Metadata submission providers route failed', error, {
      route: '/api/metadata-submissions/providers',
    });

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
