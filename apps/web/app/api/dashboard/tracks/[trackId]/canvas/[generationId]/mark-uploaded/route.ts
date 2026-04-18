import { NextResponse } from 'next/server';
import { getCurrentUserProfile } from '@/lib/auth/session';
import {
  markTrackCanvasUploaded,
  resolveOwnedTrackCanvasContext,
} from '@/lib/services/canvas/service';

export const runtime = 'nodejs';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ trackId: string; generationId: string }> }
) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { trackId, generationId } = await params;
    const track = await resolveOwnedTrackCanvasContext({
      creatorProfileId: profile.id,
      trackId,
    });
    const history = await markTrackCanvasUploaded({
      releaseId: track.releaseId,
      trackId: track.trackId,
      releaseTrackId: track.releaseTrackId,
      generationId,
    });
    return NextResponse.json({ success: true, history });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';
    const status =
      message === 'Track not found' || message === 'Canvas generation not found'
        ? 404
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
