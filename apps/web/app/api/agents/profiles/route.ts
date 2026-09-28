import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { BASE_URL } from '@/constants/app';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { getAppFlagValue } from '@/lib/flags/server';
import { NO_STORE_HEADERS, RETRY_AFTER_SERVICE } from '@/lib/http/headers';
import { extractHandleFromSocialUrl } from '@/lib/ingestion/flows/handle-extraction';
import { ingestSocialPlatformUrl } from '@/lib/ingestion/flows/social-platform-ingest';
import { fetchSpotifyArtistData } from '@/lib/ingestion/flows/spotify-integration';
import {
  agentProfileCreateLimiter,
  createRateLimitHeaders,
  getClientIP,
} from '@/lib/rate-limit';
import { logger } from '@/lib/utils/logger';
import { detectPlatform } from '@/lib/utils/platform-detection';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ url: z.url().max(500) });

function fail(
  status: number,
  code: string,
  message: string,
  headers: Record<string, string> = {}
): NextResponse {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { ...NO_STORE_HEADERS, ...headers } }
  );
}

function profilePayload(profile: {
  readonly username: string;
  readonly isClaimed: boolean | null;
  readonly isPublic: boolean | null;
  readonly created: boolean;
}) {
  const profileUrl = `${BASE_URL}/${encodeURIComponent(profile.username)}`;
  return {
    username: profile.username,
    profileUrl,
    // Never a raw claim token: the untrusted caller gets the verified claim
    // flow (ownership proven by the human), not a bearer ownership grant.
    claimUrl: profile.isClaimed ? null : `${profileUrl}/claim`,
    claimed: profile.isClaimed === true,
    public: profile.isPublic !== false,
    created: profile.created,
  };
}

/**
 * Anonymous agent profile creation: `POST /api/agents/profiles {"url": "<spotify artist url>"}`.
 *
 * Returns the existing profile untouched when one already holds the Spotify
 * artist ID; otherwise creates an unclaimed profile the human can claim.
 */
export async function POST(request: Request) {
  if (!(await getAppFlagValue('AGENT_PROFILE_CREATE'))) {
    return fail(
      503,
      'FEATURE_DISABLED',
      'Agent profile creation is temporarily disabled.',
      { 'Retry-After': RETRY_AFTER_SERVICE }
    );
  }

  const rateLimit = await agentProfileCreateLimiter.limit(getClientIP(request));
  if (!rateLimit.success) {
    return rateLimit.unavailable
      ? fail(503, 'TEMPORARILY_UNAVAILABLE', 'Try again shortly.', {
          'Retry-After': RETRY_AFTER_SERVICE,
        })
      : fail(
          429,
          'RATE_LIMITED',
          'Too many profile creations from this address.',
          createRateLimitHeaders(rateLimit)
        );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(
      400,
      'VALIDATION_FAILED',
      'Body must be {"url": "<https URL>"}.'
    );
  }

  const { url } = parsed.data;
  const handle =
    detectPlatform(url).platform.id === 'spotify'
      ? extractHandleFromSocialUrl(url)
      : null;
  if (!handle?.startsWith('artist_')) {
    return fail(
      422,
      'UNSUPPORTED_URL',
      'Only Spotify artist URLs are supported (https://open.spotify.com/artist/<id>).'
    );
  }

  try {
    const spotify = await fetchSpotifyArtistData(handle, 'spotify');
    if (!spotify) {
      return fail(404, 'ARTIST_NOT_FOUND', 'Spotify artist not found.');
    }

    // ponytail: unindexed spotify_id lookup (existing callers do the same);
    // add an index if agent volume makes this hot.
    const [existing] = await db
      .select({
        username: creatorProfiles.usernameNormalized,
        isClaimed: creatorProfiles.isClaimed,
        isPublic: creatorProfiles.isPublic,
      })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.spotifyId, spotify.spotifyId))
      .limit(1);
    if (existing) {
      return NextResponse.json(
        profilePayload({ ...existing, created: false }),
        { status: 200, headers: NO_STORE_HEADERS }
      );
    }

    const ingested = await ingestSocialPlatformUrl(url, {
      allocateNewHandleOnCollision: true,
    });
    const body = (await ingested.json().catch(() => null)) as {
      profile?: { username?: string };
      error?: string;
    } | null;
    const username = body?.profile?.username;
    if (!ingested.ok || !username) {
      return fail(
        ingested.status >= 400 ? ingested.status : 500,
        'CREATE_FAILED',
        body?.error ?? 'Profile could not be created.'
      );
    }

    const [created] = await db
      .select({ isPublic: creatorProfiles.isPublic })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.usernameNormalized, username))
      .limit(1);

    logger.info('Agent profile created', {
      username,
      userAgent: request.headers.get('user-agent')?.slice(0, 120),
    });

    return NextResponse.json(
      profilePayload({
        username,
        isClaimed: false,
        isPublic: created?.isPublic ?? false,
        created: true,
      }),
      { status: 201, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    captureError('Agent profile create failed', error);
    return fail(500, 'INTERNAL', 'Profile could not be created.');
  }
}
