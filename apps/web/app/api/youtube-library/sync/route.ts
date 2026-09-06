import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCachedAuth } from '@/lib/auth/cached';
import { getExactProfileAccess } from '@/lib/auth/profile-access';
import { asConnectorStatusSql } from '@/lib/connectors/db-expressions';
import { loadFreshGoogleAccessToken } from '@/lib/connectors/google-calendar/access-token';
import { CONNECTOR_PROVIDERS } from '@/lib/connectors/registry';
import { RefreshLockBusyError } from '@/lib/connectors/token-vault';
import { createYouTubeLibraryProvider } from '@/lib/connectors/youtube/provider';
import { YOUTUBE_OAUTH_SCOPES } from '@/lib/connectors/youtube/scopes';
import { db } from '@/lib/db';
import { connectorAccounts } from '@/lib/db/schema/connectors';
import { captureError } from '@/lib/error-tracking';
import { reconcileApprovedYouTubeCollaborators } from '@/lib/library/graph-store';
import { syncChannelVideos } from '@/lib/youtube-library/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ creatorProfileId: z.string().uuid() });
const REFRESH_BUSY_RETRY_AFTER_SECONDS = 5;

export async function POST(request: Request) {
  const { userId } = await getCachedAuth();
  if (!userId)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  const profileId = parsed.data.creatorProfileId;
  const access = await getExactProfileAccess(db, userId, profileId);
  if (!access.ok)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const [account] = await db
    .select({
      id: connectorAccounts.id,
      channelId: connectorAccounts.providerAccountId,
      scopes: connectorAccounts.scopes,
    })
    .from(connectorAccounts)
    .where(
      and(
        eq(connectorAccounts.userId, userId),
        eq(connectorAccounts.creatorProfileId, profileId),
        eq(connectorAccounts.provider, CONNECTOR_PROVIDERS.youtube),
        eq(connectorAccounts.status, 'connected')
      )
    )
    .limit(1);
  if (!account)
    return NextResponse.json(
      { error: 'YouTube is not connected' },
      { status: 409 }
    );
  const accountId = account.id;
  const channelId = account.channelId;
  const grantedScopes = account.scopes;
  if (!YOUTUBE_OAUTH_SCOPES.every(scope => grantedScopes.includes(scope))) {
    return NextResponse.json(
      { error: 'Reconnect YouTube to refresh access' },
      { status: 409 }
    );
  }

  let accessToken: string | null = null;
  try {
    accessToken = await loadFreshGoogleAccessToken(accountId);
    if (!accessToken) {
      await db
        .update(connectorAccounts)
        .set({
          status: asConnectorStatusSql('needs_reauth'),
          lastErrorCode: 'youtube_reauth_required',
          lastErrorUserMessage: 'Reconnect YouTube to refresh access.',
          updatedAt: new Date(),
        })
        .where(eq(connectorAccounts.id, accountId));
      return NextResponse.json(
        { error: 'Reconnect YouTube to refresh access' },
        { status: 409 }
      );
    }
    const now = new Date();
    const result = await syncChannelVideos({
      creatorProfileId: profileId,
      channelId,
      provider: createYouTubeLibraryProvider({ accessToken }),
      now,
    });
    try {
      await reconcileApprovedYouTubeCollaborators(profileId, now);
    } catch (error) {
      await captureError('YouTube collaborator reconcile failed', error, {
        route: '/api/youtube-library/sync',
        method: 'POST',
      });
    }
    await db
      .update(connectorAccounts)
      .set({
        lastSyncAt: now,
        lastErrorCode: null,
        lastErrorDevMessage: null,
        lastErrorUserMessage: null,
        updatedAt: now,
      })
      .where(eq(connectorAccounts.id, accountId))
      .catch(() => undefined);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RefreshLockBusyError) {
      return NextResponse.json(
        { error: 'YouTube token refresh is already in progress' },
        {
          status: 503,
          headers: {
            'Retry-After': String(REFRESH_BUSY_RETRY_AFTER_SECONDS),
          },
        }
      );
    }

    const message =
      error instanceof Error ? error.message : 'Unknown YouTube sync error';
    const safe = accessToken
      ? message.replaceAll(accessToken, '[REDACTED]')
      : message;
    await db
      .update(connectorAccounts)
      .set({
        lastErrorCode: 'youtube_sync_failed',
        lastErrorDevMessage: safe,
        lastErrorUserMessage:
          'YouTube could not be synced. Try again or reconnect the channel.',
        updatedAt: new Date(),
      })
      .where(eq(connectorAccounts.id, accountId))
      .catch(() => undefined);
    await captureError('YouTube Library manual sync failed', new Error(safe));
    return NextResponse.json({ error: 'YouTube sync failed' }, { status: 502 });
  }
}
