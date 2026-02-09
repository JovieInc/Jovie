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

import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { socialLinkSuggestions } from '@/lib/db/schema/dsp-enrichment';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';

const requestSchema = z.object({
  profileId: z.string().uuid(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: suggestionId } = await params;

    const { userId } = await auth();
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
      .select({ id: creatorProfiles.id, clerkId: users.clerkId })
      .from(creatorProfiles)
      .innerJoin(users, eq(users.id, creatorProfiles.userId))
      .where(eq(creatorProfiles.id, profileId))
      .limit(1);

    if (!profile || profile.clerkId !== userId) {
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

    // Add as active social link and update suggestion status (sequential ops, no transaction)
    const platformType = getPlatformType(suggestion.platform);

    await db.insert(socialLinks).values({
      creatorProfileId: profileId,
      platform: suggestion.platform,
      platformType,
      url: suggestion.url,
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

function getPlatformType(platform: string): string {
  const socialPlatforms = [
    'instagram',
    'twitter',
    'tiktok',
    'facebook',
    'twitch',
    'discord',
    'reddit',
    'snapchat',
  ];
  const musicPlatforms = [
    'spotify',
    'apple_music',
    'youtube_music',
    'soundcloud',
    'bandcamp',
    'tidal',
    'deezer',
    'amazon_music',
  ];

  if (socialPlatforms.includes(platform)) return 'social';
  if (musicPlatforms.includes(platform)) return 'listen';
  if (platform === 'youtube') return 'social';
  if (platform === 'website') return 'other';
  return 'other';
}
