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
import {
  listOwnedYouTubeChannels,
  type OwnedYouTubeChannel,
} from '@/lib/connectors/youtube/provider';
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

type TokenData = z.infer<typeof tokenSchema>;
type OAuthCredentials = { readonly clientId: string; readonly clientSecret: string };
type TokenExchangeResult =
  | { readonly ok: true; readonly tokenData: TokenData }
  | { readonly ok: false; readonly error: string };
type ChannelChoice =
  | { readonly ok: true; readonly channel: OwnedYouTubeChannel }
  | { readonly ok: false; readonly error: string };

function googleOAuthCredentials(): OAuthCredentials | null {
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

async function exchangeYouTubeTokens(input: {
  readonly code: string;
  readonly origin: string;
  readonly credentials: OAuthCredentials;
}): Promise<TokenExchangeResult> {
  const tokenResponse = await serverFetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: input.code,
      client_id: input.credentials.clientId,
      client_secret: input.credentials.clientSecret,
      redirect_uri: youtubeOAuthRedirectUri(input.origin),
      grant_type: 'authorization_code',
    }).toString(),
    timeoutMs: 10_000,
    context: 'YouTube token exchange',
  });
  if (!tokenResponse.ok) return { ok: false, error: 'youtube_token_exchange' };

  const parsed = tokenSchema.safeParse(
    await tokenResponse.json().catch(() => null)
  );
  return parsed.success
    ? { ok: true, tokenData: parsed.data }
    : { ok: false, error: 'youtube_token_invalid' };
}

function grantedYouTubeScopes(scopeText: string): string[] | null {
  const grantedScopes = scopeText.split(/\s+/).filter(Boolean);
  return YOUTUBE_OAUTH_SCOPES.every(scope => grantedScopes.includes(scope))
    ? grantedScopes
    : null;
}

async function chooseOwnedYouTubeChannel(
  accessToken: string
): Promise<ChannelChoice> {
  const channels = await listOwnedYouTubeChannels({ accessToken });
  if (channels.length === 0) return { ok: false, error: 'youtube_no_channel' };
  if (channels.length > 1)
    return { ok: false, error: 'youtube_channel_choice' };

  const channel = channels[0];
  return channel
    ? { ok: true, channel }
    : { ok: false, error: 'youtube_no_channel' };
}

async function upsertYouTubeConnectorAccount(input: {
  readonly userId: string;
  readonly profileId: string;
  readonly channel: OwnedYouTubeChannel;
  readonly grantedScopes: string[];
}): Promise<string> {
  const capabilities = {
    canRead: true,
    canSetThumbnail: true,
    canAnalytics: true,
    channelTitle: input.channel.title,
  };
  const [account] = await db
    .insert(connectorAccounts)
    .values({
      userId: input.userId,
      creatorProfileId: input.profileId,
      provider: CONNECTOR_PROVIDERS.youtube,
      providerAccountId: input.channel.id,
      status: asConnectorStatusSql('connected'),
      scopes: input.grantedScopes,
      capabilities,
    })
    .onConflictDoUpdate({
      target: [
        connectorAccounts.userId,
        connectorAccounts.provider,
        connectorAccounts.providerAccountId,
      ],
      set: {
        creatorProfileId: input.profileId,
        status: asConnectorStatusSql('connected'),
        scopes: input.grantedScopes,
        capabilities,
        lastErrorCode: null,
        lastErrorDevMessage: null,
        lastErrorUserMessage: null,
        updatedAt: new Date(),
      },
    })
    .returning({ id: connectorAccounts.id });
  if (!account) throw new Error('YouTube connector account write failed');
  return account.id;
}

async function markYouTubeConnectorNeedsReauth(accountId: string) {
  await db
    .update(connectorAccounts)
    .set({
      status: asConnectorStatusSql('needs_reauth'),
      lastErrorCode: 'youtube_oauth_failed',
      lastErrorUserMessage: 'Reconnect YouTube to finish connecting the channel.',
      updatedAt: new Date(),
    })
    .where(eq(connectorAccounts.id, accountId))
    .catch(() => undefined);
}

function redactedCallbackError(error: unknown, accessToken: string): Error {
  const message =
    error instanceof Error ? error.message : 'YouTube OAuth callback failed';
  return new Error(
    accessToken ? message.replaceAll(accessToken, '[REDACTED]') : message
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  let returnTo: string = APP_ROUTES.LIBRARY;
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

    const credentials = googleOAuthCredentials();
    if (!credentials) return fail('youtube_not_configured');

    const tokenExchange = await exchangeYouTubeTokens({
      code,
      origin: url.origin,
      credentials,
    });
    if (!tokenExchange.ok) return fail(tokenExchange.error);

    const tokenData = tokenExchange.tokenData;
    accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in;
    const grantedScopes = grantedYouTubeScopes(tokenData.scope);
    if (!grantedScopes) return fail('youtube_scopes');

    const channelChoice = await chooseOwnedYouTubeChannel(accessToken);
    if (!channelChoice.ok) return fail(channelChoice.error);

    accountId = await upsertYouTubeConnectorAccount({
      userId: session.userId,
      profileId,
      channel: channelChoice.channel,
      grantedScopes,
    });
    await storeTokens({
      connectorAccountId: accountId,
      accessToken,
      refreshToken,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    });
    return redirectWith(url.origin, returnTo, { connected: 'youtube' });
  } catch (error) {
    if (accountId) await markYouTubeConnectorNeedsReauth(accountId);
    await captureError(
      'YouTube OAuth callback failed',
      redactedCallbackError(error, accessToken)
    );
    return fail('youtube_oauth_callback');
  }
}
