import { desc, eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { recordArtistOfferStage } from '@/lib/acquisition/artist-offer-funnel.server';
import { getOptionalAuth } from '@/lib/auth/cached';
import {
  BILLING_INTERVAL_COOKIE,
  CLAIM_FLOW_COOKIE,
  CLAIM_FLOW_COOKIE_MAX_AGE_SECONDS,
  type ClaimArtist,
  type ClaimViewer,
  claimStateHref,
  isSpotifyArtistId,
  PLAN_INTENT_COOKIE,
  PLAN_INTENT_MAX_AGE_SECONDS,
  resolveClaimRedirect,
} from '@/lib/claim/artist-offer-claim';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError } from '@/lib/error-tracking';
import { isReservedPublicProfileIdentity } from '@/lib/profile/public-profile-identity-policy';
import {
  allowIfRateLimitBackendDegraded,
  claimTokenAccessLimiter,
  createRateLimitHeaders,
  getClientIP,
} from '@/lib/rate-limit';
import { isSpotifyAvailable, spotifyClient } from '@/lib/spotify';
import { ACQUISITION_COOKIE_NAME } from '@/lib/tracking/consent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

class ArtistLookupUnavailableError extends Error {}

async function loadViewer(userId: string | null): Promise<ClaimViewer> {
  if (!userId) {
    return { signedIn: false, isSubscriber: false, hasClaimedProfile: false };
  }

  const [entitlements, [row]] = await Promise.all([
    getCurrentUserEntitlements(),
    db
      .select({ isClaimed: creatorProfiles.isClaimed })
      .from(users)
      .leftJoin(creatorProfiles, eq(creatorProfiles.id, users.activeProfileId))
      .where(eq(users.id, userId))
      .limit(1),
  ]);

  return {
    signedIn: true,
    isSubscriber: entitlements.isPro && !entitlements.isTrialing,
    hasClaimedProfile: row?.isClaimed === true,
  };
}

async function loadArtist(spotifyId: string): Promise<ClaimArtist> {
  const [profile] = await db
    .select({
      username: creatorProfiles.usernameNormalized,
      isClaimed: creatorProfiles.isClaimed,
      followers: creatorProfiles.spotifyFollowers,
      displayName: creatorProfiles.displayName,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.spotifyId, spotifyId))
    .orderBy(desc(creatorProfiles.isClaimed))
    .limit(1);

  // Identity safety needs current reach: a stored count is used when present,
  // otherwise Spotify is the authority. Unknown reach fails closed.
  let followers = profile?.followers ?? null;
  let name = profile?.displayName ?? null;
  if (followers === null) {
    if (!isSpotifyAvailable()) throw new ArtistLookupUnavailableError();
    try {
      const artist = await spotifyClient.getArtist(spotifyId);
      followers = artist.followerCount;
      name = name ?? artist.name;
    } catch (error) {
      throw new ArtistLookupUnavailableError(
        error instanceof Error ? error.message : 'Spotify lookup failed'
      );
    }
  }

  return {
    spotifyId,
    name,
    followers,
    profile: profile
      ? { username: profile.username, isClaimed: profile.isClaimed === true }
      : null,
  };
}

function redirectWithClaimCookies(
  request: NextRequest,
  location: string
): NextResponse {
  const response = NextResponse.redirect(new URL(location, request.url));
  const secure = request.nextUrl.protocol === 'https:';
  // Read client-side by lib/auth/plan-intent.ts, so not httpOnly.
  response.cookies.set(PLAN_INTENT_COOKIE, 'pro', {
    path: '/',
    sameSite: 'lax',
    secure,
    maxAge: PLAN_INTENT_MAX_AGE_SECONDS,
  });
  response.cookies.set(BILLING_INTERVAL_COOKIE, 'month', {
    path: '/',
    sameSite: 'lax',
    secure,
    maxAge: PLAN_INTENT_MAX_AGE_SECONDS,
  });
  response.cookies.set(CLAIM_FLOW_COOKIE, '1', {
    path: '/',
    sameSite: 'lax',
    secure,
    httpOnly: true,
    maxAge: CLAIM_FLOW_COOKIE_MAX_AGE_SECONDS,
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

/**
 * GET /claim/start?spotify=<artistId> | ?new=1
 *
 * Entry of the $12/month self-serve claim. Records the `claim-start` funnel
 * stage, captures Pro monthly intent, then routes to the existing
 * proof-checked claim, sign-up, onboarding or checkout step.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimit = allowIfRateLimitBackendDegraded(
    await claimTokenAccessLimiter.limit(`claim-start:${getClientIP(request)}`),
    { route: '/claim/start' }
  );
  if (!rateLimit.success) {
    return new NextResponse('Too many requests', {
      status: 429,
      headers: createRateLimitHeaders(rateLimit),
    });
  }

  const spotifyParam = request.nextUrl.searchParams.get('spotify');
  const wantsNewProfile = request.nextUrl.searchParams.get('new') === '1';
  if (!wantsNewProfile && !isSpotifyArtistId(spotifyParam)) {
    return NextResponse.redirect(new URL('/claim', request.url));
  }

  await recordArtistOfferStage(
    request.cookies.get(ACQUISITION_COOKIE_NAME)?.value,
    'claim-start'
  );

  try {
    const { userId } = await getOptionalAuth();
    const viewer = await loadViewer(userId);
    const artist =
      !wantsNewProfile && isSpotifyArtistId(spotifyParam)
        ? await loadArtist(spotifyParam)
        : null;

    if (
      artist?.profile &&
      isReservedPublicProfileIdentity(artist.profile.username)
    ) {
      return redirectWithClaimCookies(
        request,
        claimStateHref('verification_required')
      );
    }

    return redirectWithClaimCookies(
      request,
      resolveClaimRedirect({ viewer, artist })
    );
  } catch (error) {
    if (!(error instanceof ArtistLookupUnavailableError)) {
      await captureError('Self-serve claim start failed', error, {
        route: '/claim/start',
      });
    }
    return NextResponse.redirect(
      new URL(claimStateHref('unavailable'), request.url)
    );
  }
}
