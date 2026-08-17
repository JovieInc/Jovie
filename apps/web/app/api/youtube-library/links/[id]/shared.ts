/**
 * Shared validation for /api/youtube-library/links/[id]/* (JOV-5136)
 *
 * Verifies the caller is authenticated and that the link's video belongs to
 * a creator profile owned by the caller (canonical userProfileClaims
 * ownership with legacy creatorProfiles.userId fallback, via
 * getAuthenticatedProfile).
 */

import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { getAuthenticatedProfile } from '@/lib/db/queries/shared';
import {
  youtubeVideoReleaseLinks,
  youtubeVideos,
} from '@/lib/db/schema/youtube-library';

export interface ValidatedLink {
  readonly id: string;
  readonly status: string;
}

export async function validateLinkOwnership(
  linkId: string
): Promise<{ error: NextResponse } | { userId: string; link: ValidatedLink }> {
  const { userId } = await getCachedAuth();
  if (!userId) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const [link] = await db
    .select({
      id: youtubeVideoReleaseLinks.id,
      status: youtubeVideoReleaseLinks.status,
      creatorProfileId: youtubeVideos.creatorProfileId,
    })
    .from(youtubeVideoReleaseLinks)
    .innerJoin(
      youtubeVideos,
      eq(youtubeVideos.id, youtubeVideoReleaseLinks.videoId)
    )
    .where(eq(youtubeVideoReleaseLinks.id, linkId))
    .limit(1);

  if (!link) {
    return {
      error: NextResponse.json(
        { success: false, error: 'Link not found' },
        { status: 404 }
      ),
    };
  }

  const profile = await getAuthenticatedProfile(
    db,
    link.creatorProfileId,
    userId
  );
  if (!profile) {
    return {
      error: NextResponse.json(
        {
          success: false,
          error: 'You do not have permission to modify this link',
        },
        { status: 403 }
      ),
    };
  }

  if (link.status !== 'pending_review') {
    return {
      error: NextResponse.json(
        { success: false, error: `Link is already ${link.status}` },
        { status: 400 }
      ),
    };
  }

  return { userId, link: { id: link.id, status: link.status } };
}
