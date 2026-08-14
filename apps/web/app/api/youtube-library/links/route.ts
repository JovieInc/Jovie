/**
 * GET /api/youtube-library/links
 *
 * The approval queue: pending_review ISRC release links across every creator
 * profile owned by the authenticated user.
 *
 * Authentication: Required
 */

import { NextResponse } from 'next/server';
import { getCachedAuth } from '@/lib/auth/cached';
import { captureError } from '@/lib/error-tracking';
import { listPendingReleaseLinksForUser } from '@/lib/youtube-library';

export async function GET() {
  try {
    const { userId } = await getCachedAuth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const links = await listPendingReleaseLinksForUser(userId);
    return NextResponse.json({ success: true, links });
  } catch (error) {
    await captureError('YouTube library link queue fetch failed', error, {
      route: '/api/youtube-library/links',
    });

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
