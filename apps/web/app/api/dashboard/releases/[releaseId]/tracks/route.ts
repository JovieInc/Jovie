import { NextResponse } from 'next/server';
import { getCurrentUserProfile } from '@/lib/auth/session';
import {
  getReleaseById,
  getTracksForReleaseWithProviders,
} from '@/lib/discography/queries';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
} as const;

/**
 * GET /api/dashboard/releases/[releaseId]/tracks
 *
 * Load tracks for a release. Used by the sidebar tracklist to avoid
 * calling the server action (which triggers RSC tree reconciliation
 * and can cause the drawer to unmount).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  try {
    const profile = await getCurrentUserProfile();

    if (!profile) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const { releaseId } = await params;

    // Verify the release belongs to the user's profile
    const release = await getReleaseById(releaseId);
    if (!release || release.creatorProfileId !== profile.id) {
      return NextResponse.json(
        { error: 'Release not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const { tracks } = await getTracksForReleaseWithProviders(releaseId);

    // Map to a minimal shape for the sidebar tracklist
    const mapped = tracks.map(track => ({
      id: track.id,
      releaseId: track.releaseId,
      title: track.title,
      trackNumber: track.trackNumber,
      discNumber: track.discNumber,
      durationMs: track.durationMs,
      isrc: track.isrc,
      isExplicit: track.isExplicit,
      previewUrl: track.previewUrl,
    }));

    return NextResponse.json(mapped, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    console.error('Failed to load tracks:', error);
    return NextResponse.json(
      { error: 'Failed to load tracks' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
