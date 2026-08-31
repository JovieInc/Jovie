import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getCachedAuth } from '@/lib/auth/cached';
import { sanitizeRedirectUrl } from '@/lib/auth/constants';
import { getExactProfileAccess } from '@/lib/auth/profile-access';
import { asConnectorStatusSql } from '@/lib/connectors/db-expressions';
import { verifyGoogleOAuthState } from '@/lib/connectors/google-calendar/oauth-state';
import { CONNECTOR_PROVIDERS } from '@/lib/connectors/registry';
import { storeTokens } from '@/lib/connectors/token-vault';
import {
  createYouTubeLibraryProvider,
  listOwnedYouTubeChannels,
} from '@/lib/connectors/youtube/provider';
import { db } from '@/lib/db';
import { connectorAccounts } from '@/lib/db/schema/connectors';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { serverFetch } from '@/lib/http/server-fetch';
import { reconcileApprovedYouTubeCollaborators } from '@/lib/library/graph-store';
import { logger } from '@/lib/utils/logger';
import { syncChannelVideos } from '@/lib/youtube-library/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface GoogleTokenResponse {
  readonly access_token: string;
  readonly refresh_token?: string;
  readonly expires_in: number;
  readonly scope: string;
}

function redirectWith(
  origin: string,
  returnTo: string,
  values: Record<string, string>
) {
  const target = new URL(
    sanitizeRedirectUrl(returnTo) ?? '/app/library',
    origin
  );
  for (const [key, value] of Object.entries(values)) {
    target.searchParams.set(key, value);
  }
  return NextResponse.redirect(target, { status: 302 });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const stateParam = url.searchParams.get('state');
  const providerError = url.searchParams.get('error');
  if (providerError) {
    return redirectWith(url.origin, '/app/library', {
      error: 'youtube_oauth_denied',
    });
  }
  if (!code || !stateParam) {
    return redirectWith(url.origin, '/app/library', {
      error: 'youtube_oauth_missing',
    });
  }

  let returnTo = '/app/library';
  try {
    const state = verifyGoogleOAuthState(stateParam);
    returnTo = sanitizeRedirectUrl(state.returnTo) ?? '/app/library';
    if (!state.creatorProfileId) {
      return redirectWith(url.origin, returnTo, {
        error: 'youtube_profile_missing',
      });
    }
    const { userId } = await getCachedAuth();
    if (!userId || userId !== state.userId) {
      return redirectWith(url.origin, returnTo, {
        error: 'youtube_session_changed',
      });
    }
    const access = await getExactProfileAccess(
      db,
      userId,
      state.creatorProfileId
    );
    if (!access.ok) {
      return redirectWith(url.origin, returnTo, {
        error: 'youtube_profile_access',
      });
    }

    const redirectUri = `${env.YOUTUBE_OAUTH_REDIRECT_URI_BASE ?? `${url.origin}/api/connectors/youtube`}/callback`;
    const tokenResponse = await serverFetch(
      'https://oauth2.googleapis.com/token',
      {
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
      }
    );
    if (!tokenResponse.ok) {
      return redirectWith(url.origin, returnTo, {
        error: 'youtube_token_exchange',
      });
    }
    const tokens = (await tokenResponse.json()) as GoogleTokenResponse;
    const channels = await listOwnedYouTubeChannels({
      accessToken: tokens.access_token,
    });
    if (channels.length !== 1) {
      return redirectWith(url.origin, returnTo, {
        error:
          channels.length === 0
            ? 'youtube_no_channel'
            : 'youtube_channel_choice',
      });
    }
    const channel = channels[0];
    const grantedScopes = tokens.scope.split(' ').filter(Boolean);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    const [account] = await db
      .insert(connectorAccounts)
      .values({
        userId,
        creatorProfileId: state.creatorProfileId,
        provider: CONNECTOR_PROVIDERS.youtube,
        providerAccountId: channel.id,
        status: asConnectorStatusSql('connected'),
        scopes: grantedScopes,
        capabilities: {
          canRead: true,
          canAnalytics: grantedScopes.includes(
            'https://www.googleapis.com/auth/yt-analytics.readonly'
          ),
          channelTitle: channel.title,
        },
      })
      .onConflictDoUpdate({
        target: [
          connectorAccounts.userId,
          connectorAccounts.provider,
          connectorAccounts.providerAccountId,
        ],
        set: {
          creatorProfileId: state.creatorProfileId,
          status: asConnectorStatusSql('connected'),
          scopes: grantedScopes,
          capabilities: {
            canRead: true,
            canAnalytics: grantedScopes.includes(
              'https://www.googleapis.com/auth/yt-analytics.readonly'
            ),
            channelTitle: channel.title,
          },
          lastErrorCode: null,
          lastErrorDevMessage: null,
          lastErrorUserMessage: null,
          updatedAt: new Date(),
        },
      })
      .returning({ id: connectorAccounts.id });
    if (!account) throw new Error('Failed to upsert YouTube connector account');
    await storeTokens({
      connectorAccountId: account.id,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
    });

    const sync = await syncChannelVideos({
      creatorProfileId: state.creatorProfileId,
      channelId: channel.id,
      provider: createYouTubeLibraryProvider({
        accessToken: tokens.access_token,
      }),
    });
    await reconcileApprovedYouTubeCollaborators(state.creatorProfileId);
    await db
      .update(connectorAccounts)
      .set({ lastSyncAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(connectorAccounts.id, account.id),
          eq(connectorAccounts.userId, userId)
        )
      );
    return redirectWith(url.origin, returnTo, {
      connected: 'youtube',
      imported: String(sync.total),
    });
  } catch (error) {
    logger.error('[connectors/youtube/callback] Unexpected error', { error });
    await captureError('YouTube OAuth callback failed', error, {
      route: '/api/connectors/youtube/callback',
      method: 'GET',
    });
    return redirectWith(url.origin, returnTo, {
      error: 'youtube_oauth_callback',
    });
  }
}
