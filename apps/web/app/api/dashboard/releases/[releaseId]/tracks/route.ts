import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { getCurrentUserProfile } from '@/lib/auth/session';
import { loadReleaseTracksForProfile } from '@/lib/discography/release-track-loader';

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

    const handle = profile.usernameNormalized ?? profile.username ?? '';
    const tracks = await loadReleaseTracksForProfile({
      releaseId,
      profileId: profile.id,
      profileHandle: handle,
    });

    return NextResponse.json(tracks, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    if (error instanceof TypeError && error.message === 'Release not found') {
      return NextResponse.json(
        { error: 'Release not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }
    Sentry.captureException(error);
    return NextResponse.json(
      { error: 'Failed to load tracks' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
