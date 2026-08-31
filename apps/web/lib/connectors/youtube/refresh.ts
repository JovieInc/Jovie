import 'server-only';

import { and, asc, eq, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { asConnectorStatusSql } from '@/lib/connectors/db-expressions';
import { loadFreshGoogleAccessToken } from '@/lib/connectors/google-calendar/access-token';
import { CONNECTOR_PROVIDERS } from '@/lib/connectors/registry';
import { db } from '@/lib/db';
import {
  connectorAccounts,
  connectorSyncStates,
} from '@/lib/db/schema/connectors';
import { captureError } from '@/lib/error-tracking';
import { reconcileApprovedYouTubeCollaborators } from '@/lib/library/graph-store';
import {
  type SyncChannelVideosResult,
  syncChannelVideos,
} from '@/lib/youtube-library/sync';
import { createYouTubeLibraryProvider } from './provider';

const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;
const FAILURE_BACKOFF_MS = 60 * 60 * 1000;
const MAX_CHANNELS_PER_RUN = 1;
const MAX_SCHEDULED_VIDEO_IDS = 50;
const SYNC_LOCK_DURATION_MS = 10 * 60 * 1000;
const SYNC_LOCK_RESOURCE_KIND = 'youtube_library_refresh';

const FAILURE_CAPTURE_MESSAGES = {
  manual: 'YouTube Library manual sync failed',
  scheduled: 'Connected YouTube refresh failed',
} as const;

export interface ConnectedYouTubeRefreshResult {
  readonly attempted: number;
  readonly synced: number;
  readonly needsReauth: number;
  readonly failed: number;
  readonly skipped: number;
}

export type ConnectedYouTubeRefreshSource =
  keyof typeof FAILURE_CAPTURE_MESSAGES;

export type ConnectedYouTubeRefreshOutcome =
  | { readonly status: 'synced'; readonly result: SyncChannelVideosResult }
  | { readonly status: 'needs_reauth' }
  | { readonly status: 'failed'; readonly error: unknown }
  | { readonly status: 'busy' };

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown YouTube sync error';
}

async function acquireYouTubeLibrarySyncLock(
  connectorAccountId: string,
  now: Date
): Promise<boolean> {
  await db
    .insert(connectorSyncStates)
    .values({
      connectorAccountId,
      resourceKind: SYNC_LOCK_RESOURCE_KIND,
      tokenRefreshLockedUntil: null,
    })
    .onConflictDoNothing();

  const lockedUntil = new Date(now.getTime() + SYNC_LOCK_DURATION_MS);
  const acquired = await db
    .update(connectorSyncStates)
    .set({ tokenRefreshLockedUntil: lockedUntil })
    .where(
      and(
        eq(connectorSyncStates.connectorAccountId, connectorAccountId),
        eq(connectorSyncStates.resourceKind, SYNC_LOCK_RESOURCE_KIND),
        or(
          isNull(connectorSyncStates.tokenRefreshLockedUntil),
          lt(connectorSyncStates.tokenRefreshLockedUntil, now)
        )
      )
    )
    .returning({ id: connectorSyncStates.id });

  return acquired.length > 0;
}

async function releaseYouTubeLibrarySyncLock(
  connectorAccountId: string
): Promise<void> {
  try {
    await db
      .update(connectorSyncStates)
      .set({ tokenRefreshLockedUntil: null })
      .where(
        and(
          eq(connectorSyncStates.connectorAccountId, connectorAccountId),
          eq(connectorSyncStates.resourceKind, SYNC_LOCK_RESOURCE_KIND)
        )
      );
  } catch {
    // Lock expiry is the fallback if best-effort release fails.
  }
}

export async function refreshConnectedYouTubeAccount(input: {
  readonly connectorAccountId: string;
  readonly creatorProfileId: string;
  readonly channelId: string;
  readonly source: ConnectedYouTubeRefreshSource;
  readonly now?: Date;
}): Promise<ConnectedYouTubeRefreshOutcome> {
  const now = input.now ?? new Date();
  let lockAcquired = false;

  try {
    lockAcquired = await acquireYouTubeLibrarySyncLock(
      input.connectorAccountId,
      now
    );
    if (!lockAcquired) {
      return { status: 'busy' };
    }

    const accessToken = await loadFreshGoogleAccessToken(
      input.connectorAccountId
    );
    if (!accessToken) {
      await db
        .update(connectorAccounts)
        .set({
          status: asConnectorStatusSql('needs_reauth'),
          lastErrorCode: 'youtube_reauth_required',
          lastErrorDevMessage: null,
          lastErrorUserMessage:
            'Reconnect YouTube to keep the Library in sync.',
          updatedAt: now,
        })
        .where(eq(connectorAccounts.id, input.connectorAccountId));
      return { status: 'needs_reauth' };
    }

    const result = await syncChannelVideos({
      creatorProfileId: input.creatorProfileId,
      channelId: input.channelId,
      provider: createYouTubeLibraryProvider({
        accessToken,
        maxVideosPerSync:
          input.source === 'scheduled' ? MAX_SCHEDULED_VIDEO_IDS : undefined,
      }),
      now,
    });
    await reconcileApprovedYouTubeCollaborators(input.creatorProfileId, now);
    await db
      .update(connectorAccounts)
      .set({
        lastSyncAt: now,
        lastErrorCode: null,
        lastErrorDevMessage: null,
        lastErrorUserMessage: null,
        updatedAt: now,
      })
      .where(eq(connectorAccounts.id, input.connectorAccountId));
    return { status: 'synced', result };
  } catch (error) {
    await db
      .update(connectorAccounts)
      .set({
        lastErrorCode: 'youtube_sync_failed',
        lastErrorDevMessage: getErrorMessage(error),
        lastErrorUserMessage:
          'YouTube could not be synced. Reconnect the channel and try again.',
        updatedAt: now,
      })
      .where(eq(connectorAccounts.id, input.connectorAccountId));
    await captureError(FAILURE_CAPTURE_MESSAGES[input.source], error, {
      connectorAccountId: input.connectorAccountId,
      creatorProfileId: input.creatorProfileId,
      channelId: input.channelId,
    });
    return { status: 'failed', error };
  } finally {
    if (lockAcquired) {
      await releaseYouTubeLibrarySyncLock(input.connectorAccountId);
    }
  }
}

export async function runConnectedYouTubeRefreshes(
  now = new Date()
): Promise<ConnectedYouTubeRefreshResult> {
  const cutoff = new Date(now.getTime() - REFRESH_AFTER_MS);
  const failureRetryCutoff = new Date(now.getTime() - FAILURE_BACKOFF_MS);
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
          isNull(connectorAccounts.lastErrorCode),
          lt(connectorAccounts.updatedAt, failureRetryCutoff)
        ),
        or(
          isNull(connectorAccounts.lastSyncAt),
          lt(connectorAccounts.lastSyncAt, cutoff)
        )
      )
    )
    // PostgreSQL sorts NULL last by default, but never-synced accounts should refresh first.
    .orderBy(
      sql`${connectorAccounts.lastSyncAt} is not null`,
      asc(connectorAccounts.lastSyncAt)
    )
    .limit(MAX_CHANNELS_PER_RUN);

  let synced = 0;
  let needsReauth = 0;
  let failed = 0;
  let skipped = 0;
  for (const account of accounts) {
    if (!account.creatorProfileId) {
      failed++;
      await captureError(
        'Connected YouTube refresh selected an account without a profile',
        new Error('YouTube connector account missing creatorProfileId'),
        { connectorAccountId: account.id, channelId: account.channelId }
      );
      continue;
    }
    const outcome = await refreshConnectedYouTubeAccount({
      connectorAccountId: account.id,
      creatorProfileId: account.creatorProfileId,
      channelId: account.channelId,
      source: 'scheduled',
      now,
    });
    if (outcome.status === 'synced') {
      synced++;
    } else if (outcome.status === 'needs_reauth') {
      needsReauth++;
    } else if (outcome.status === 'busy') {
      skipped++;
    } else {
      failed++;
    }
  }

  return { attempted: accounts.length, synced, needsReauth, failed, skipped };
}
