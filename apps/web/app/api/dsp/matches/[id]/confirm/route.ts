/**
 * POST /api/dsp/matches/[id]/confirm
 *
 * Confirms a DSP artist match.
 * After confirmation, can trigger track enrichment to add links.
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

// ============================================================================
// Request Schema
// ============================================================================

const confirmRequestSchema = z.object({
  profileId: z.string().uuid(),
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
    const parsed = confirmRequestSchema.safeParse(body);

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

    const { profileId } = parsed.data;

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

    if (match.status === 'confirmed' || match.status === 'auto_confirmed') {
      return NextResponse.json(
        { success: false, error: 'Match is already confirmed' },
        { status: 400 }
      );
    }

    // Update match status to confirmed
    const now = new Date();
    await db
      .update(dspArtistMatches)
      .set({
        status: 'confirmed',
        confirmedAt: now,
        confirmedBy: null, // Could store Clerk user ID here if needed
        updatedAt: now,
      })
      .where(eq(dspArtistMatches.id, matchId));

    // TODO: Enqueue track enrichment job after confirmation

    return NextResponse.json({
      success: true,
      matchId,
      message: 'Match confirmed successfully',
    });
  } catch (error) {
    console.error('[DSP Match Confirm] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
