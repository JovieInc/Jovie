import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { creatorProfiles } from '@/lib/db/schema';
import { calculateAndStoreFitScore } from '@/lib/fit-scoring';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { IngestionStatusManager } from '@/lib/ingestion/status-manager';
import {
  extractLaylo,
  extractLayloHandle,
  fetchLayloProfile,
  normalizeLayloHandle,
  validateLayloUrl,
} from '@/lib/ingestion/strategies/laylo';
import {
  extractLinktree,
  extractLinktreeHandle,
  fetchLinktreeDocument,
  isValidHandle,
} from '@/lib/ingestion/strategies/linktree';
import { logger } from '@/lib/utils/logger';
import type { detectPlatform } from '@/lib/utils/platform-detection';
import {
  type AvatarExtractionInput,
  handleAvatarFetching,
} from './ingest-avatars';
import { NO_STORE_HEADERS } from './ingest-constants';
import {
  addSocialLinkIdempotent,
  extractHandleFromSocialUrl,
  findAvailableHandle,
  generateClaimToken,
  getLinkDisplayText,
  normalizeIngestionHandle,
  processProfileExtraction,
} from './ingest-utils';

type DetectedPlatform = ReturnType<typeof detectPlatform>;

type ExistingProfile = {
  id: string;
  isClaimed: boolean | null;
  usernameNormalized: string;
  avatarUrl: string | null;
  displayName: string | null;
  avatarLockedByUser: boolean | null;
  displayNameLocked: boolean | null;
  claimToken: string | null;
  claimTokenExpiresAt: Date | null;
};

type ExistingProfileCheck = {
  existing?: ExistingProfile;
  isReingest: boolean;
  finalHandle: string | null;
};

type ExtractionResult =
  | ReturnType<typeof extractLinktree>
  | ReturnType<typeof extractLaylo>;

async function getExistingProfileForHandle(
  usernameNormalized: string
): Promise<ExistingProfileCheck> {
  return withSystemIngestionSession(async tx => {
    const [existing] = await tx
      .select({
        id: creatorProfiles.id,
        isClaimed: creatorProfiles.isClaimed,
        usernameNormalized: creatorProfiles.usernameNormalized,
        avatarUrl: creatorProfiles.avatarUrl,
        displayName: creatorProfiles.displayName,
        avatarLockedByUser: creatorProfiles.avatarLockedByUser,
        displayNameLocked: creatorProfiles.displayNameLocked,
        claimToken: creatorProfiles.claimToken,
        claimTokenExpiresAt: creatorProfiles.claimTokenExpiresAt,
      })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.usernameNormalized, usernameNormalized))
      .limit(1);

    const isClaimed = existing?.isClaimed ?? false;
    const isReingest = Boolean(existing) && !isClaimed;

    const finalHandle = existing
      ? isClaimed
        ? await findAvailableHandle(tx, usernameNormalized)
        : existing.usernameNormalized
      : usernameNormalized;

    // Mark as processing if re-ingesting
    if (isReingest && existing) {
      await IngestionStatusManager.markProcessing(tx, existing.id);
    }

    return { existing, isReingest, finalHandle };
  });
}

async function updateExistingProfileFromExtraction(
  existing: ExistingProfile,
  extraction: ExtractionResult,
  displayName: string
): Promise<NextResponse> {
  return withSystemIngestionSession(async tx => {
    const { mergeError } = await processProfileExtraction(
      tx,
      {
        id: existing.id,
        usernameNormalized: existing.usernameNormalized,
        avatarUrl: existing.avatarUrl ?? null,
        displayName: existing.displayName,
        avatarLockedByUser: existing.avatarLockedByUser ?? false,
        displayNameLocked: existing.displayNameLocked ?? false,
      },
      extraction,
      displayName
    );

    return NextResponse.json(
      {
        ok: !mergeError,
        profile: {
          id: existing.id,
          username: existing.usernameNormalized,
          usernameNormalized: existing.usernameNormalized,
          claimToken: existing.claimToken,
        },
        links: extraction.links.length,
        warning: mergeError
          ? `Profile updated but link extraction had issues: ${mergeError}`
          : undefined,
      },
      {
        status: mergeError ? 207 : 200,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  });
}

async function createProfileFromExtraction(
  finalHandle: string,
  displayName: string,
  hostedAvatarUrl: string | null,
  extraction: ExtractionResult
): Promise<NextResponse> {
  return withSystemIngestionSession(async tx => {
    const { claimToken, claimTokenExpiresAt } = generateClaimToken();

    const [created] = await tx
      .insert(creatorProfiles)
      .values({
        creatorType: 'creator',
        username: finalHandle,
        usernameNormalized: finalHandle,
        displayName,
        avatarUrl: hostedAvatarUrl,
        isPublic: true,
        isVerified: false,
        isFeatured: false,
        marketingOptOut: false,
        isClaimed: false,
        claimToken,
        claimTokenExpiresAt,
        settings: {},
        theme: {},
        ingestionStatus: 'processing',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({
        id: creatorProfiles.id,
        username: creatorProfiles.username,
        usernameNormalized: creatorProfiles.usernameNormalized,
        displayName: creatorProfiles.displayName,
        avatarUrl: creatorProfiles.avatarUrl,
        claimToken: creatorProfiles.claimToken,
        isClaimed: creatorProfiles.isClaimed,
        claimTokenExpiresAt: creatorProfiles.claimTokenExpiresAt,
        avatarLockedByUser: creatorProfiles.avatarLockedByUser,
        displayNameLocked: creatorProfiles.displayNameLocked,
      });

    if (!created) {
      return NextResponse.json(
        { error: 'Failed to create creator profile' },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    const { mergeError } = await processProfileExtraction(
      tx,
      {
        id: created.id,
        usernameNormalized: created.usernameNormalized,
        avatarUrl: created.avatarUrl ?? null,
        displayName: created.displayName,
        avatarLockedByUser: created.avatarLockedByUser ?? false,
        displayNameLocked: created.displayNameLocked ?? false,
      },
      extraction,
      displayName
    );

    logger.info('Creator profile ingested', {
      profileId: created.id,
      handle: created.username,
      linksExtracted: extraction.links.length,
      hadError: !!mergeError,
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
        links: extraction.links.length,
        warning: mergeError
          ? `Profile created but link extraction had issues: ${mergeError}`
          : undefined,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  });
}

async function markReingestFailed(
  existing: ExistingProfile | undefined,
  errorMessage: string
): Promise<void> {
  if (!existing) return;

  await withSystemIngestionSession(async tx => {
    await IngestionStatusManager.markIdleOrFailed(
      tx,
      existing.id,
      errorMessage
    );
  });
}

export async function handleFullExtractionPlatforms(
  inputUrl: string,
  isLayloProfile: boolean,
  linktreeValidatedUrl: string | null
): Promise<NextResponse> {
  const validatedUrl = isLayloProfile
    ? validateLayloUrl(inputUrl)
    : linktreeValidatedUrl;

  if (!validatedUrl) {
    return NextResponse.json(
      {
        error: 'Invalid profile URL',
        details: isLayloProfile
          ? 'URL must be a valid HTTPS Laylo profile (e.g., https://laylo.com/username)'
          : 'URL must be a valid HTTPS Linktree profile (e.g., https://linktr.ee/username)',
      },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const rawHandle = isLayloProfile
    ? extractLayloHandle(validatedUrl)
    : extractLinktreeHandle(validatedUrl);

  if (!rawHandle) {
    return NextResponse.json(
      { error: 'Unable to parse profile handle from URL.' },
      { status: 422, headers: NO_STORE_HEADERS }
    );
  }

  const handle = isLayloProfile
    ? normalizeLayloHandle(rawHandle)
    : normalizeIngestionHandle(rawHandle);

  if (!isValidHandle(handle)) {
    return NextResponse.json(
      {
        error: 'Invalid handle format',
        details:
          'Handle must be 1-30 characters, alphanumeric and underscores only',
      },
      { status: 422, headers: NO_STORE_HEADERS }
    );
  }

  const existingCheck = await getExistingProfileForHandle(handle);

  if (!existingCheck.finalHandle) {
    return NextResponse.json(
      {
        error: 'Unable to allocate unique username',
        details: 'All fallback username attempts exhausted.',
      },
      { status: 409, headers: NO_STORE_HEADERS }
    );
  }

  if (existingCheck.existing && existingCheck.existing.isClaimed) {
    return NextResponse.json(
      {
        error: 'Profile already claimed',
        details: 'Cannot overwrite a claimed profile.',
      },
      { status: 409, headers: NO_STORE_HEADERS }
    );
  }

  let extraction: ExtractionResult;
  try {
    if (isLayloProfile) {
      const { profile: layloProfile, user } = await fetchLayloProfile(handle);
      extraction = extractLaylo(layloProfile, user);
    } else {
      const html = await fetchLinktreeDocument(validatedUrl);
      extraction = extractLinktree(html);
    }
  } catch (fetchError) {
    const errorMessage =
      fetchError instanceof Error
        ? fetchError.message
        : 'Failed to fetch profile';

    logger.error('Profile fetch failed', {
      url: validatedUrl,
      error: errorMessage,
      platform: isLayloProfile ? 'laylo' : 'linktree',
    });

    if (existingCheck.isReingest) {
      await markReingestFailed(existingCheck.existing, errorMessage);
    }

    return NextResponse.json(
      { error: 'Failed to fetch profile', details: errorMessage },
      { status: 502, headers: NO_STORE_HEADERS }
    );
  }

  const displayName = extraction.displayName?.trim() || handle;

  const { hostedAvatarUrl, extractionWithHostedAvatar } =
    await handleAvatarFetching(extraction as AvatarExtractionInput, handle);

  if (existingCheck.isReingest && existingCheck.existing) {
    return updateExistingProfileFromExtraction(
      existingCheck.existing,
      extractionWithHostedAvatar as ExtractionResult,
      displayName
    );
  }

  return createProfileFromExtraction(
    existingCheck.finalHandle,
    displayName,
    hostedAvatarUrl,
    extractionWithHostedAvatar as ExtractionResult
  );
}

type SocialIngestionParams = {
  inputUrl: string;
  detected: DetectedPlatform;
  normalizedUrl: string;
  platformId: string;
};

export async function handleSocialPlatformIngestion({
  inputUrl,
  detected,
  normalizedUrl,
  platformId,
}: SocialIngestionParams): Promise<NextResponse> {
  const handle = extractHandleFromSocialUrl(inputUrl);

  if (!handle) {
    return NextResponse.json(
      {
        error: 'Unable to extract username from URL',
        details: `Could not parse a valid username from the ${detected.platform.name} URL. Please ensure the URL points to a valid profile.`,
      },
      { status: 422, headers: NO_STORE_HEADERS }
    );
  }

  const normalizedHandle = normalizeIngestionHandle(handle);
  if (!isValidHandle(normalizedHandle)) {
    return NextResponse.json(
      {
        error: 'Invalid username format',
        details:
          'Username must be 1-30 characters, alphanumeric and underscores only',
      },
      { status: 422, headers: NO_STORE_HEADERS }
    );
  }

  let spotifyArtistName: string | null = null;
  const isSpotifyArtist =
    handle.startsWith('artist-') && platformId === 'spotify';
  if (isSpotifyArtist) {
    try {
      const { getSpotifyArtist } = await import('@/lib/spotify');
      const artistId = handle.replace('artist-', '');
      const artist = await getSpotifyArtist(artistId);
      if (artist?.name) {
        spotifyArtistName = artist.name;
        logger.info('Fetched Spotify artist name', {
          artistId,
          name: artist.name,
        });
      }
    } catch (error) {
      logger.warn('Failed to fetch Spotify artist name', {
        handle,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return withSystemIngestionSession(async tx => {
    const [existing] = await tx
      .select({
        id: creatorProfiles.id,
        isClaimed: creatorProfiles.isClaimed,
        usernameNormalized: creatorProfiles.usernameNormalized,
      })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.usernameNormalized, normalizedHandle))
      .limit(1);

    let finalHandle = normalizedHandle;
    if (existing?.isClaimed) {
      const altHandle = await findAvailableHandle(tx, normalizedHandle);
      if (!altHandle) {
        return NextResponse.json(
          {
            error: 'Unable to allocate unique username',
            details: 'All fallback username attempts exhausted.',
          },
          { status: 409, headers: NO_STORE_HEADERS }
        );
      }
      finalHandle = altHandle;
    } else if (existing && !existing.isClaimed) {
      const linkDisplayText = getLinkDisplayText(
        platformId,
        detected.platform.name,
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
          { status: 200, headers: { 'Cache-Control': 'no-store' } }
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
          { status: 200, headers: { 'Cache-Control': 'no-store' } }
        );
      }
    }

    const { claimToken, claimTokenExpiresAt } = generateClaimToken();
    const displayName =
      spotifyArtistName || (isSpotifyArtist ? detected.platform.name : handle);

    const [created] = await tx
      .insert(creatorProfiles)
      .values({
        creatorType: 'creator',
        username: finalHandle,
        usernameNormalized: finalHandle,
        displayName: displayName,
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

    const linkDisplayText = getLinkDisplayText(
      platformId,
      detected.platform.name,
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
        platform: detected.platform.name,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  });
}
