/**
 * POST /api/youtube-library/links/[id]/approve
 *
 * Approves a pending ISRC release link between a YouTube video and a
 * catalog release/recording.
 *
 * Authentication: Required (creator must own the profile)
 */

import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { youtubeVideoReleaseLinks } from '@/lib/db/schema/youtube-library';
import { captureError } from '@/lib/error-tracking';
import { validateLinkOwnership } from '../shared';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: linkId } = await params;
    const validation = await validateLinkOwnership(linkId);
    if ('error' in validation) return validation.error;
    const { userId } = validation;

    const now = new Date();
    await db
      .update(youtubeVideoReleaseLinks)
      .set({
        status: 'approved',
        approvedBy: userId,
        approvedAt: now,
        updatedAt: now,
      })
      .where(eq(youtubeVideoReleaseLinks.id, linkId));

    return NextResponse.json({
      success: true,
      linkId,
      message: 'Release link approved',
    });
  } catch (error) {
    await captureError('YouTube library link approval failed', error, {
      route: '/api/youtube-library/links/[id]/approve',
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
