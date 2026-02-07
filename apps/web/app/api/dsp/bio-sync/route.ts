/**
 * POST /api/dsp/bio-sync
 *
 * Triggers bio sync to one or more DSPs for a creator profile.
 * For DSPs that support API updates, pushes directly.
 * For DSPs that only support email, sends a professional bio update
 * request email to the DSP's artist support team on behalf of the artist.
 *
 * Authentication: Required (creator must own the profile)
 *
 * GET /api/dsp/bio-sync
 *
 * Returns the list of supported DSP bio sync providers with their
 * capabilities (API vs email, enabled status, etc.).
 */

import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import {
  DSP_BIO_PROVIDERS,
  getEnabledBioProviders,
} from '@/lib/dsp-bio-sync/providers';
import { syncBioToDsps } from '@/lib/dsp-bio-sync/service';
import { captureError } from '@/lib/error-tracking';

// ============================================================================
// Request Schema
// ============================================================================

const bioSyncRequestSchema = z.object({
  profileId: z.string().uuid(),
  /** Optional: specific DSP IDs to sync to. If omitted, syncs to all enabled DSPs. */
  providerIds: z.array(z.string().min(1)).optional(),
  /** Optional: override bio text. If omitted, uses the current bio from the profile. */
  bioText: z
    .string()
    .min(1, 'Bio text cannot be empty')
    .max(5000, 'Bio text is too long (max 5000 characters)')
    .optional(),
});

// ============================================================================
// POST Handler - Trigger bio sync
// ============================================================================

export async function POST(request: Request) {
  try {
    // Authenticate user
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const parsed = bioSyncRequestSchema.safeParse(body);

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

    const { profileId, providerIds, bioText } = parsed.data;

    // Verify user owns this profile
    const [profile] = await db
      .select({
        id: creatorProfiles.id,
        clerkId: users.clerkId,
        bio: creatorProfiles.bio,
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
          error: 'You do not have permission to modify this profile',
        },
        { status: 403 }
      );
    }

    // Ensure there's a bio to sync
    const effectiveBio = bioText ?? profile.bio;
    if (!effectiveBio?.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: 'No bio text to sync. Please set a bio on your profile first.',
        },
        { status: 400 }
      );
    }

    // Execute bio sync
    const result = await syncBioToDsps({
      creatorProfileId: profileId,
      providerIds,
      bioText,
    });

    return NextResponse.json({
      success: result.success,
      sentCount: result.sentCount,
      failedCount: result.failedCount,
      results: result.results.map(r => ({
        providerId: r.providerId,
        method: r.method,
        status: r.status,
        syncRequestId: r.syncRequestId,
        error: r.error,
      })),
    });
  } catch (error) {
    await captureError('DSP Bio Sync failed', error, {
      route: '/api/dsp/bio-sync',
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

// ============================================================================
// GET Handler - List supported providers
// ============================================================================

export async function GET() {
  try {
    const providers = Object.entries(DSP_BIO_PROVIDERS).map(
      ([id, provider]) => ({
        id,
        displayName: provider.displayName,
        method: provider.method,
        enabled: provider.enabled,
        notes: provider.notes,
        artistPortalUrl: provider.artistPortalUrl,
        maxBioLength: provider.maxBioLength,
      })
    );

    const enabledCount = getEnabledBioProviders().length;

    return NextResponse.json({
      success: true,
      providers,
      enabledCount,
    });
  } catch (error) {
    await captureError('DSP Bio Sync providers list failed', error, {
      route: '/api/dsp/bio-sync',
    });

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
