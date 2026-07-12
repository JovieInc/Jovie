import { type NextRequest, NextResponse } from 'next/server';
import { writePendingClaimContext } from '@/lib/claim/context';
import {
  clearLeadAttributionCookie,
  lookupLeadByClaimToken,
  markLeadClaimPageViewedFromToken,
  setLeadAttributionCookieFromToken,
} from '@/lib/leads/funnel-events';
import {
  allowIfRateLimitBackendDegraded,
  claimTokenAccessLimiter,
  createRateLimitHeaders,
  getClientIP,
} from '@/lib/rate-limit';
import { hashClaimToken } from '@/lib/security/claim-token';
import { getProfileByUsername } from '@/lib/services/profile';
import {
  isClaimTokenValid,
  lookupUsernameByClaimToken,
} from '@/lib/services/profile/queries';

interface ClaimTokenRouteContext {
  readonly params: Promise<{ readonly token: string }>;
}

function buildAbsoluteUrl(request: NextRequest, pathname: string): URL {
  return new URL(pathname, request.url);
}

export async function GET(
  request: NextRequest,
  { params }: ClaimTokenRouteContext
): Promise<NextResponse> {
  const { token } = await params;

  if (!token) {
    return NextResponse.redirect(buildAbsoluteUrl(request, '/'));
  }

  // Throttle this unauthenticated entry before any DB work: each hit runs
  // several profile/lead reads plus lead/cookie writes. A degraded (Redis-down)
  // backend is treated as advisory so an outage never blocks a legitimate
  // creator following their claim link.
  const clientIp = getClientIP(request);
  const rateLimit = allowIfRateLimitBackendDegraded(
    await claimTokenAccessLimiter.limit(clientIp),
    { route: '/claim/[token]' }
  );
  if (!rateLimit.success) {
    return new NextResponse('Too many requests', {
      status: 429,
      headers: createRateLimitHeaders(rateLimit),
    });
  }

  const username = await lookupUsernameByClaimToken(token);
  if (!username) {
    await clearLeadAttributionCookie();
    return NextResponse.redirect(buildAbsoluteUrl(request, '/'));
  }

  const isValid = await isClaimTokenValid(username, token);
  if (!isValid) {
    await clearLeadAttributionCookie();
    return NextResponse.redirect(
      buildAbsoluteUrl(request, `/${encodeURIComponent(username)}?claim=1`)
    );
  }

  const profile = await getProfileByUsername(username);
  if (!profile) {
    await clearLeadAttributionCookie();
    return NextResponse.redirect(buildAbsoluteUrl(request, '/'));
  }

  const lead = await lookupLeadByClaimToken(token);
  const claimTokenHash = await hashClaimToken(token);

  await setLeadAttributionCookieFromToken(token);
  await markLeadClaimPageViewedFromToken(token);
  await writePendingClaimContext({
    mode: 'token_backed',
    creatorProfileId: profile.id,
    username: profile.usernameNormalized,
    claimTokenHash,
    leadId: lead?.id ?? null,
    expectedSpotifyArtistId: profile.spotifyId ?? null,
  });

  return NextResponse.redirect(
    buildAbsoluteUrl(
      request,
      `/${encodeURIComponent(profile.usernameNormalized)}?claim=1`
    )
  );
}
