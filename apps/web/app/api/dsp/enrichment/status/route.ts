/**
 * GET /api/dsp/enrichment/status
 *
 * Returns the enrichment status for a creator profile.
 * Shows progress of discovery, track matching, and profile enrichment.
 *
 * Query params:
 * - profileId: Required - Creator profile ID
 *
 * Authentication: Required (creator must own the profile)
 */

import { auth } from '@clerk/nextjs/server';
import { and, eq, or } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db, ingestionJobs } from '@/lib/db';
import { creatorProfiles, users } from '@/lib/db/schema';
import { dspArtistMatches } from '@/lib/db/schema/dsp-enrichment';
import type { EnrichmentPhase, ProviderEnrichmentStatus } from '@/lib/queries';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Determine overall phase from provider statuses and pending jobs.
 */
function determineOverallPhase(
  providerStatuses: ProviderEnrichmentStatus[],
  hasPendingDiscoveryJob: boolean
): EnrichmentPhase {
  // If there's a pending discovery job, we're discovering
  if (hasPendingDiscoveryJob) {
    return 'discovering';
  }

  // Check if any provider is in an active phase
  const activePhases: EnrichmentPhase[] = [
    'discovering',
    'matching',
    'enriching',
  ];
  for (const status of providerStatuses) {
    if (activePhases.includes(status.phase)) {
      return status.phase;
    }
  }

  // Check if any provider failed
  if (providerStatuses.some(s => s.phase === 'failed')) {
    return 'failed';
  }

  // Check if all providers are complete
  if (
    providerStatuses.length > 0 &&
    providerStatuses.every(s => s.phase === 'complete')
  ) {
    return 'complete';
  }

  // Default to idle
  return 'idle';
}

/**
 * Calculate overall progress from provider statuses.
 */
function calculateOverallProgress(
  providerStatuses: ProviderEnrichmentStatus[]
): number {
  if (providerStatuses.length === 0) {
    return 0;
  }

  const totalProgress = providerStatuses.reduce(
    (sum, s) => sum + s.progress,
    0
  );
  return Math.round(totalProgress / providerStatuses.length);
}

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

    if (!profileId) {
      return NextResponse.json(
        { success: false, error: 'profileId is required' },
        { status: 400 }
      );
    }

    // Verify user owns this profile (join with users to check clerkId)
    const [profile] = await db
      .select({
        id: creatorProfiles.id,
        clerkId: users.clerkId,
      })
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

    // Check for pending/processing discovery jobs
    const pendingJobs = await db
      .select({ id: ingestionJobs.id })
      .from(ingestionJobs)
      .where(
        and(
          eq(ingestionJobs.jobType, 'dsp_artist_discovery'),
          or(
            eq(ingestionJobs.status, 'pending'),
            eq(ingestionJobs.status, 'processing')
          )
        )
      )
      .limit(1);

    const hasPendingDiscoveryJob = pendingJobs.length > 0;

    // Fetch all matches for this profile
    const matches = await db
      .select({
        providerId: dspArtistMatches.providerId,
        status: dspArtistMatches.status,
        matchingIsrcCount: dspArtistMatches.matchingIsrcCount,
        totalTracksChecked: dspArtistMatches.totalTracksChecked,
        updatedAt: dspArtistMatches.updatedAt,
      })
      .from(dspArtistMatches)
      .where(eq(dspArtistMatches.creatorProfileId, profileId));

    // Build provider statuses from matches
    const providerStatuses: ProviderEnrichmentStatus[] = matches.map(match => {
      // Determine phase based on match status
      let phase: EnrichmentPhase;
      let progress: number;

      switch (match.status) {
        case 'suggested':
          phase = 'matching'; // Awaiting user confirmation
          progress = 50;
          break;
        case 'confirmed':
        case 'auto_confirmed':
        case 'rejected':
          phase = 'complete'; // Confirmed, auto-confirmed, or rejected = complete
          progress = 100;
          break;
        default:
          phase = 'idle';
          progress = 0;
      }

      return {
        providerId: match.providerId as ProviderEnrichmentStatus['providerId'],
        phase,
        progress,
        tracksEnriched: match.matchingIsrcCount ?? 0,
        totalTracks: match.totalTracksChecked ?? 0,
        lastError: null,
        lastUpdatedAt:
          match.updatedAt?.toISOString() ?? new Date().toISOString(),
      };
    });

    // Calculate overall status
    const overallPhase = determineOverallPhase(
      providerStatuses,
      hasPendingDiscoveryJob
    );
    const overallProgress = hasPendingDiscoveryJob
      ? 25
      : calculateOverallProgress(providerStatuses);

    return NextResponse.json({
      success: true,
      status: {
        profileId,
        overallPhase,
        overallProgress,
        providers: providerStatuses,
        discoveryStartedAt: null, // TODO: Track from job
        discoveryCompletedAt: null,
        enrichmentStartedAt: null,
        enrichmentCompletedAt: null,
      },
    });
  } catch (error) {
    console.error('[DSP Enrichment Status] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
