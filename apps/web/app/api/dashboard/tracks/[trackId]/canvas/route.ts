import { NextResponse } from 'next/server';
import { getCurrentUserProfile } from '@/lib/auth/session';
import {
  getTrackCanvasHistory,
  resolveOwnedTrackCanvasContext,
} from '@/lib/services/canvas/service';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ trackId: string }> }
) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { trackId } = await params;
    const track = await resolveOwnedTrackCanvasContext({
      creatorProfileId: profile.id,
      trackId,
    });
    const history = await getTrackCanvasHistory({
      releaseId: track.releaseId,
      trackId: track.trackId,
      releaseTrackId: track.releaseTrackId,
    });
    return NextResponse.json(history);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';
    const status = message === 'Track not found' ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
