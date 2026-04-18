import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { extractHandleFromSocialUrl } from '@/lib/ingestion/flows/handle-extraction';
import { findAvailableHandle } from '@/lib/ingestion/flows/profile-operations';
import {
  createNewSocialProfile,
  handleExistingUnclaimedProfile,
  type SocialPlatformContext,
} from '@/lib/ingestion/flows/social-platform-flow';
import { fetchSpotifyArtistData } from '@/lib/ingestion/flows/spotify-integration';
import { enqueueMusicFetchEnrichmentJob } from '@/lib/ingestion/jobs';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import {
  isValidHandle,
  normalizeHandle,
} from '@/lib/ingestion/strategies/linktree';
import { detectPlatform } from '@/lib/utils/platform-detection';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

function validateSocialHandle(
  inputUrl: string,
  detectedPlatformName: string
):
  | { ok: true; handle: string; normalizedHandle: string }
  | { ok: false; response: NextResponse } {
  const handle = extractHandleFromSocialUrl(inputUrl);

  if (!handle) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Unable to extract username from URL',
          details: `Could not parse a valid username from the ${detectedPlatformName} URL. Please ensure the URL points to a valid profile.`,
        },
        { status: 422, headers: NO_STORE_HEADERS }
      ),
    };
  }

  const normalizedHandle = normalizeHandle(handle);
  if (!isValidHandle(normalizedHandle)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Invalid username format',
          details:
            'Username must be 1-30 characters, alphanumeric and underscores only',
        },
        { status: 422, headers: NO_STORE_HEADERS }
      ),
    };
  }

  return { ok: true, handle, normalizedHandle };
}

export async function ingestSocialPlatformUrl(
  inputUrl: string
): Promise<NextResponse> {
  const detected = detectPlatform(inputUrl);
  const handleResult = validateSocialHandle(inputUrl, detected.platform.name);
  if (!handleResult.ok) {
    return handleResult.response;
  }

  const { handle, normalizedHandle } = handleResult;
  const platformId = detected.platform.id;
  const spotifyData = await fetchSpotifyArtistData(handle, platformId);

  let effectiveHandle = handle;
  let effectiveNormalizedHandle = normalizedHandle;
  if (spotifyData?.name) {
    const artistHandle = spotifyData.name
      .toLowerCase()
      .normalize('NFD')
      .replaceAll(/[\u0300-\u036f]/g, '')
      .replaceAll(/[^a-z0-9_]/g, '')
      .slice(0, 30);
    const normalized = normalizeHandle(artistHandle);
    if (isValidHandle(normalized)) {
      effectiveHandle = artistHandle;
      effectiveNormalizedHandle = normalized;
    }
  }

  const socialContext: SocialPlatformContext = {
    handle: effectiveHandle,
    normalizedHandle: effectiveNormalizedHandle,
    platformId,
    platformName: detected.platform.name,
    normalizedUrl: detected.normalizedUrl,
    spotifyArtistName: spotifyData?.name ?? null,
    spotifyData,
  };

  const response = await withSystemIngestionSession(async tx => {
    const [existing] = await tx
      .select({
        id: creatorProfiles.id,
        isClaimed: creatorProfiles.isClaimed,
        usernameNormalized: creatorProfiles.usernameNormalized,
      })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.usernameNormalized, effectiveNormalizedHandle))
      .limit(1);

    let finalHandle = effectiveNormalizedHandle;
    if (existing?.isClaimed) {
      const altHandle = await findAvailableHandle(
        tx,
        effectiveNormalizedHandle
      );
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
      return handleExistingUnclaimedProfile(tx, existing, socialContext);
    }

    return createNewSocialProfile(tx, finalHandle, socialContext);
  });

  // Enqueue MusicFetch enrichment to populate all DSPs (Apple Music, YouTube, etc.)
  if (response.ok && spotifyData?.spotifyUrl) {
    try {
      const body = await response.clone().json();
      if (body?.profile?.id) {
        void enqueueMusicFetchEnrichmentJob({
          creatorProfileId: body.profile.id,
          spotifyUrl: spotifyData.spotifyUrl,
        }).catch(err =>
          captureError(
            'MusicFetch enrichment enqueue failed for admin import',
            err,
            {
              profileId: body.profile.id,
            }
          )
        );
      }
    } catch {
      // Non-fatal: enrichment is best-effort
    }
  }

  return response;
}
