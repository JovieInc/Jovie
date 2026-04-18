import { NextResponse } from 'next/server';
import { getCurrentUserProfile } from '@/lib/auth/session';
import {
  getCanvasDownloadArtifact,
  resolveOwnedTrackCanvasContext,
} from '@/lib/services/canvas/service';
import { readCanvasArtifact } from '@/lib/services/canvas/storage';

export const runtime = 'nodejs';

export async function GET(
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
    const artifact = await getCanvasDownloadArtifact({
      releaseId: track.releaseId,
      trackId: track.trackId,
      releaseTrackId: track.releaseTrackId,
      generationId,
    });
    const file = await readCanvasArtifact({
      storagePath: artifact.storagePath,
    });

    return new NextResponse(new Uint8Array(file.body), {
      headers: {
        'Content-Type': artifact.mimeType,
        'Content-Disposition': `attachment; filename=\"spotify-canvas-${generationId}.mp4\"`,
        'Cache-Control': 'no-store',
        ...(file.contentLength
          ? { 'Content-Length': String(file.contentLength) }
          : {}),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';
    const status =
      message === 'Track not found' || message === 'Canvas artifact not found'
        ? 404
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
