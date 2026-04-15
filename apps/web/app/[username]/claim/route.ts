import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { APP_ROUTES } from '@/constants/routes';
import { getOptionalAuth } from '@/lib/auth/cached';
import {
  clearPendingClaimContext,
  readPendingClaimContext,
  writePendingClaimContext,
} from '@/lib/claim/context';
import type { PendingClaimContext } from '@/lib/claim/types';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import {
  clearLeadAttributionCookie,
  lookupLeadByClaimToken,
  markLeadClaimPageViewedFromToken,
  setLeadAttributionCookieFromToken,
} from '@/lib/leads/funnel-events';
import { hashClaimToken } from '@/lib/security/claim-token';
import {
  getProfileByUsername,
  isClaimTokenValid,
} from '@/lib/services/profile';
import {
  USERNAME_MAX_LENGTH,
  USERNAME_PATTERN,
} from '@/lib/validation/username-core';

interface ClaimRouteContext {
  readonly params: Promise<{ readonly username: string }>;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildAbsoluteUrl(request: NextRequest, pathname: string): URL {
  return new URL(pathname, request.url);
}

function redirectTo(request: NextRequest, pathname: string): NextResponse {
  return NextResponse.redirect(buildAbsoluteUrl(request, pathname));
}

function getCanonicalSpotifyUrl(profile: {
  spotifyId: string | null;
  spotifyUrl: string | null;
}): string | null {
  if (profile.spotifyUrl) {
    return profile.spotifyUrl;
  }

  if (!profile.spotifyId) {
    return null;
  }

  return `https://open.spotify.com/artist/${encodeURIComponent(profile.spotifyId)}`;
}

async function hasActiveCreatorProfile(clerkUserId: string): Promise<boolean> {
  const [user] = await db
    .select({ activeProfileId: users.activeProfileId })
    .from(users)
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  return Boolean(user?.activeProfileId);
}

function buildAuthStartPath(params: {
  username: string;
  spotifyArtistName: string;
  spotifyUrl: string | null;
  isSignedIn: boolean;
}): string {
  const onboardingParams = new URLSearchParams({
    handle: params.username,
  });

  if (params.isSignedIn) {
    return `${APP_ROUTES.ONBOARDING}?${onboardingParams.toString()}`;
  }

  const signUpParams = new URLSearchParams({
    handle: params.username,
    redirect_url: `${APP_ROUTES.ONBOARDING}?${onboardingParams.toString()}`,
  });

  if (params.spotifyUrl) {
    signUpParams.set('spotify_url', params.spotifyUrl);
    signUpParams.set('artist_name', params.spotifyArtistName);
  }

  return `${APP_ROUTES.SIGNUP}?${signUpParams.toString()}`;
}

function buildClaimPreviewPath(username: string): string {
  return `/${username}?claim=1`;
}

function renderClaimLandingPage(
  request: NextRequest,
  params: {
    username: string;
    displayName: string;
  }
): NextResponse {
  const authPath = `/${encodeURIComponent(params.username)}/claim?next=auth`;
  const authUrl = buildAbsoluteUrl(request, authPath).toString();
  const escapedName = escapeHtml(params.displayName);
  const escapedUsername = escapeHtml(params.username);

  return new NextResponse(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Claim ${escapedName}</title>
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #08090a;
        color: #f5f7fa;
        font-family: Inter, system-ui, sans-serif;
        padding: 24px;
      }
      main {
        width: min(100%, 420px);
        text-align: center;
      }
      h1 { font-size: 28px; line-height: 1.15; margin: 0 0 8px; }
      p { margin: 0 0 24px; color: #c2c8d0; line-height: 1.55; }
      a {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 44px;
        padding: 0 20px;
        border-radius: 999px;
        background: #ffffff;
        color: #08090a;
        text-decoration: none;
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Claim ${escapedName}</h1>
      <p>This profile for @${escapedUsername} is ready for you to claim.</p>
      <a href="${authUrl}">Continue Claim</a>
    </main>
  </body>
</html>`,
    {
      headers: {
        'content-type': 'text/html; charset=utf-8',
      },
    }
  );
}

async function handleTokenFlow(
  request: NextRequest,
  profile: NonNullable<Awaited<ReturnType<typeof getProfileByUsername>>>,
  token: string,
  userId: string | null,
  claimPreviewPath: string,
  existingPendingClaim: PendingClaimContext | null
): Promise<NextResponse> {
  const isValid = await isClaimTokenValid(profile.usernameNormalized, token);
  if (!isValid) {
    await clearLeadAttributionCookie();
    if (existingPendingClaim?.creatorProfileId === profile.id) {
      await clearPendingClaimContext();
    }
    return redirectTo(request, claimPreviewPath);
  }

  const lead = await lookupLeadByClaimToken(token);
  await setLeadAttributionCookieFromToken(token);
  await markLeadClaimPageViewedFromToken(token);
  await writePendingClaimContext({
    mode: 'token_backed',
    creatorProfileId: profile.id,
    username: profile.usernameNormalized,
    claimTokenHash: await hashClaimToken(token),
    leadId: lead?.id ?? null,
    expectedSpotifyArtistId: profile.spotifyId ?? null,
  });

  if (request.nextUrl.searchParams.get('next') !== 'auth') {
    return redirectTo(request, claimPreviewPath);
  }

  return redirectTo(
    request,
    buildAuthStartPath({
      username: profile.usernameNormalized,
      spotifyArtistName: profile.displayName ?? profile.username,
      spotifyUrl: getCanonicalSpotifyUrl(profile),
      isSignedIn: Boolean(userId),
    })
  );
}

async function handleAuthNextFlow(
  request: NextRequest,
  profile: NonNullable<Awaited<ReturnType<typeof getProfileByUsername>>>,
  userId: string | null,
  existingPendingClaim: PendingClaimContext | null
): Promise<NextResponse> {
  if (profile.isClaimed) {
    if (existingPendingClaim?.creatorProfileId === profile.id) {
      await clearPendingClaimContext();
    }
    return redirectTo(request, `/${profile.usernameNormalized}`);
  }

  if (
    existingPendingClaim &&
    existingPendingClaim.creatorProfileId === profile.id &&
    existingPendingClaim.username === profile.usernameNormalized
  ) {
    return redirectTo(
      request,
      buildAuthStartPath({
        username: profile.usernameNormalized,
        spotifyArtistName: profile.displayName ?? profile.username,
        spotifyUrl: getCanonicalSpotifyUrl(profile),
        isSignedIn: Boolean(userId),
      })
    );
  }

  if (!profile.spotifyId) {
    return redirectTo(
      request,
      `/${profile.usernameNormalized}?claim=unsupported`
    );
  }

  await writePendingClaimContext({
    mode: 'direct_profile',
    creatorProfileId: profile.id,
    username: profile.usernameNormalized,
    expectedSpotifyArtistId: profile.spotifyId,
  });

  return redirectTo(
    request,
    buildAuthStartPath({
      username: profile.usernameNormalized,
      spotifyArtistName: profile.displayName ?? profile.username,
      spotifyUrl: getCanonicalSpotifyUrl(profile),
      isSignedIn: Boolean(userId),
    })
  );
}

export async function GET(
  request: NextRequest,
  { params }: ClaimRouteContext
): Promise<NextResponse> {
  const { username } = await params;
  const normalizedUsername = username.toLowerCase();

  if (
    username.length > USERNAME_MAX_LENGTH ||
    !USERNAME_PATTERN.test(username)
  ) {
    return redirectTo(request, '/');
  }

  const profile = await getProfileByUsername(normalizedUsername);

  if (!profile) {
    return redirectTo(request, '/');
  }

  const { userId } = await getOptionalAuth();
  const existingPendingClaim = await readPendingClaimContext({
    username: profile.usernameNormalized,
  });
  const searchParams = request.nextUrl.searchParams;
  const token = searchParams.get('token')?.trim();
  const claimPreviewUrl = buildClaimPreviewPath(profile.usernameNormalized);

  if (token) {
    return handleTokenFlow(
      request,
      profile,
      token,
      userId,
      claimPreviewUrl,
      existingPendingClaim
    );
  }

  if (searchParams.get('next') === 'auth') {
    if (
      userId &&
      (await hasActiveCreatorProfile(userId)) &&
      !(
        existingPendingClaim &&
        existingPendingClaim.creatorProfileId === profile.id &&
        existingPendingClaim.username === profile.usernameNormalized
      )
    ) {
      return redirectTo(request, APP_ROUTES.DASHBOARD);
    }

    return handleAuthNextFlow(request, profile, userId, existingPendingClaim);
  }

  if (profile.isClaimed) {
    return redirectTo(request, `/${profile.usernameNormalized}`);
  }

  return renderClaimLandingPage(request, {
    username: profile.usernameNormalized,
    displayName: profile.displayName ?? profile.username,
  });
}
