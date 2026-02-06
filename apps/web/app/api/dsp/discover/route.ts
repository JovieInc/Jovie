/**
 * POST /api/dsp/discover
 *
 * Triggers DSP artist discovery for a creator profile.
 * Discovers matching profiles on other platforms (Apple Music, Deezer, etc.)
 * using ISRC-based matching with confidence scoring.
 *
 * Authentication: Required (creator must own the profile)
 */

import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { enqueueDspArtistDiscoveryJob } from '@/lib/ingestion/jobs';
import {
  checkDspDiscoveryRateLimit,
  createRateLimitHeaders,
} from '@/lib/rate-limit';

// ============================================================================
// Request Schema
// ============================================================================

const discoverRequestSchema = z.object({
  profileId: z.string().uuid(),
  spotifyArtistId: z.string().min(1),
  targetProviders: z
    .array(z.enum(['apple_music', 'deezer', 'musicbrainz']))
    .optional(),
});

// ============================================================================
// Route Handler
// ============================================================================

export async function POST(request: Request) {
  try {
    // Authenticate user
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limiting - protects 3rd-party platform APIs
    const rateLimitResult = await checkDspDiscoveryRateLimit(userId);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Rate limit exceeded',
          message: rateLimitResult.reason,
          retryAfter: Math.ceil(
            (rateLimitResult.reset.getTime() - Date.now()) / 1000
          ),
        },
        {
          status: 429,
          headers: createRateLimitHeaders(rateLimitResult),
        }
      );
    }

    // Parse request body
    const body = await request.json();
    const parsed = discoverRequestSchema.safeParse(body);

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

    const { profileId, spotifyArtistId, targetProviders } = parsed.data;

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

    // Enqueue discovery job
    const jobId = await enqueueDspArtistDiscoveryJob({
      creatorProfileId: profileId,
      spotifyArtistId,
      targetProviders: targetProviders ?? ['apple_music'],
    });

    if (!jobId) {
      return NextResponse.json(
        { success: false, error: 'Failed to enqueue discovery job' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      jobId,
      targetProviders: targetProviders ?? ['apple_music'],
      message: 'Discovery job enqueued successfully',
    });
  } catch (error) {
    await captureError('DSP Discovery failed', error, {
      route: '/api/dsp/discover',
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
