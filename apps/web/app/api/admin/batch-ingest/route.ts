import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { importReleasesFromSpotify } from '@/lib/discography/spotify-import';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError, getSafeErrorMessage } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import { findAvailableHandle } from '@/lib/ingestion/flows/profile-operations';
import {
  createNewSocialProfile,
  handleExistingUnclaimedProfile,
  type SocialPlatformContext,
} from '@/lib/ingestion/flows/social-platform-flow';
import {
  enqueueDspArtistDiscoveryJob,
  enqueueMusicFetchEnrichmentJob,
} from '@/lib/ingestion/jobs';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { extractSpotifyArtistId } from '@/lib/spotify/artist-id';
import { spotifyClient } from '@/lib/spotify/client';
import { logger } from '@/lib/utils/logger';
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

  const fallbackHandle = `artist_${spotifyArtistId.toLowerCase().slice(0, 10)}`;
  const normalizedUrl = `https://open.spotify.com/artist/${spotifyArtistId}`;

  const socialContext: SocialPlatformContext = {
    handle: fallbackHandle,
    normalizedHandle: fallbackHandle,
    normalizedUrl,
    platformId: 'spotify',
    platformName: 'Spotify',
    spotifyArtistName: artist.name,
    spotifyData: {
      name: artist.name,
      spotifyId: artist.spotifyId,
      imageUrl: artist.imageUrl,
      genres: artist.genres,
      followerCount: artist.followerCount,
      popularity: artist.popularity,
      spotifyUrl: artist.externalUrls?.spotify ?? null,
      bio: artist.bio,
    },
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

    if (existing) {
      // Profile exists and is already claimed — nothing to ingest
      return NextResponse.json(
        {
          profile: {
            id: existing.id,
            username: existing.usernameNormalized,
          },
          skipped: true,
          note: 'Artist profile already claimed.',
        },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    }

    const finalHandle = await findAvailableHandle(tx, fallbackHandle);
    if (!finalHandle) {
      return NextResponse.json(
        {
          error: 'Unable to allocate unique username',
          details: 'All fallback username attempts exhausted.',
        },
        { status: 409, headers: NO_STORE_HEADERS }
      );
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
    skipped?: boolean;
    note?: string;
  };

  if (ingestResponse.status >= 200 && ingestResponse.status < 300) {
    if (payload.skipped) {
      return {
        input: normalizedUrl,
        status: 'skipped',
        spotifyArtistId,
        followers,
        reason: payload.note ?? 'Artist profile already exists.',
      };
    }

    // Fire-and-forget: import releases from Spotify and trigger Apple Music
    // auto-connect via DSP artist discovery + MusicFetch enrichment.
    const profileId = payload.profile?.id;
    if (profileId) {
      void importReleasesAndDiscoverDsps(
        profileId,
        spotifyArtistId,
        normalizedUrl
      );
    }

    return {
      input: normalizedUrl,
      status: 'success',
      spotifyArtistId,
      followers,
      profileId,
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

/**
 * Import releases from Spotify and enqueue DSP discovery jobs.
 * Fire-and-forget — errors are captured but do not fail the ingest.
 */
async function importReleasesAndDiscoverDsps(
  profileId: string,
  spotifyArtistId: string,
  spotifyUrl: string
): Promise<void> {
  try {
    const result = await importReleasesFromSpotify(profileId, spotifyArtistId);

    if (result.success && result.imported > 0) {
      logger.info('Batch ingest: imported releases from Spotify', {
        profileId,
        spotifyArtistId,
        imported: result.imported,
      });

      // Enqueue Apple Music artist discovery (uses ISRC matching)
      void enqueueDspArtistDiscoveryJob({
        creatorProfileId: profileId,
        spotifyArtistId,
        targetProviders: ['apple_music'],
      }).catch(err => {
        void captureError(
          'Batch ingest: DSP artist discovery enqueue failed',
          err,
          { profileId, spotifyArtistId }
        );
      });

      // Enqueue MusicFetch enrichment for broader DSP discovery
      void enqueueMusicFetchEnrichmentJob({
        creatorProfileId: profileId,
        spotifyUrl,
      }).catch(err => {
        void captureError(
          'Batch ingest: MusicFetch enrichment enqueue failed',
          err,
          { profileId, spotifyArtistId }
        );
      });
    }
  } catch (error) {
    void captureError('Batch ingest: release import failed', error, {
      profileId,
      spotifyArtistId,
    });
  }
}

async function resolveAdminEntitlements(
  _route: string
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  // getCurrentUserEntitlements degrades gracefully on billing failure.
  // Admin status is fetched independently and preserved even when billing is down.
  const entitlements = await getCurrentUserEntitlements();

  if (!entitlements.isAuthenticated) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      ),
    };
  }

  if (!entitlements.isAdmin) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: NO_STORE_HEADERS }
      ),
    };
  }

  return { ok: true };
}

async function processSpotifyEntry(entry: string): Promise<BatchIngestResult> {
  const spotifyArtistId = extractSpotifyArtistId(entry);
  if (!spotifyArtistId) {
    return {
      input: entry,
      status: 'error',
      reason: 'Invalid Spotify artist URL or artist ID.',
    };
  }

  try {
    return await ingestSpotifyArtist(spotifyArtistId);
  } catch (error) {
    await captureError('Batch ingest: artist ingestion failed', error, {
      route: '/api/admin/batch-ingest',
      spotifyArtistId,
      input: entry,
    });
    return {
      input: entry,
      status: 'error',
      spotifyArtistId,
      reason: getSafeErrorMessage(error, 'Failed to ingest artist profile.'),
    };
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await resolveAdminEntitlements(
      '/api/admin/batch-ingest'
    );
    if (!authResult.ok) return authResult.response;

    const parsedBody = await parseJsonBody<unknown>(request, {
      route: 'POST /api/admin/batch-ingest',
      headers: NO_STORE_HEADERS,
    });
    if (!parsedBody.ok) return parsedBody.response;

    const parsed = batchCreatorIngestSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const results: BatchIngestResult[] = [];
    // Process in smaller concurrent chunks to avoid N+1 sequential overhead
    // but prevent thundering herd database exhaustion
    const CONCURRENCY = 5;
    for (let i = 0; i < parsed.data.spotifyUrls.length; i += CONCURRENCY) {
      const batch = parsed.data.spotifyUrls.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(batch.map(processSpotifyEntry));
      results.push(...batchResults);
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
    await captureError('Batch ingest: request processing failed', error, {
      route: '/api/admin/batch-ingest',
    });
    return NextResponse.json(
      {
        error: 'Failed to process batch ingest',
        details: getSafeErrorMessage(error, 'An unexpected error occurred.'),
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
