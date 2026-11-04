/**
 * POST /api/suggestions/social-links/[id]/approve
 *
 * Approves a social link suggestion, adding it as an active social link
 * on the creator profile.
 *
 * Body: { profileId: string }
 *
 * Authentication: Required (creator must own the profile)
 */

import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCachedAuth } from '@/lib/auth/cached';
import { invalidateSocialLinksCache } from '@/lib/cache';

import { db } from '@/lib/db';
import { socialLinkSuggestions } from '@/lib/db/schema/dsp-enrichment';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { syncPrimaryMusicUrlsFromSocialLinks } from '@/lib/db/social-links-sync';
import { captureError } from '@/lib/error-tracking';
import { detectPlatform } from '@/lib/utils/platform-detection/detector';

const requestSchema = z.object({
  profileId: z.string().uuid(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: suggestionId } = await params;

    const { userId } = await getCachedAuth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
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

    // Verify ownership
    const [profile] = await db
      .select({
        id: creatorProfiles.id,
        userId: creatorProfiles.userId,
        usernameNormalized: creatorProfiles.usernameNormalized,
      })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, profileId))
      .limit(1);

    if (!profile || profile.userId !== userId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Fetch the suggestion
    const [suggestion] = await db
      .select()
      .from(socialLinkSuggestions)
      .where(eq(socialLinkSuggestions.id, suggestionId))
      .limit(1);

    if (!suggestion) {
      return NextResponse.json(
        { success: false, error: 'Suggestion not found' },
        { status: 404 }
      );
    }

    if (suggestion.creatorProfileId !== profileId) {
      return NextResponse.json(
        { success: false, error: 'Suggestion does not belong to this profile' },
        { status: 403 }
      );
    }

    if (suggestion.status !== 'pending') {
      return NextResponse.json(
        { success: false, error: 'Suggestion has already been processed' },
        { status: 400 }
      );
    }

    const now = new Date();

    // Same normalization as the dashboard and chat paths: canonical URL and
    // platform type come from platform detection, not a local table.
    const detected = detectPlatform(suggestion.url);
    const platform = detected.isValid
      ? detected.platform.id
      : suggestion.platform;
    const platformType = detected.isValid
      ? detected.platform.category
      : 'other';
    const url = detected.isValid ? detected.normalizedUrl : suggestion.url;

    await db.insert(socialLinks).values({
      creatorProfileId: profileId,
      platform,
      platformType,
      url,
      displayText: suggestion.username ?? undefined,
      state: 'active',
      confidence: suggestion.confidenceScore,
      sourcePlatform: suggestion.sourceProvider,
      sourceType: 'ingested',
      createdAt: now,
      updatedAt: now,
    });

    await db
      .update(socialLinkSuggestions)
      .set({
        status: 'accepted',
        respondedAt: now,
        updatedAt: now,
      })
      .where(eq(socialLinkSuggestions.id, suggestionId));

    // The dashboard contract: keep the profile's primary music URLs in step and
    // refresh the public profile and dashboard caches.
    await syncPrimaryMusicUrlsFromSocialLinks(db, profileId);
    await invalidateSocialLinksCache(profileId, profile.usernameNormalized);

    return NextResponse.json({
      success: true,
      suggestionId,
      message: 'Social link added successfully',
    });
  } catch (error) {
    await captureError('Social link suggestion approval failed', error, {
      route: '/api/suggestions/social-links/[id]/approve',
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
