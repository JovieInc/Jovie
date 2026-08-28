import 'server-only';

import { and, asc, eq, isNotNull, isNull, lt, or } from 'drizzle-orm';
import { asConnectorStatusSql } from '@/lib/connectors/db-expressions';
import { loadFreshGoogleAccessToken } from '@/lib/connectors/google-calendar/access-token';
import { CONNECTOR_PROVIDERS } from '@/lib/connectors/registry';
import { db } from '@/lib/db';
import { connectorAccounts } from '@/lib/db/schema/connectors';
import { captureError } from '@/lib/error-tracking';
import { reconcileApprovedYouTubeCollaborators } from '@/lib/library/graph-store';
import { syncChannelVideos } from '@/lib/youtube-library/sync';
import { createYouTubeLibraryProvider } from './provider';

const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;
const MAX_CHANNELS_PER_RUN = 1;

export interface ConnectedYouTubeRefreshResult {
  readonly attempted: number;
  readonly synced: number;
  readonly needsReauth: number;
  readonly failed: number;
}

export async function runConnectedYouTubeRefreshes(
  now = new Date()
): Promise<ConnectedYouTubeRefreshResult> {
  const cutoff = new Date(now.getTime() - REFRESH_AFTER_MS);
  const accounts = await db
    .select({
      id: connectorAccounts.id,
      creatorProfileId: connectorAccounts.creatorProfileId,
      channelId: connectorAccounts.providerAccountId,
    })
    .from(connectorAccounts)
    .where(
      and(
        eq(connectorAccounts.provider, CONNECTOR_PROVIDERS.youtube),
        eq(connectorAccounts.status, 'connected'),
        isNotNull(connectorAccounts.creatorProfileId),
        or(
          isNull(connectorAccounts.lastSyncAt),
          lt(connectorAccounts.lastSyncAt, cutoff)
        )
      )
    )
    .orderBy(asc(connectorAccounts.lastSyncAt))
    .limit(MAX_CHANNELS_PER_RUN);

  let synced = 0;
  let needsReauth = 0;
  let failed = 0;
  for (const account of accounts) {
    if (!account.creatorProfileId) continue;
    try {
      const accessToken = await loadFreshGoogleAccessToken(account.id);
      if (!accessToken) {
        needsReauth++;
        await db
          .update(connectorAccounts)
          .set({
            status: asConnectorStatusSql('needs_reauth'),
            lastErrorCode: 'youtube_reauth_required',
            lastErrorUserMessage:
              'Reconnect YouTube to keep the Library in sync.',
            updatedAt: now,
          })
          .where(eq(connectorAccounts.id, account.id));
        continue;
      }
      await syncChannelVideos({
        creatorProfileId: account.creatorProfileId,
        channelId: account.channelId,
        provider: createYouTubeLibraryProvider({ accessToken }),
        now,
      });
      await reconcileApprovedYouTubeCollaborators(
        account.creatorProfileId,
        now
      );
      synced++;
      await db
        .update(connectorAccounts)
        .set({
          lastSyncAt: now,
          lastErrorCode: null,
          lastErrorDevMessage: null,
          lastErrorUserMessage: null,
          updatedAt: now,
        })
        .where(eq(connectorAccounts.id, account.id));
    } catch (error) {
      failed++;
      await captureError('Connected YouTube refresh failed', error, {
        connectorAccountId: account.id,
        creatorProfileId: account.creatorProfileId,
        channelId: account.channelId,
      });
    }
  }

  return { attempted: accounts.length, synced, needsReauth, failed };
}
