/**
 * Resumable YouTube channel → Library import (JOV-5352).
 *
 * Reuses `syncChannelVideos` for persistence. Cursor + counts live on
 * `connector_sync_states` (`youtube_channel_uploads`) so resume needs no
 * schema change.
 */

import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { CONNECTOR_PROVIDERS } from '@/lib/connectors/registry';
import { YouTubeProviderError } from '@/lib/connectors/youtube/provider';
import { db } from '@/lib/db';
import {
  connectorAccounts,
  connectorSyncStates,
} from '@/lib/db/schema/connectors';
import type { ConnectorDbStatus } from '@/lib/db/schema/enums';
import { youtubeVideos } from '@/lib/db/schema/youtube-library';
import {
  addYouTubeImportReason,
  cursorBelongsToAnotherChannel,
  emptyYouTubeImportCounts,
  parseYouTubeImportCursor,
  resolveYouTubeImportSurface,
  YOUTUBE_IMPORT_CURSOR_VERSION,
  YOUTUBE_UPLOADS_RESOURCE_KIND,
  type YouTubeImportAccountView,
  type YouTubeImportCounts,
  type YouTubeImportCursor,
  type YouTubeImportReason,
  type YouTubeImportReasonCode,
  type YouTubeImportSnapshot,
} from './import-status';
import {
  type SyncChannelVideosInput,
  type SyncChannelVideosResult,
  syncChannelVideos,
} from './sync';
import type { YouTubeLibraryProvider } from './types';

export interface YouTubeImportAccountRecord extends YouTubeImportAccountView {
  readonly id: string;
  readonly scopes: readonly string[];
}

export interface YouTubeImportStore {
  loadAccounts(
    userId: string,
    creatorProfileId: string
  ): Promise<YouTubeImportAccountRecord[]>;
  loadCursor(accountId: string): Promise<unknown>;
  saveCursor(accountId: string, cursor: YouTubeImportCursor): Promise<void>;
  markAccount(
    accountId: string,
    patch: {
      readonly lastSyncAt?: Date | null;
      readonly lastErrorCode?: string | null;
      readonly lastErrorUserMessage?: string | null;
      readonly status?: ConnectorDbStatus;
    }
  ): Promise<void>;
  countVideos?(creatorProfileId: string, channelId: string): Promise<number>;
}

function channelTitleFrom(capabilities: unknown): string | null {
  if (!capabilities || typeof capabilities !== 'object') return null;
  const title = (capabilities as { channelTitle?: unknown }).channelTitle;
  return typeof title === 'string' && title.trim() ? title.trim() : null;
}

export const drizzleYouTubeImportStore: YouTubeImportStore = {
  async loadAccounts(userId, creatorProfileId) {
    const rows = await db
      .select({
        id: connectorAccounts.id,
        status: connectorAccounts.status,
        channelId: connectorAccounts.providerAccountId,
        scopes: connectorAccounts.scopes,
        lastSyncAt: connectorAccounts.lastSyncAt,
        lastErrorCode: connectorAccounts.lastErrorCode,
        lastErrorUserMessage: connectorAccounts.lastErrorUserMessage,
        capabilities: connectorAccounts.capabilities,
      })
      .from(connectorAccounts)
      .where(
        and(
          eq(connectorAccounts.userId, userId),
          eq(connectorAccounts.creatorProfileId, creatorProfileId),
          eq(connectorAccounts.provider, CONNECTOR_PROVIDERS.youtube)
        )
      );
    return rows.map(row => ({
      id: row.id,
      status: row.status,
      channelId: row.channelId,
      scopes: row.scopes,
      lastSyncAt: row.lastSyncAt,
      lastErrorCode: row.lastErrorCode,
      lastErrorUserMessage: row.lastErrorUserMessage,
      providerTitle: channelTitleFrom(row.capabilities),
    }));
  },

  async loadCursor(accountId) {
    const [row] = await db
      .select({ cursor: connectorSyncStates.cursor })
      .from(connectorSyncStates)
      .where(
        and(
          eq(connectorSyncStates.connectorAccountId, accountId),
          eq(connectorSyncStates.resourceKind, YOUTUBE_UPLOADS_RESOURCE_KIND)
        )
      )
      .limit(1);
    return row?.cursor ?? null;
  },

  async saveCursor(accountId, cursor) {
    const now = cursor.lastSuccessfulObservationAt
      ? new Date(cursor.lastSuccessfulObservationAt)
      : new Date();
    await db
      .insert(connectorSyncStates)
      .values({
        connectorAccountId: accountId,
        resourceKind: YOUTUBE_UPLOADS_RESOURCE_KIND,
        cursor,
        lastIncrementalSyncAt: now,
        lastFullSyncAt: cursor.complete ? now : null,
      })
      .onConflictDoUpdate({
        target: [
          connectorSyncStates.connectorAccountId,
          connectorSyncStates.resourceKind,
        ],
        set: {
          cursor,
          lastIncrementalSyncAt: now,
          ...(cursor.complete ? { lastFullSyncAt: now } : {}),
        },
      });
  },

  async markAccount(accountId, patch) {
    await db
      .update(connectorAccounts)
      .set({
        ...(patch.lastSyncAt !== undefined
          ? { lastSyncAt: patch.lastSyncAt }
          : {}),
        ...(patch.lastErrorCode !== undefined
          ? { lastErrorCode: patch.lastErrorCode }
          : {}),
        ...(patch.lastErrorUserMessage !== undefined
          ? { lastErrorUserMessage: patch.lastErrorUserMessage }
          : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        updatedAt: new Date(),
      })
      .where(eq(connectorAccounts.id, accountId));
  },

  async countVideos(creatorProfileId, channelId) {
    const [row] = await db
      .select({ count: drizzleSql<number>`count(*)::int` })
      .from(youtubeVideos)
      .where(
        and(
          eq(youtubeVideos.creatorProfileId, creatorProfileId),
          eq(youtubeVideos.channelId, channelId)
        )
      );
    return Number(row?.count ?? 0);
  },
};

function snapshotFromAccounts(input: {
  readonly accounts: readonly YouTubeImportAccountView[];
  readonly cursor?: YouTubeImportCursor | null;
  readonly localVideoCount?: number;
  readonly identity?: YouTubeImportSnapshot['identity'];
}): YouTubeImportSnapshot {
  const snapshot = resolveYouTubeImportSurface(input);
  if (!input.identity) return snapshot;
  return { ...snapshot, identity: input.identity };
}

export async function loadYouTubeImportSnapshot(input: {
  readonly userId: string;
  readonly creatorProfileId: string;
  readonly store?: YouTubeImportStore;
}): Promise<YouTubeImportSnapshot> {
  const store = input.store ?? drizzleYouTubeImportStore;
  const accounts = await store.loadAccounts(
    input.userId,
    input.creatorProfileId
  );
  const connected = accounts.filter(
    account => account.status === 'connected' || account.status === 'error'
  );
  if (connected.length !== 1) {
    return snapshotFromAccounts({ accounts });
  }
  const account = connected[0];
  const rawCursor = await store.loadCursor(account.id);
  if (cursorBelongsToAnotherChannel(rawCursor, account.channelId)) {
    return snapshotFromAccounts({
      accounts,
      identity: 'mismatch',
      localVideoCount: 0,
    });
  }
  const cursor = parseYouTubeImportCursor(rawCursor, account.channelId);
  const localVideoCount = store.countVideos
    ? await store.countVideos(input.creatorProfileId, account.channelId)
    : 0;
  return snapshotFromAccounts({ accounts, cursor, localVideoCount });
}

function isQuotaError(error: unknown): boolean {
  if (!(error instanceof YouTubeProviderError)) return false;
  if (error.status === 429) return true;
  const reason = error.reason?.toLowerCase() ?? '';
  return (
    reason === 'quotaexceeded' ||
    reason === 'ratelimitexceeded' ||
    reason === 'resource_exhausted'
  );
}

function skipReasonCode(
  reason: 'wrong_channel' | 'missing_id'
): YouTubeImportReasonCode {
  return reason === 'wrong_channel' ? 'wrong_channel' : 'missing_id';
}

function mergeCounts(
  base: YouTubeImportCounts,
  page: {
    readonly discovered: number;
    readonly imported: number;
    readonly skipped: number;
    readonly failed: number;
    readonly updated: number;
  }
): YouTubeImportCounts {
  return {
    discovered: base.discovered + page.discovered,
    imported: base.imported + page.imported,
    skipped: base.skipped + page.skipped,
    failed: base.failed + page.failed,
    updated: base.updated + page.updated,
  };
}

export async function importYouTubeChannelPage(input: {
  readonly userId: string;
  readonly creatorProfileId: string;
  readonly provider: YouTubeLibraryProvider;
  readonly store?: YouTubeImportStore;
  readonly now?: Date;
  readonly syncVideos?: (
    input: SyncChannelVideosInput
  ) => Promise<SyncChannelVideosResult>;
}): Promise<YouTubeImportSnapshot> {
  const store = input.store ?? drizzleYouTubeImportStore;
  const now = input.now ?? new Date();
  const syncVideos = input.syncVideos ?? syncChannelVideos;
  const accounts = await store.loadAccounts(
    input.userId,
    input.creatorProfileId
  );
  const connected = accounts.filter(
    account => account.status === 'connected' || account.status === 'error'
  );
  if (connected.length !== 1) {
    return snapshotFromAccounts({ accounts });
  }
  const account = connected[0];
  const rawCursor = await store.loadCursor(account.id);
  if (cursorBelongsToAnotherChannel(rawCursor, account.channelId)) {
    const snapshot = snapshotFromAccounts({
      accounts,
      identity: 'mismatch',
    });
    return {
      ...snapshot,
      state: 'error',
      lastErrorUserMessage:
        'The saved import cursor belongs to a different YouTube channel. Resolve ownership before import.',
    };
  }

  const existing = parseYouTubeImportCursor(rawCursor, account.channelId);
  const restart = !existing || existing.complete;
  const pageToken = restart ? null : existing.pageToken;
  const baseCounts = restart ? emptyYouTubeImportCounts() : existing.counts;
  const baseReasons: readonly YouTubeImportReason[] = restart
    ? []
    : existing.reasons;

  if (!input.provider.listChannelVideosPage) {
    return {
      ...snapshotFromAccounts({ accounts, cursor: existing }),
      state: 'error',
      lastErrorUserMessage: 'YouTube pagination is unavailable.',
    };
  }

  try {
    const page = await input.provider.listChannelVideosPage(account.channelId, {
      pageToken,
    });
    if (page.channelId !== account.channelId) {
      return {
        ...snapshotFromAccounts({ accounts, identity: 'mismatch' }),
        state: 'error',
        lastErrorUserMessage:
          'The authorized account does not own the selected YouTube channel.',
      };
    }

    const result = await syncVideos({
      creatorProfileId: input.creatorProfileId,
      channelId: account.channelId,
      provider: input.provider,
      incoming: page.videos,
      windows: [],
      now,
    });

    let reasons = [...baseReasons];
    for (const skipped of page.skipped) {
      reasons = addYouTubeImportReason(
        reasons,
        skipReasonCode(skipped.reason),
        1
      );
    }
    const counts = mergeCounts(baseCounts, {
      discovered: page.videos.length + page.skipped.length,
      imported: result.inserted,
      skipped: page.skipped.length,
      failed: 0,
      updated: result.updated,
    });
    const cursor: YouTubeImportCursor = {
      version: YOUTUBE_IMPORT_CURSOR_VERSION,
      channelId: account.channelId,
      uploadsPlaylistId: page.uploadsPlaylistId,
      pageToken: page.nextPageToken,
      complete: !page.nextPageToken,
      counts,
      reasons,
      lastSuccessfulObservationAt: now.toISOString(),
      providerAccountId: account.channelId,
      providerTitle: page.channelTitle || account.providerTitle,
      lastErrorCode: null,
    };
    await store.saveCursor(account.id, cursor);
    await store.markAccount(account.id, {
      lastSyncAt: now,
      lastErrorCode: null,
      lastErrorUserMessage: null,
      status: 'connected',
    });
    const localVideoCount = store.countVideos
      ? await store.countVideos(input.creatorProfileId, account.channelId)
      : counts.imported + counts.updated;
    return snapshotFromAccounts({
      accounts: [
        {
          ...account,
          status: 'connected',
          lastSyncAt: now,
          lastErrorCode: null,
          lastErrorUserMessage: null,
          providerTitle: cursor.providerTitle,
        },
      ],
      cursor,
      localVideoCount,
    });
  } catch (error) {
    const quota = isQuotaError(error);
    const lastErrorCode = quota
      ? 'youtube_quota_limited'
      : 'youtube_sync_failed';
    const lastErrorUserMessage = quota
      ? 'YouTube quota is exhausted. Resume import after the quota resets.'
      : 'YouTube could not be imported. Try again or reconnect the channel.';
    const status = quota ? account.status : ('error' as const);
    const cursor: YouTubeImportCursor | null = existing
      ? {
          ...existing,
          lastErrorCode,
        }
      : null;
    if (cursor) await store.saveCursor(account.id, cursor);
    await store.markAccount(account.id, {
      lastErrorCode,
      lastErrorUserMessage,
      ...(quota ? {} : { status: 'error' }),
    });
    return snapshotFromAccounts({
      accounts: [
        {
          ...account,
          status,
          lastErrorCode,
          lastErrorUserMessage,
        },
      ],
      cursor,
      localVideoCount: cursor?.counts.imported ?? 0,
    });
  }
}
