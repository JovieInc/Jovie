import { NextResponse } from 'next/server';
import { APP_ROUTES } from '@/constants/routes';
import { asConnectorStatusSql } from '@/lib/connectors/db-expressions';
import { verifyGoogleOAuthState } from '@/lib/connectors/google-calendar/oauth-state';
import { CONNECTOR_PROVIDERS } from '@/lib/connectors/registry';
import { storeTokens } from '@/lib/connectors/token-vault';
import {
  hasYouTubeThumbnailUploadScope,
  parseYouTubeChannelIdentity,
} from '@/lib/connectors/youtube/scopes';
import { db } from '@/lib/db';
import { connectorAccounts } from '@/lib/db/schema/connectors';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { serverFetch } from '@/lib/http/server-fetch';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
  id_token?: string;
}

/**
 * GET /api/connectors/youtube/callback
 *
 * Exchanges the authorization code, resolves channel id as providerAccountId,
 * and persists encrypted tokens in the token vault.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const stateParam = searchParams.get('state');
  const errorParam = searchParams.get('error');

  const settingsUrl = `${origin}${APP_ROUTES.SETTINGS_CONNECTORS}`;

  if (errorParam) {
    logger.error('[connectors/youtube/callback] OAuth provider error', {
      errorParam,
    });
    return NextResponse.redirect(`${settingsUrl}?error=oauth_denied`, {
      status: 302,
    });
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(`${settingsUrl}?error=oauth_missing_params`, {
      status: 302,
    });
  }

  try {
    const state = verifyGoogleOAuthState(stateParam);
    const { userId, returnTo } = state;

    const redirectUri = `${
      env.YOUTUBE_OAUTH_REDIRECT_URI_BASE ?? `${origin}/api/connectors/youtube`
    }/callback`;

    const tokenRes = await serverFetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_OAUTH_CLIENT_ID ?? '',
        client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
      timeoutMs: 10_000,
      context: 'YouTube token exchange',
    });

    if (!tokenRes.ok) {
      logger.error('[connectors/youtube/callback] Token exchange failed', {
        status: tokenRes.status,
      });
      return NextResponse.redirect(`${settingsUrl}?error=token_exchange`, {
        status: 302,
      });
    }

    const tokens = (await tokenRes.json()) as GoogleTokenResponse;
    const grantedScopes = tokens.scope.split(' ').filter(Boolean);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // Fail closed unless Google confirms the exact channel owned by this token.
    let providerAccountId: string | null = null;
    let channelTitle: string | null = null;

    const channelRes = await serverFetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true&maxResults=1',
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        timeoutMs: 10_000,
        context: 'YouTube channel identity',
      }
    );

    if (channelRes.ok) {
      const channel = parseYouTubeChannelIdentity(await channelRes.json());
      if (channel) {
        providerAccountId = channel.id;
        channelTitle = channel.title;
      }
    }

    if (!providerAccountId) {
      logger.error(
        '[connectors/youtube/callback] Could not resolve channel/user identity'
      );
      return NextResponse.redirect(`${settingsUrl}?error=channel_identity`, {
        status: 302,
      });
    }

    const canUpload = hasYouTubeThumbnailUploadScope(grantedScopes);
    const [account] = await db
      .insert(connectorAccounts)
      .values({
        userId,
        provider: CONNECTOR_PROVIDERS.youtube,
        providerAccountId,
        status: asConnectorStatusSql('connected'),
        scopes: grantedScopes,
        capabilities: {
          canRead: true,
          canUploadThumbnails: canUpload,
          channelTitle,
        },
      })
      .onConflictDoUpdate({
        target: [
          connectorAccounts.userId,
          connectorAccounts.provider,
          connectorAccounts.providerAccountId,
        ],
        set: {
          status: asConnectorStatusSql('connected'),
          scopes: grantedScopes,
          capabilities: {
            canRead: true,
            canUploadThumbnails: canUpload,
            channelTitle,
          },
          lastErrorCode: null,
          lastErrorDevMessage: null,
          lastErrorUserMessage: null,
          updatedAt: new Date(),
        },
      })
      .returning({ id: connectorAccounts.id });

    if (!account) {
      throw new Error('Failed to upsert YouTube connector account');
    }

    await storeTokens({
      connectorAccountId: account.id,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
    });

    const redirectTarget =
      returnTo.startsWith('/') && !returnTo.startsWith('//')
        ? `${origin}${returnTo}`
        : settingsUrl;
    return NextResponse.redirect(`${redirectTarget}?connected=youtube`, {
      status: 302,
    });
  } catch (error) {
    logger.error('[connectors/youtube/callback] Unexpected error', { error });
    await captureError('YouTube OAuth callback failed', error, {
      route: '/api/connectors/youtube/callback',
      method: 'GET',
    });
    return NextResponse.redirect(`${settingsUrl}?error=oauth_callback`, {
      status: 302,
    });
  }
}
