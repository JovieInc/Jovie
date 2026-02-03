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
import { users } from '@/lib/db/schema/auth';
import { dspArtistMatches } from '@/lib/db/schema/dsp-enrichment';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError, captureWarning } from '@/lib/error-tracking';
import { enqueueDspTrackEnrichmentJob } from '@/lib/ingestion/jobs';

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
        providerId: dspArtistMatches.providerId,
        externalArtistId: dspArtistMatches.externalArtistId,
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

    // Enqueue track enrichment job to add DSP links to tracks
    if (match.externalArtistId) {
      try {
        await enqueueDspTrackEnrichmentJob({
          creatorProfileId: profileId,
          matchId,
          providerId: match.providerId as
            | 'apple_music'
            | 'deezer'
            | 'musicbrainz',
          externalArtistId: match.externalArtistId,
        });
      } catch (enrichmentError) {
        // Log but don't fail the confirmation - enrichment can be retried
        await captureWarning(
          'Failed to enqueue track enrichment job after match confirmation',
          enrichmentError,
          { route: '/api/dsp/matches/[id]/confirm', matchId, profileId }
        );
      }
    }

    return NextResponse.json({
      success: true,
      matchId,
      message: 'Match confirmed successfully',
    });
  } catch (error) {
    await captureError('DSP Match confirmation failed', error, {
      route: '/api/dsp/matches/[id]/confirm',
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
