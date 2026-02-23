import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { getEntitlements } from '@/lib/entitlements/registry';
import {
  BillingUnavailableError,
  getCurrentUserEntitlements,
} from '@/lib/entitlements/server';
import { captureError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import { findAvailableHandle } from '@/lib/ingestion/flows/profile-operations';
import {
  createNewSocialProfile,
  handleExistingUnclaimedProfile,
  type SocialPlatformContext,
} from '@/lib/ingestion/flows/social-platform-flow';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { extractSpotifyArtistId } from '@/lib/spotify/artist-id';
import { spotifyClient } from '@/lib/spotify/client';
import { batchCreatorIngestSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;
const MIN_SPOTIFY_FOLLOWERS = 1000;
const MAX_SPOTIFY_FOLLOWERS = 50000;

interface BatchIngestResult {
  input: string;
  status: 'success' | 'skipped' | 'error';
  reason?: string;
  profileId?: string;
  username?: string;
  spotifyArtistId?: string;
  followers?: number;
}

async function ingestSpotifyArtist(
  spotifyArtistId: string
): Promise<BatchIngestResult> {
  const artist = await spotifyClient.getArtist(spotifyArtistId);
  const followers = artist.followerCount;

  if (followers < MIN_SPOTIFY_FOLLOWERS || followers > MAX_SPOTIFY_FOLLOWERS) {
    return {
      input: `https://open.spotify.com/artist/${spotifyArtistId}`,
      status: 'skipped',
      spotifyArtistId,
      followers,
      reason: `Artist has ${followers.toLocaleString()} Spotify followers (target: 1,000-50,000).`,
    };
  }

  const fallbackHandle = `artist-${spotifyArtistId.toLowerCase().slice(0, 10)}`;
  const normalizedUrl = `https://open.spotify.com/artist/${spotifyArtistId}`;

  const socialContext: SocialPlatformContext = {
    handle: fallbackHandle,
    normalizedHandle: fallbackHandle,
    normalizedUrl,
    platformId: 'spotify',
    platformName: 'Spotify',
    spotifyArtistName: artist.name,
  };

  const ingestResponse = await withSystemIngestionSession(async tx => {
    const [existing] = await tx
      .select({
        id: creatorProfiles.id,
        isClaimed: creatorProfiles.isClaimed,
        usernameNormalized: creatorProfiles.usernameNormalized,
      })
      .from(creatorProfiles)
      .where(
        and(
          eq(creatorProfiles.spotifyId, spotifyArtistId),
          eq(creatorProfiles.ingestionSourcePlatform, 'spotify')
        )
      )
      .limit(1);

    if (existing && !existing.isClaimed) {
      return handleExistingUnclaimedProfile(tx, existing, socialContext);
    }

    let finalHandle = fallbackHandle;

    if (existing?.isClaimed) {
      const availableHandle = await findAvailableHandle(tx, fallbackHandle);
      if (!availableHandle) {
        return NextResponse.json(
          {
            error: 'Unable to allocate unique username',
            details: 'All fallback username attempts exhausted.',
          },
          { status: 409, headers: NO_STORE_HEADERS }
        );
      }
      finalHandle = availableHandle;
    }

    const response = await createNewSocialProfile(
      tx,
      finalHandle,
      socialContext
    );

    if (response.status >= 200 && response.status < 300) {
      await tx
        .update(creatorProfiles)
        .set({
          spotifyId: spotifyArtistId,
          spotifyFollowers: followers,
          spotifyPopularity: artist.popularity,
          genres: artist.genres,
          updatedAt: new Date(),
        })
        .where(eq(creatorProfiles.usernameNormalized, finalHandle));
    }

    return response;
  });

  const payload = (await ingestResponse.json()) as {
    profile?: { id?: string; username?: string; usernameNormalized?: string };
    error?: string;
    details?: string;
  };

  if (ingestResponse.status >= 200 && ingestResponse.status < 300) {
    return {
      input: normalizedUrl,
      status: 'success',
      spotifyArtistId,
      followers,
      profileId: payload.profile?.id,
      username:
        payload.profile?.username ?? payload.profile?.usernameNormalized,
    };
  }

  return {
    input: normalizedUrl,
    status: 'error',
    spotifyArtistId,
    followers,
    reason:
      payload.details ?? payload.error ?? 'Failed to ingest artist profile.',
  };
}

export async function POST(request: Request) {
  try {
    let entitlements: Awaited<ReturnType<typeof getCurrentUserEntitlements>>;
    try {
      entitlements = await getCurrentUserEntitlements();
    } catch (error) {
      if (error instanceof BillingUnavailableError && error.isAdmin) {
        await captureError(
          'Admin batch ingest proceeding despite billing unavailability',
          error,
          { route: '/api/admin/batch-ingest', userId: error.userId },
          'warning'
        );
        const freeEnt = getEntitlements('free');
        entitlements = {
          userId: error.userId,
          email: null,
          isAuthenticated: true,
          isAdmin: true,
          plan: 'free',
          isPro: false,
          hasAdvancedFeatures: false,
          ...freeEnt.booleans,
          ...freeEnt.limits,
        };
      } else {
        throw error;
      }
    }

    if (!entitlements.isAuthenticated) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    if (!entitlements.isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const parsedBody = await parseJsonBody<unknown>(request, {
      route: 'POST /api/admin/batch-ingest',
      headers: NO_STORE_HEADERS,
    });

    if (!parsedBody.ok) {
      return parsedBody.response;
    }

    const parsed = batchCreatorIngestSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const results: BatchIngestResult[] = [];

    for (const entry of parsed.data.spotifyUrls) {
      const spotifyArtistId = extractSpotifyArtistId(entry);
      if (!spotifyArtistId) {
        results.push({
          input: entry,
          status: 'error',
          reason: 'Invalid Spotify artist URL or artist ID.',
        });
        continue;
      }

      try {
        const result = await ingestSpotifyArtist(spotifyArtistId);
        results.push(result);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        results.push({
          input: entry,
          status: 'error',
          spotifyArtistId,
          reason: message,
        });
      }
    }

    return NextResponse.json(
      {
        results,
        summary: {
          total: results.length,
          success: results.filter(r => r.status === 'success').length,
          skipped: results.filter(r => r.status === 'skipped').length,
          error: results.filter(r => r.status === 'error').length,
        },
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to process batch ingest', details: message },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
