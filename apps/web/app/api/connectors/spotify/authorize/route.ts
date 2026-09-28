import { NextResponse } from 'next/server';
import { z } from 'zod';
import { APP_ROUTES } from '@/constants/routes';
import { getCachedAuth } from '@/lib/auth/cached';
import { sanitizeRedirectUrl } from '@/lib/auth/constants';
import { signGoogleOAuthState } from '@/lib/connectors/google-calendar/oauth-state';
import { getOAuthScopesForBundle } from '@/lib/connectors/registry';
import { spotifyOAuthRedirectUri } from '@/lib/connectors/spotify/oauth';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { SPOTIFY_ACCOUNTS_BASE } from '@/lib/spotify/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  returnTo: z.string().startsWith('/').default(APP_ROUTES.SETTINGS_CONNECTORS),
});

function redirectError(origin: string, returnTo: string, error: string) {
  const target = new URL(sanitizeRedirectUrl(returnTo) ?? '/', origin);
  target.searchParams.set('error', error);
  return NextResponse.redirect(target, { status: 302 });
}

/**
 * Spotify OAuth for the canonical connector primitive — one route serves artist
 * accounts on Jovie and company accounts on Ovie.
 * GET /api/connectors/spotify/authorize?returnTo=/app/admin/platform-connections
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    returnTo:
      url.searchParams.get('returnTo') ?? APP_ROUTES.SETTINGS_CONNECTORS,
  });
  const returnTo = parsed.success
    ? parsed.data.returnTo
    : APP_ROUTES.SETTINGS_CONNECTORS;

  try {
    const { userId } = await getCachedAuth();
    if (!userId)
      return NextResponse.redirect(`${url.origin}/sign-in`, { status: 302 });

    const clientId = env.SPOTIFY_CLIENT_ID;
    if (!clientId) {
      return redirectError(url.origin, returnTo, 'spotify_not_configured');
    }

    const state = signGoogleOAuthState({ userId, returnTo });
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: spotifyOAuthRedirectUri(url.origin),
      response_type: 'code',
      show_dialog: 'true',
      state,
      scope: getOAuthScopesForBundle('spotify').join(' '),
    });
    return NextResponse.redirect(
      `${SPOTIFY_ACCOUNTS_BASE}/authorize?${params.toString()}`,
      { status: 302 }
    );
  } catch (error) {
    await captureError('Spotify OAuth authorize failed', error);
    return redirectError(url.origin, returnTo, 'spotify_oauth_start');
  }
}
