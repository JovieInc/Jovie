import { NextResponse } from 'next/server';
import { APP_ROUTES } from '@/constants/routes';
import { asConnectorStatusSql } from '@/lib/connectors/db-expressions';
import { verifyGoogleOAuthState } from '@/lib/connectors/google-calendar/oauth-state';
import {
  CONNECTOR_PROVIDERS,
  GOOGLE_OAUTH_SCOPE,
} from '@/lib/connectors/registry';
import { storeTokens } from '@/lib/connectors/token-vault';
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

interface GoogleUserInfoResponse {
  email: string;
  sub: string;
}

/**
 * GET /api/connectors/google/callback
 *
 * Receives the Google authorization code, exchanges for tokens,
 * resolves the Gmail address (providerAccountId), and persists
 * both Gmail + Calendar connector accounts with encrypted tokens.
 *
 * On success: redirects to returnTo from the state token.
 * On error: redirects to settings/connectors with error param.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const stateParam = searchParams.get('state');
  const errorParam = searchParams.get('error');

  const settingsUrl = `${origin}${APP_ROUTES.SETTINGS_CONNECTORS}`;

  if (errorParam) {
    logger.error('[connectors/google/callback] OAuth provider error', {
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

    const redirectUri = `${env.GOOGLE_OAUTH_REDIRECT_URI_BASE ?? origin + '/api/connectors/google'}/callback`;

    // Exchange authorization code for tokens.
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
      context: 'Google token exchange',
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text().catch(() => 'unknown');
      logger.error('[connectors/google/callback] Token exchange failed', {
        status: tokenRes.status,
        body,
      });
      return NextResponse.redirect(`${settingsUrl}?error=token_exchange`, {
        status: 302,
      });
    }

    const tokens = (await tokenRes.json()) as GoogleTokenResponse;

    // Fetch the authenticated Gmail address to use as providerAccountId.
    const userInfoRes = await serverFetch(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        timeoutMs: 8_000,
        context: 'Google userinfo',
      }
    );

    if (!userInfoRes.ok) {
      logger.error('[connectors/google/callback] Userinfo fetch failed', {
        status: userInfoRes.status,
      });
      return NextResponse.redirect(`${settingsUrl}?error=userinfo`, {
        status: 302,
      });
    }

    const userInfo = (await userInfoRes.json()) as GoogleUserInfoResponse;
    const gmailAddress = userInfo.email;
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    const grantedScopes = tokens.scope.split(' ');
    // "Connected" must mean the integration can perform its read operation,
    // not merely that tokens were stored. Google consent can grant only a
    // subset of requested scopes, so derive each provider's status and
    // capabilities from the granted scopes instead of assuming success.
    const gmailCanRead = grantedScopes.includes(
      GOOGLE_OAUTH_SCOPE.gmailReadonly
    );
    const calendarCanRead = grantedScopes.includes(
      GOOGLE_OAUTH_SCOPE.calendarEventsReadonly
    );
    const canWrite =
      calendarCanRead &&
      grantedScopes.includes(GOOGLE_OAUTH_SCOPE.calendarEvents);
    const missingScopeMessage = (label: string) =>
      `Google did not grant ${label} access. Reconnect and allow ${label} read access.`;

    // Upsert gmail connector account using sql cast for enum.
    const [gmailAccount] = await db
      .insert(connectorAccounts)
      .values({
        userId,
        provider: CONNECTOR_PROVIDERS.gmail,
        providerAccountId: gmailAddress,
        status: asConnectorStatusSql(
          gmailCanRead ? 'connected' : 'needs_reauth'
        ),
        scopes: grantedScopes,
        capabilities: { canRead: gmailCanRead },
        ...(gmailCanRead
          ? {}
          : {
              lastErrorCode: 'missing_scope',
              lastErrorUserMessage: missingScopeMessage('Gmail'),
            }),
      })
      .onConflictDoUpdate({
        target: [
          connectorAccounts.userId,
          connectorAccounts.provider,
          connectorAccounts.providerAccountId,
        ],
        set: {
          status: asConnectorStatusSql(
            gmailCanRead ? 'connected' : 'needs_reauth'
          ),
          scopes: grantedScopes,
          capabilities: { canRead: gmailCanRead },
          lastErrorCode: gmailCanRead ? null : 'missing_scope',
          lastErrorDevMessage: null,
          lastErrorUserMessage: gmailCanRead
            ? null
            : missingScopeMessage('Gmail'),
          updatedAt: new Date(),
        },
      })
      .returning({ id: connectorAccounts.id });

    if (!gmailAccount) {
      throw new Error('Failed to upsert Gmail connector account');
    }

    await storeTokens({
      connectorAccountId: gmailAccount.id,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
    });

    // Upsert google_calendar connector account — shares the same email identity.
    const [calendarAccount] = await db
      .insert(connectorAccounts)
      .values({
        userId,
        provider: CONNECTOR_PROVIDERS.google_calendar,
        providerAccountId: gmailAddress,
        status: asConnectorStatusSql(
          calendarCanRead ? 'connected' : 'needs_reauth'
        ),
        scopes: grantedScopes,
        capabilities: { canRead: calendarCanRead, canWrite },
        ...(calendarCanRead
          ? {}
          : {
              lastErrorCode: 'missing_scope',
              lastErrorUserMessage: missingScopeMessage('Google Calendar'),
            }),
      })
      .onConflictDoUpdate({
        target: [
          connectorAccounts.userId,
          connectorAccounts.provider,
          connectorAccounts.providerAccountId,
        ],
        set: {
          status: asConnectorStatusSql(
            calendarCanRead ? 'connected' : 'needs_reauth'
          ),
          scopes: grantedScopes,
          capabilities: { canRead: calendarCanRead, canWrite },
          lastErrorCode: calendarCanRead ? null : 'missing_scope',
          lastErrorDevMessage: null,
          lastErrorUserMessage: calendarCanRead
            ? null
            : missingScopeMessage('Google Calendar'),
          updatedAt: new Date(),
        },
      })
      .returning({ id: connectorAccounts.id });

    if (!calendarAccount) {
      throw new Error('Failed to upsert Calendar connector account');
    }

    await storeTokens({
      connectorAccountId: calendarAccount.id,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
    });

    const redirectTarget = returnTo.startsWith('/')
      ? `${origin}${returnTo}`
      : returnTo;
    if (!gmailCanRead && !calendarCanRead) {
      return NextResponse.redirect(`${settingsUrl}?error=missing_scopes`, {
        status: 302,
      });
    }
    return NextResponse.redirect(`${redirectTarget}?connected=google`, {
      status: 302,
    });
  } catch (error) {
    logger.error('[connectors/google/callback] Unexpected error', { error });
    await captureError('Google OAuth callback failed', error, {
      route: '/api/connectors/google/callback',
      method: 'GET',
    });
    return NextResponse.redirect(`${settingsUrl}?error=oauth_callback`, {
      status: 302,
    });
  }
}
