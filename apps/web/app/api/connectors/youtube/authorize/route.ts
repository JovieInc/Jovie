import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { APP_ROUTES } from '@/constants/routes';
import { getCachedAuth } from '@/lib/auth/cached';
import { signGoogleOAuthState } from '@/lib/connectors/google-calendar/oauth-state';
import { YOUTUBE_OAUTH_SCOPE_STRING } from '@/lib/connectors/youtube/scopes';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * YouTube OAuth authorize (JOV-3189).
 *
 * GET /api/connectors/youtube/authorize?returnTo=/app/settings/connectors
 *
 * Uses the shared Google OAuth client credentials. Requires YouTube Data API v3
 * and the redirect URI registered as `{base}/callback`.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const requestedReturnTo = searchParams.get('returnTo');
  const returnTo =
    requestedReturnTo?.startsWith('/') && !requestedReturnTo.startsWith('//')
      ? requestedReturnTo
      : APP_ROUTES.SETTINGS_CONNECTORS;

  if (!env.GOOGLE_OAUTH_CLIENT_ID) {
    logger.error(
      '[connectors/youtube/authorize] GOOGLE_OAUTH_CLIENT_ID not configured'
    );
    return NextResponse.redirect(
      `${origin}${APP_ROUTES.SETTINGS_CONNECTORS}?error=youtube_oauth_not_configured`,
      { status: 302 }
    );
  }

  try {
    const { userId: clerkId } = await getCachedAuth();
    if (!clerkId) {
      return NextResponse.redirect(`${origin}/sign-in`, { status: 302 });
    }

    const [dbUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);

    if (!dbUser) {
      logger.error('[connectors/youtube/authorize] DB user not found', {
        clerkId,
      });
      return NextResponse.redirect(
        `${origin}${APP_ROUTES.SETTINGS_CONNECTORS}?error=auth`,
        { status: 302 }
      );
    }

    const state = signGoogleOAuthState({ userId: dbUser.id, returnTo });
    const redirectUri = `${
      env.YOUTUBE_OAUTH_REDIRECT_URI_BASE ?? `${origin}/api/connectors/youtube`
    }/callback`;

    const params = new URLSearchParams({
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      state,
      scope: YOUTUBE_OAUTH_SCOPE_STRING,
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return NextResponse.redirect(authUrl, { status: 302 });
  } catch (error) {
    logger.error('[connectors/youtube/authorize] Unexpected error', { error });
    await captureError('YouTube OAuth authorize failed', error, {
      route: '/api/connectors/youtube/authorize',
      method: 'GET',
    });
    return NextResponse.redirect(
      `${origin}${APP_ROUTES.SETTINGS_CONNECTORS}?error=oauth_start`,
      { status: 302 }
    );
  }
}
