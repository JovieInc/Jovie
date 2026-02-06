/**
 * Social Platform Flow
 *
 * Handles ingestion for social platform URLs (Instagram, TikTok, YouTube, etc.)
 * that create minimal profiles with a single link.
 *
 * Extracted to reduce cognitive complexity of the creator-ingest route.
 */

import { randomUUID } from 'node:crypto';
import { and, eq, max } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import type { DbOrTransaction } from '@/lib/db';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { calculateAndStoreFitScore } from '@/lib/fit-scoring';
import { logger } from '@/lib/utils/logger';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;
const CLAIM_TOKEN_EXPIRY_DAYS = 30;

// Music platforms that should have empty link display text by default
const MUSIC_PLATFORMS = [
  'spotify',
  'apple_music',
  'soundcloud',
  'tidal',
] as const;

/**
 * Existing profile data for social platform handling
 */
export interface ExistingProfileData {
  id: string;
  isClaimed: boolean | null;
  usernameNormalized: string;
}

/**
 * Context for social platform ingestion
 */
export interface SocialPlatformContext {
  handle: string;
  normalizedHandle: string;
  platformId: string;
  platformName: string;
  normalizedUrl: string;
  spotifyArtistName: string | null;
}

/**
 * Generate a claim token with expiration date
 */
export function generateClaimToken(): {
  claimToken: string;
  claimTokenExpiresAt: Date;
} {
  const claimToken = randomUUID();
  const claimTokenExpiresAt = new Date();
  claimTokenExpiresAt.setDate(
    claimTokenExpiresAt.getDate() + CLAIM_TOKEN_EXPIRY_DAYS
  );
  return { claimToken, claimTokenExpiresAt };
}

/**
 * Determine the display text for a social link based on platform type
 */
export function getLinkDisplayText(
  platformId: string,
  platformName: string,
  customName?: string | null
): string {
  if (customName) return customName;
  const isMusicPlatform = MUSIC_PLATFORMS.includes(
    platformId as (typeof MUSIC_PLATFORMS)[number]
  );
  return isMusicPlatform ? '' : platformName;
}

/**
 * Idempotently add a social link to a creator profile
 */
async function addSocialLinkIdempotent(
  tx: DbOrTransaction,
  creatorProfileId: string,
  platform: string,
  url: string,
  title: string
): Promise<boolean> {
  const [existingLink] = await tx
    .select({ id: socialLinks.id })
    .from(socialLinks)
    .where(
      and(
        eq(socialLinks.creatorProfileId, creatorProfileId),
        eq(socialLinks.platform, platform),
        eq(socialLinks.url, url)
      )
    )
    .limit(1);

  if (existingLink) return false;

  const [result] = await tx
    .select({ maxOrder: max(socialLinks.sortOrder) })
    .from(socialLinks)
    .where(eq(socialLinks.creatorProfileId, creatorProfileId));

  const nextSortOrder = (result?.maxOrder ?? -1) + 1;

  await tx.insert(socialLinks).values({
    creatorProfileId,
    platform,
    platformType: platform,
    url,
    displayText: title,
    sortOrder: nextSortOrder,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return true;
}

/**
 * Handle adding a link to an existing unclaimed profile
 */
export async function handleExistingUnclaimedProfile(
  tx: DbOrTransaction,
  existing: ExistingProfileData,
  context: SocialPlatformContext
): Promise<NextResponse> {
  const { platformId, platformName, normalizedUrl, spotifyArtistName } =
    context;

  const linkDisplayText = getLinkDisplayText(
    platformId,
    platformName,
    spotifyArtistName
  );

  try {
    const linkAdded = await addSocialLinkIdempotent(
      tx,
      existing.id,
      platformId,
      normalizedUrl,
      linkDisplayText
    );

    if (linkAdded) {
      logger.info('Added link to existing unclaimed profile', {
        profileId: existing.id,
        platform: platformId,
        url: normalizedUrl,
      });
    } else {
      logger.info('Link already exists on unclaimed profile', {
        profileId: existing.id,
        platform: platformId,
        url: normalizedUrl,
      });
    }

    return NextResponse.json(
      {
        ok: true,
        profile: {
          id: existing.id,
          username: existing.usernameNormalized,
          usernameNormalized: existing.usernameNormalized,
        },
        links: linkAdded ? 1 : 0,
        note: linkAdded
          ? 'Added link to existing unclaimed profile'
          : 'Link already exists on profile',
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (linkError) {
    logger.warn('Failed to add link to existing profile', {
      profileId: existing.id,
      error: linkError,
    });

    return NextResponse.json(
      {
        ok: true,
        profile: {
          id: existing.id,
          username: existing.usernameNormalized,
          usernameNormalized: existing.usernameNormalized,
        },
        links: 0,
        warning: 'Profile exists but failed to add link',
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  }
}

/**
 * Create a new profile with the social link
 */
export async function createNewSocialProfile(
  tx: DbOrTransaction,
  finalHandle: string,
  context: SocialPlatformContext
): Promise<NextResponse> {
  const { handle, platformId, platformName, normalizedUrl, spotifyArtistName } =
    context;

  const { claimToken, claimTokenExpiresAt } = generateClaimToken();

  // For Spotify artist IDs, use the fetched artist name if available
  const displayName =
    spotifyArtistName ||
    (handle.startsWith('artist-') && platformId === 'spotify'
      ? platformName
      : handle);

  const [created] = await tx
    .insert(creatorProfiles)
    .values({
      creatorType: 'creator',
      username: finalHandle,
      usernameNormalized: finalHandle,
      displayName,
      avatarUrl: null,
      isPublic: true,
      isVerified: false,
      isFeatured: false,
      marketingOptOut: false,
      isClaimed: false,
      claimToken,
      claimTokenExpiresAt,
      settings: {},
      theme: {},
      ingestionStatus: 'idle',
      ingestionSourcePlatform: platformId,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({
      id: creatorProfiles.id,
      username: creatorProfiles.username,
      usernameNormalized: creatorProfiles.usernameNormalized,
      claimToken: creatorProfiles.claimToken,
    });

  if (!created) {
    return NextResponse.json(
      { error: 'Failed to create creator profile' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  // Add the social link
  const linkDisplayText = getLinkDisplayText(
    platformId,
    platformName,
    spotifyArtistName
  );

  try {
    await addSocialLinkIdempotent(
      tx,
      created.id,
      platformId,
      normalizedUrl,
      linkDisplayText
    );
  } catch (linkError) {
    logger.warn('Failed to add link to new profile', {
      profileId: created.id,
      error: linkError,
    });
  }

  // Calculate fit score
  try {
    await calculateAndStoreFitScore(tx, created.id);
  } catch (fitScoreError) {
    logger.warn('Fit score calculation failed', {
      profileId: created.id,
      error:
        fitScoreError instanceof Error
          ? fitScoreError.message
          : 'Unknown error',
    });
  }

  logger.info('Creator profile created from social URL', {
    profileId: created.id,
    handle: created.username,
    platform: platformId,
    sourceUrl: normalizedUrl,
  });

  return NextResponse.json(
    {
      ok: true,
      profile: {
        id: created.id,
        username: created.username,
        usernameNormalized: created.usernameNormalized,
        claimToken: created.claimToken,
      },
      links: 1,
      platform: platformName,
    },
    { status: 200, headers: NO_STORE_HEADERS }
  );
}
