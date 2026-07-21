import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { APP_ROUTES } from '@/constants/routes';
import { getCachedAuth } from '@/lib/auth/cached';
import { signGoogleOAuthState } from '@/lib/connectors/google-calendar/oauth-state';
import { getOAuthScopesForBundle } from '@/lib/connectors/registry';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Combined Google OAuth flow requesting both Calendar + Gmail readonly scopes.
 * A single consent screen avoids two round-trips for the DJ persona.
 *
 * GET /api/connectors/google/authorize?returnTo=/app/settings/connectors
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const returnTo =
    searchParams.get('returnTo') ?? APP_ROUTES.SETTINGS_CONNECTORS;

  // Mock mode: if GOOGLE_OAUTH_CLIENT_ID is missing in non-production, seed a
  // fixture token instead of failing with "OAuth not configured".
  if (!env.GOOGLE_OAUTH_CLIENT_ID && process.env.NODE_ENV !== 'production') {
    return NextResponse.redirect(
      `${origin}/api/dev/connectors/seed-fixtures?returnTo=${encodeURIComponent(returnTo)}`,
      { status: 302 }
    );
  }

  try {
    const { userId: clerkId } = await getCachedAuth();
    if (!clerkId) {
      return NextResponse.redirect(`${origin}/sign-in`, { status: 302 });
    }

    // Resolve the internal DB user ID from Clerk ID.
    const [dbUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);

    if (!dbUser) {
      logger.error('[connectors/google/authorize] DB user not found', {
        clerkId,
      });
      return NextResponse.redirect(
        `${origin}${APP_ROUTES.SETTINGS_CONNECTORS}?error=auth`,
        { status: 302 }
      );
    }

    const state = signGoogleOAuthState({ userId: dbUser.id, returnTo });

    const redirectUri = `${env.GOOGLE_OAUTH_REDIRECT_URI_BASE ?? origin + '/api/connectors/google'}/callback`;

    const params = new URLSearchParams({
      client_id: env.GOOGLE_OAUTH_CLIENT_ID ?? '',
      redirect_uri: redirectUri,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      state,
      // Scopes come from CONNECTOR_REGISTRY entries for the Google bundle.
      scope: getOAuthScopesForBundle('google').join(' '),
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return NextResponse.redirect(authUrl, { status: 302 });
  } catch (error) {
    logger.error('[connectors/google/authorize] Unexpected error', { error });
    await captureError('Google OAuth authorize failed', error, {
      route: '/api/connectors/google/authorize',
      method: 'GET',
    });
    return NextResponse.redirect(
      `${origin}${APP_ROUTES.SETTINGS_CONNECTORS}?error=oauth_start`,
      { status: 302 }
    );
  }
}
