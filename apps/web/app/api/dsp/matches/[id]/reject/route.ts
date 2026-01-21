/**
 * POST /api/dsp/matches/[id]/reject
 *
 * Rejects a DSP artist match.
 * User can provide a reason for rejection.
 *
 * Authentication: Required (creator must own the profile)
 */

import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db';
import { creatorProfiles, users } from '@/lib/db/schema';
import { dspArtistMatches } from '@/lib/db/schema/dsp-enrichment';
import { captureError } from '@/lib/error-tracking';

// ============================================================================
// Request Schema
// ============================================================================

const rejectRequestSchema = z.object({
  profileId: z.string().uuid(),
  reason: z.string().optional(),
});

// ============================================================================
// Route Handler
// ============================================================================

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: matchId } = await params;

    // Authenticate user
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
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

    const { profileId, reason } = parsed.data;

    // Verify user owns this profile (join with users to check clerkId)
    const [profile] = await db
      .select({ id: creatorProfiles.id, clerkId: users.clerkId })
      .from(creatorProfiles)
      .innerJoin(users, eq(users.id, creatorProfiles.userId))
      .where(eq(creatorProfiles.id, profileId))
      .limit(1);

    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'Profile not found' },
        { status: 404 }
      );
    }

    if (profile.clerkId !== userId) {
      return NextResponse.json(
        {
          success: false,
          error: 'You do not have permission to modify this profile',
        },
        { status: 403 }
      );
    }

    // Verify match exists and belongs to profile
    const [match] = await db
      .select({
        id: dspArtistMatches.id,
        creatorProfileId: dspArtistMatches.creatorProfileId,
        status: dspArtistMatches.status,
      })
      .from(dspArtistMatches)
      .where(eq(dspArtistMatches.id, matchId))
      .limit(1);

    if (!match) {
      return NextResponse.json(
        { success: false, error: 'Match not found' },
        { status: 404 }
      );
    }

    if (match.creatorProfileId !== profileId) {
      return NextResponse.json(
        { success: false, error: 'Match does not belong to this profile' },
        { status: 403 }
      );
    }

    if (match.status === 'rejected') {
      return NextResponse.json(
        { success: false, error: 'Match is already rejected' },
        { status: 400 }
      );
    }

    // Update match status to rejected
    const now = new Date();
    await db
      .update(dspArtistMatches)
      .set({
        status: 'rejected',
        rejectedAt: now,
        rejectionReason: reason ?? null,
        updatedAt: now,
      })
      .where(eq(dspArtistMatches.id, matchId));

    return NextResponse.json({
      success: true,
      matchId,
      message: 'Match rejected successfully',
    });
  } catch (error) {
    await captureError('DSP Match rejection failed', error, {
      route: '/api/dsp/matches/[id]/reject',
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
