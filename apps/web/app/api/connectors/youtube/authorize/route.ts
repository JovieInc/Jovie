import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCachedAuth } from '@/lib/auth/cached';
import { sanitizeRedirectUrl } from '@/lib/auth/constants';
import { getExactProfileAccess } from '@/lib/auth/profile-access';
import { signGoogleOAuthState } from '@/lib/connectors/google-calendar/oauth-state';
import { getOAuthScopesForBundle } from '@/lib/connectors/registry';
import { db } from '@/lib/db';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  creatorProfileId: z.string().uuid(),
  returnTo: z.string().startsWith('/').default('/app/library'),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    creatorProfileId: url.searchParams.get('creatorProfileId'),
    returnTo: url.searchParams.get('returnTo') ?? '/app/library',
  });
  if (!parsed.success) {
    return NextResponse.redirect(
      `${url.origin}/app/library?error=youtube_profile`,
      {
        status: 302,
      }
    );
  }

  try {
    const { userId } = await getCachedAuth();
    if (!userId) {
      return NextResponse.redirect(`${url.origin}/sign-in`, { status: 302 });
    }
    const access = await getExactProfileAccess(
      db,
      userId,
      parsed.data.creatorProfileId
    );
    if (!access.ok) {
      return NextResponse.redirect(
        `${url.origin}/app/library?error=youtube_profile_access`,
        { status: 302 }
      );
    }
    if (!env.GOOGLE_OAUTH_CLIENT_ID) {
      return NextResponse.redirect(
        `${url.origin}/app/library?error=youtube_not_configured`,
        { status: 302 }
      );
    }

    const returnTo =
      sanitizeRedirectUrl(parsed.data.returnTo) ?? '/app/library';
    const redirectUri = `${env.YOUTUBE_OAUTH_REDIRECT_URI_BASE ?? `${url.origin}/api/connectors/youtube`}/callback`;
    const state = signGoogleOAuthState({
      userId,
      creatorProfileId: parsed.data.creatorProfileId,
      returnTo,
    });
    const params = new URLSearchParams({
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
      scope: getOAuthScopesForBundle('youtube').join(' '),
    });
    return NextResponse.redirect(
      `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      { status: 302 }
    );
  } catch (error) {
    logger.error('[connectors/youtube/authorize] Unexpected error', { error });
    await captureError('YouTube OAuth authorize failed', error, {
      route: '/api/connectors/youtube/authorize',
      method: 'GET',
    });
    return NextResponse.redirect(
      `${url.origin}/app/library?error=youtube_oauth_start`,
      { status: 302 }
    );
  }
}
