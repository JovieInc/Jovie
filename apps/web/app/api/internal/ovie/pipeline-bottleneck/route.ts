import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/middleware';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { loadPipelineBottleneck } from '@/lib/ovie/pipeline-bottleneck.server';

export async function GET(): Promise<NextResponse> {
  try {
    const denied = await requireAdmin();
    if (denied) {
      denied.headers.set('Cache-Control', 'no-store');
      return denied;
    }
    return NextResponse.json(await loadPipelineBottleneck(), {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    await captureError('Pipeline bottleneck read failed', error);
    return NextResponse.json(
      { error: 'Bottleneck unavailable' },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}
