/**
 * GET /api/dsp/matches
 *
 * Lists DSP artist matches for a creator profile.
 * Returns match suggestions with confidence scores from various providers.
 *
 * Query params:
 * - profileId: Required - Creator profile ID
 * - status: Optional - Filter by status (suggested, confirmed, rejected, auto_confirmed)
 *
 * Authentication: Required (creator must own the profile)
 */

import { auth } from '@clerk/nextjs/server';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { dspArtistMatches } from '@/lib/db/schema/dsp-enrichment';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import type { DspMatchStatus } from '@/lib/dsp-enrichment/types';
import { captureError } from '@/lib/error-tracking';

// ============================================================================
// Route Handler
// ============================================================================

export async function GET(request: Request) {
  try {
    // Authenticate user
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const profileId = searchParams.get('profileId');
    const statusFilter = searchParams.get('status') as DspMatchStatus | null;

    if (!profileId) {
      return NextResponse.json(
        { success: false, error: 'profileId is required' },
        { status: 400 }
      );
    }

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
          error: 'You do not have permission to view this profile',
        },
        { status: 403 }
      );
    }

    // Build query conditions
    const conditions = [eq(dspArtistMatches.creatorProfileId, profileId)];

    if (statusFilter) {
      conditions.push(eq(dspArtistMatches.status, statusFilter));
    }

    // Fetch matches
    const matches = await db
      .select({
        id: dspArtistMatches.id,
        providerId: dspArtistMatches.providerId,
        externalArtistId: dspArtistMatches.externalArtistId,
        externalArtistName: dspArtistMatches.externalArtistName,
        externalArtistUrl: dspArtistMatches.externalArtistUrl,
        externalArtistImageUrl: dspArtistMatches.externalArtistImageUrl,
        confidenceScore: dspArtistMatches.confidenceScore,
        confidenceBreakdown: dspArtistMatches.confidenceBreakdown,
        matchingIsrcCount: dspArtistMatches.matchingIsrcCount,
        matchingUpcCount: dspArtistMatches.matchingUpcCount,
        totalTracksChecked: dspArtistMatches.totalTracksChecked,
        status: dspArtistMatches.status,
        createdAt: dspArtistMatches.createdAt,
        updatedAt: dspArtistMatches.updatedAt,
      })
      .from(dspArtistMatches)
      .where(and(...conditions))
      .orderBy(dspArtistMatches.createdAt)
      .limit(100);

    // Transform decimal to number for JSON response
    const transformedMatches = matches.map(match => ({
      ...match,
      confidenceScore: match.confidenceScore
        ? Number.parseFloat(match.confidenceScore)
        : null,
    }));

    return NextResponse.json({
      success: true,
      matches: transformedMatches,
    });
  } catch (error) {
    await captureError('DSP Matches list failed', error, {
      route: '/api/dsp/matches',
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
