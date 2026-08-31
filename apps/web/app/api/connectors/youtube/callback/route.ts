import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { APP_ROUTES } from '@/constants/routes';
import { getCachedAuth } from '@/lib/auth/cached';
import { sanitizeRedirectUrl } from '@/lib/auth/constants';
import { getExactProfileAccess } from '@/lib/auth/profile-access';
import { asConnectorStatusSql } from '@/lib/connectors/db-expressions';
import { verifyGoogleOAuthState } from '@/lib/connectors/google-calendar/oauth-state';
import { CONNECTOR_PROVIDERS } from '@/lib/connectors/registry';
import { storeTokens } from '@/lib/connectors/token-vault';
import { youtubeOAuthRedirectUri } from '@/lib/connectors/youtube/oauth';
import { listOwnedYouTubeChannels } from '@/lib/connectors/youtube/provider';
import { YOUTUBE_OAUTH_SCOPES } from '@/lib/connectors/youtube/scopes';
import { db } from '@/lib/db';
import { connectorAccounts } from '@/lib/db/schema/connectors';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { serverFetch } from '@/lib/http/server-fetch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().finite().nonnegative(),
  scope: z.string().min(1),
});

function redirectWith(
  origin: string,
  returnTo: string,
  values: Record<string, string>
) {
  const target = new URL(
    sanitizeRedirectUrl(returnTo) ?? APP_ROUTES.LIBRARY,
    origin
  );
  for (const [key, value] of Object.entries(values))
    target.searchParams.set(key, value);
  return NextResponse.redirect(target, { status: 302 });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  let returnTo = APP_ROUTES.LIBRARY;
  const fail = (error: string) => redirectWith(url.origin, returnTo, { error });
  if (url.searchParams.has('error')) return fail('youtube_oauth_denied');
  const code = url.searchParams.get('code');
  const stateParam = url.searchParams.get('state');
  if (!code || !stateParam) return fail('youtube_oauth_missing');

  let accountId: string | null = null;
  let accessToken = '';
  try {
    const state = verifyGoogleOAuthState(stateParam);
    returnTo = sanitizeRedirectUrl(state.returnTo) ?? APP_ROUTES.LIBRARY;
    const profileId = state.creatorProfileId;
    if (!profileId) return fail('youtube_profile_missing');

    const session = await getCachedAuth();
    if (!session.userId || session.userId !== state.userId)
      return fail('youtube_session_changed');
    const access = await getExactProfileAccess(db, session.userId, profileId);
    if (!access.ok) return fail('youtube_profile_access');
    const clientId = env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET;
    if (!clientId || !clientSecret) return fail('youtube_not_configured');

    const tokenResponse = await serverFetch(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: youtubeOAuthRedirectUri(url.origin),
          grant_type: 'authorization_code',
        }).toString(),
        timeoutMs: 10_000,
        context: 'YouTube token exchange',
      }
    );
    if (!tokenResponse.ok) return fail('youtube_token_exchange');
    const parsed = tokenSchema.safeParse(
      await tokenResponse.json().catch(() => null)
    );
    if (!parsed.success) return fail('youtube_token_invalid');
    const tokenData = parsed.data;
    accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in;
    const grantedScopes = tokenData.scope.split(/\s+/).filter(Boolean);
    if (!YOUTUBE_OAUTH_SCOPES.every(scope => grantedScopes.includes(scope)))
      return fail('youtube_scopes');

    const channels = await listOwnedYouTubeChannels({ accessToken });
    if (channels.length !== 1)
      return fail(
        channels.length === 0 ? 'youtube_no_channel' : 'youtube_channel_choice'
      );
    const [channel] = channels;
    if (!channel) return fail('youtube_no_channel');
    const capabilities = {
      canRead: true,
      canSetThumbnail: true,
      canAnalytics: true,
      channelTitle: channel.title,
    };
    const [account] = await db
      .insert(connectorAccounts)
      .values({
        userId: session.userId,
        creatorProfileId: profileId,
        provider: CONNECTOR_PROVIDERS.youtube,
        providerAccountId: channel.id,
        status: asConnectorStatusSql('connected'),
        scopes: grantedScopes,
        capabilities,
      })
      .onConflictDoUpdate({
        target: [
          connectorAccounts.userId,
          connectorAccounts.provider,
          connectorAccounts.providerAccountId,
        ],
        set: {
          creatorProfileId: profileId,
          status: asConnectorStatusSql('connected'),
          scopes: grantedScopes,
          capabilities,
          lastErrorCode: null,
          lastErrorDevMessage: null,
          lastErrorUserMessage: null,
          updatedAt: new Date(),
        },
      })
      .returning({ id: connectorAccounts.id });
    if (!account) throw new Error('YouTube connector account write failed');
    accountId = account.id;
    await storeTokens({
      connectorAccountId: account.id,
      accessToken,
      refreshToken,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    });
    return redirectWith(url.origin, returnTo, { connected: 'youtube' });
  } catch (error) {
    if (accountId) {
      await db
        .update(connectorAccounts)
        .set({
          status: asConnectorStatusSql('needs_reauth'),
          lastErrorCode: 'youtube_oauth_failed',
          lastErrorUserMessage:
            'Reconnect YouTube to finish connecting the channel.',
          updatedAt: new Date(),
        })
        .where(eq(connectorAccounts.id, accountId))
        .catch(() => undefined);
    }
    const message =
      error instanceof Error ? error.message : 'YouTube OAuth callback failed';
    await captureError(
      'YouTube OAuth callback failed',
      new Error(
        accessToken ? message.replaceAll(accessToken, '[REDACTED]') : message
      )
    );
    return fail('youtube_oauth_callback');
  }
}
