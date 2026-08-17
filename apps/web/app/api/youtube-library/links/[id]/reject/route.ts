/**
 * POST /api/youtube-library/links/[id]/reject
 *
 * Rejects a pending ISRC release link with a human-provided reason.
 *
 * Authentication: Required (creator must own the profile)
 */

import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { youtubeVideoReleaseLinks } from '@/lib/db/schema/youtube-library';
import { captureError } from '@/lib/error-tracking';
import { validateLinkOwnership } from '../shared';

const rejectRequestSchema = z.object({
  rejectionReason: z.string().min(1).max(1000),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: linkId } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const parsed = rejectRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const validation = await validateLinkOwnership(linkId);
    if ('error' in validation) return validation.error;

    const now = new Date();
    await db
      .update(youtubeVideoReleaseLinks)
      .set({
        status: 'rejected',
        rejectionReason: parsed.data.rejectionReason,
        updatedAt: now,
      })
      .where(eq(youtubeVideoReleaseLinks.id, linkId));

    return NextResponse.json({
      success: true,
      linkId,
      message: 'Release link rejected',
    });
  } catch (error) {
    await captureError('YouTube library link rejection failed', error, {
      route: '/api/youtube-library/links/[id]/reject',
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
