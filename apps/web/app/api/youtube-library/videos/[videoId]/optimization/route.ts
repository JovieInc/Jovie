import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  loadYouTubeOptimizationSnapshot,
  requireLibraryProfileAccess,
} from '@/lib/library/track-drawer.server';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId } = await params;
    const creatorProfileId = new URL(request.url).searchParams.get(
      'creatorProfileId'
    );
    if (!videoId || !creatorProfileId) {
      return NextResponse.json(
        { error: 'Invalid payload' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    const auth = await requireLibraryProfileAccess(creatorProfileId);
    if (auth.error) return auth.error;
    const snapshot = await loadYouTubeOptimizationSnapshot({
      creatorProfileId,
      videoId,
    });
    if (!snapshot) {
      return NextResponse.json(
        { error: 'Video was not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }
    return NextResponse.json({ snapshot }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    await captureError('YouTube optimization snapshot failed', error, {
      route: '/api/youtube-library/videos/[videoId]/optimization',
      method: 'GET',
    });
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
