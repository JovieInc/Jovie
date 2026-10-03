import { NextResponse } from 'next/server';
import { z } from 'zod';
import { APP_ROUTES } from '@/constants/routes';
import { getCachedAuth } from '@/lib/auth/cached';
import { sanitizeRedirectUrl } from '@/lib/auth/constants';
import { getExactProfileAccess } from '@/lib/auth/profile-access';
import { signGoogleOAuthState } from '@/lib/connectors/google-calendar/oauth-state';
import { getOAuthScopesForBundle } from '@/lib/connectors/registry';
import { youtubeOAuthRedirectUri } from '@/lib/connectors/youtube/oauth';
import { db } from '@/lib/db';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';

const querySchema = z.object({
  creatorProfileId: z.string().uuid(),
  returnTo: z.string().startsWith('/').default(APP_ROUTES.LIBRARY),
});

const redirectError = (origin: string, error: string) =>
  NextResponse.redirect(`${origin}${APP_ROUTES.LIBRARY}?error=${error}`, {
    status: 302,
  });

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return redirectError(url.origin, 'youtube_profile');

  try {
    const { userId } = await getCachedAuth();
    if (!userId)
      return NextResponse.redirect(`${url.origin}/sign-in`, { status: 302 });
    const { creatorProfileId, returnTo: requestedReturnTo } = parsed.data;
    const access = await getExactProfileAccess(db, userId, creatorProfileId);
    if (!access.ok) return redirectError(url.origin, 'youtube_profile_access');
    if (!env.GOOGLE_OAUTH_CLIENT_ID)
      return redirectError(url.origin, 'youtube_not_configured');

    const returnTo =
      sanitizeRedirectUrl(requestedReturnTo) ?? APP_ROUTES.LIBRARY;
    const state = signGoogleOAuthState({ userId, creatorProfileId, returnTo });
    const params = new URLSearchParams({
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      redirect_uri: youtubeOAuthRedirectUri(url.origin),
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
    await captureError('YouTube OAuth authorize failed', error);
    return redirectError(url.origin, 'youtube_oauth_start');
  }
}
