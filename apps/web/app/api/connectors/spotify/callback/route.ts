import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { APP_ROUTES } from '@/constants/routes';
import { getCachedAuth } from '@/lib/auth/cached';
import { sanitizeRedirectUrl } from '@/lib/auth/constants';
import { asConnectorStatusSql } from '@/lib/connectors/db-expressions';
import { verifyGoogleOAuthState } from '@/lib/connectors/google-calendar/oauth-state';
import { CONNECTOR_PROVIDERS } from '@/lib/connectors/registry';
import { spotifyOAuthRedirectUri } from '@/lib/connectors/spotify/oauth';
import { getSpotifyAccountProfile } from '@/lib/connectors/spotify/provider';
import { SPOTIFY_OAUTH_SCOPES } from '@/lib/connectors/spotify/scopes';
import { storeTokens } from '@/lib/connectors/token-vault';
import { db } from '@/lib/db';
import { connectorAccounts } from '@/lib/db/schema/connectors';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { serverFetch } from '@/lib/http/server-fetch';
import { SPOTIFY_ACCOUNTS_BASE } from '@/lib/spotify/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().finite().nonnegative(),
  scope: z.string().min(1),
});

type TokenData = z.infer<typeof tokenSchema>;
type TokenExchangeResult =
  | { readonly ok: true; readonly tokenData: TokenData }
  | { readonly ok: false; readonly error: string };

function redirectWith(
  origin: string,
  returnTo: string,
  values: Record<string, string>
) {
  const target = new URL(
    sanitizeRedirectUrl(returnTo) ?? APP_ROUTES.SETTINGS_CONNECTORS,
    origin
  );
  for (const [key, value] of Object.entries(values))
    target.searchParams.set(key, value);
  return NextResponse.redirect(target, { status: 302 });
}

function spotifyOAuthCredentials(): {
  clientId: string;
  clientSecret: string;
} | null {
  const clientId = env.SPOTIFY_CLIENT_ID;
  const clientSecret = env.SPOTIFY_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

async function exchangeSpotifyTokens(input: {
  readonly code: string;
  readonly origin: string;
  readonly clientId: string;
  readonly clientSecret: string;
}): Promise<TokenExchangeResult> {
  const tokenResponse = await serverFetch(
    `${SPOTIFY_ACCOUNTS_BASE}/api/token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(
          `${input.clientId}:${input.clientSecret}`
        ).toString('base64')}`,
      },
      body: new URLSearchParams({
        code: input.code,
        redirect_uri: spotifyOAuthRedirectUri(input.origin),
        grant_type: 'authorization_code',
      }).toString(),
      timeoutMs: 10_000,
      context: 'Spotify token exchange',
    }
  );
  if (!tokenResponse.ok) return { ok: false, error: 'spotify_token_exchange' };

  const parsed = tokenSchema.safeParse(
    await tokenResponse.json().catch(() => null)
  );
  return parsed.success
    ? { ok: true, tokenData: parsed.data }
    : { ok: false, error: 'spotify_token_invalid' };
}

function grantedSpotifyScopes(scopeText: string): string[] | null {
  const grantedScopes = scopeText.split(/\s+/).filter(Boolean);
  return SPOTIFY_OAUTH_SCOPES.every(scope => grantedScopes.includes(scope))
    ? grantedScopes
    : null;
}

async function upsertSpotifyConnectorAccount(input: {
  readonly userId: string;
  readonly providerAccountId: string;
  readonly grantedScopes: string[];
}): Promise<string> {
  const capabilities = {
    canRead: true,
    canPublishPlaylists: input.grantedScopes.includes('playlist-modify-public'),
    canUploadImages: input.grantedScopes.includes('ugc-image-upload'),
  };
  const [account] = await db
    .insert(connectorAccounts)
    .values({
      userId: input.userId,
      provider: CONNECTOR_PROVIDERS.spotify,
      providerAccountId: input.providerAccountId,
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
  if (!account) throw new Error('Spotify connector account write failed');
  return account.id;
}

async function markSpotifyConnectorNeedsReauth(accountId: string) {
  await db
    .update(connectorAccounts)
    .set({
      status: asConnectorStatusSql('needs_reauth'),
      lastErrorCode: 'spotify_oauth_failed',
      lastErrorUserMessage: 'Reconnect Spotify to finish connecting.',
      updatedAt: new Date(),
    })
    .where(eq(connectorAccounts.id, accountId))
    .catch(() => undefined);
}

function redactedCallbackError(error: unknown, accessToken: string): Error {
  const message =
    error instanceof Error ? error.message : 'Spotify OAuth callback failed';
  return new Error(
    accessToken ? message.replaceAll(accessToken, '[REDACTED]') : message
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  let returnTo: string = APP_ROUTES.SETTINGS_CONNECTORS;
  const fail = (error: string) => redirectWith(url.origin, returnTo, { error });
  if (url.searchParams.has('error')) return fail('spotify_oauth_denied');

  const code = url.searchParams.get('code');
  const stateParam = url.searchParams.get('state');
  if (!code || !stateParam) return fail('spotify_oauth_missing');

  let accountId: string | null = null;
  let accessToken = '';
  try {
    const state = verifyGoogleOAuthState(stateParam);
    returnTo =
      sanitizeRedirectUrl(state.returnTo) ?? APP_ROUTES.SETTINGS_CONNECTORS;

    const session = await getCachedAuth();
    if (!session.userId || session.userId !== state.userId)
      return fail('spotify_session_changed');

    const credentials = spotifyOAuthCredentials();
    if (!credentials) return fail('spotify_not_configured');

    const tokenExchange = await exchangeSpotifyTokens({
      code,
      origin: url.origin,
      ...credentials,
    });
    if (!tokenExchange.ok) return fail(tokenExchange.error);

    const tokenData = tokenExchange.tokenData;
    accessToken = tokenData.access_token;
    const grantedScopes = grantedSpotifyScopes(tokenData.scope);
    if (!grantedScopes) return fail('spotify_scopes');

    const profile = await getSpotifyAccountProfile({ accessToken });

    accountId = await upsertSpotifyConnectorAccount({
      userId: session.userId,
      providerAccountId: profile.id,
      grantedScopes,
    });
    await storeTokens({
      connectorAccountId: accountId,
      accessToken,
      refreshToken: tokenData.refresh_token,
      expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
    });
    return redirectWith(url.origin, returnTo, { connected: 'spotify' });
  } catch (error) {
    if (accountId) await markSpotifyConnectorNeedsReauth(accountId);
    await captureError(
      'Spotify OAuth callback failed',
      redactedCallbackError(error, accessToken)
    );
    return fail('spotify_oauth_callback');
  }
}
