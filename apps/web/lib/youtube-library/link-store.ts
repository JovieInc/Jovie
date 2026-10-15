import 'server-only';
import { and, eq, gt, isNull, lt, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { connectorSyncStates } from '@/lib/db/schema/connectors';
import type { YouTubeLinkApplyStore, YouTubeLinkOperation } from './link-apply';

export class YouTubeLinkBusyError extends Error {}

const rowFor = (accountId: string, videoId: string) =>
  and(
    eq(connectorSyncStates.connectorAccountId, accountId),
    eq(connectorSyncStates.resourceKind, `youtube_link_apply:${videoId}`)
  );

export async function loadYouTubeLinkOperation(
  accountId: string,
  videoId: string
) {
  const [row] = await db
    .select({ cursor: connectorSyncStates.cursor })
    .from(connectorSyncStates)
    .where(rowFor(accountId, videoId))
    .limit(1);
  return (row?.cursor ?? null) as YouTubeLinkOperation | null;
}

/** Durable single-video lease; saves and release are fenced by this exact lease. */
export async function withYouTubeLinkStore<T>(
  accountId: string,
  videoId: string,
  fn: (store: YouTubeLinkApplyStore) => Promise<T>
): Promise<T> {
  await db
    .insert(connectorSyncStates)
    .values({
      connectorAccountId: accountId,
      resourceKind: `youtube_link_apply:${videoId}`,
    })
    .onConflictDoNothing();
  const lease = new Date(Date.now() + 5 * 60_000);
  const [acquired] = await db
    .update(connectorSyncStates)
    .set({ tokenRefreshLockedUntil: lease })
    .where(
      and(
        rowFor(accountId, videoId),
        or(
          isNull(connectorSyncStates.tokenRefreshLockedUntil),
          lt(connectorSyncStates.tokenRefreshLockedUntil, new Date())
        )
      )
    )
    .returning({ id: connectorSyncStates.id });
  if (!acquired) throw new YouTubeLinkBusyError();
  const owned = and(
    rowFor(accountId, videoId),
    eq(connectorSyncStates.tokenRefreshLockedUntil, lease)
  );
  try {
    return await fn({
      load: async () => loadYouTubeLinkOperation(accountId, videoId),
      save: async operation => {
        const [saved] = await db
          .update(connectorSyncStates)
          .set({ cursor: operation, lastIncrementalSyncAt: new Date() })
          .where(
            and(
              owned,
              gt(connectorSyncStates.tokenRefreshLockedUntil, new Date())
            )
          )
          .returning({ id: connectorSyncStates.id });
        if (!saved) throw new YouTubeLinkBusyError();
      },
    });
  } finally {
    await db
      .update(connectorSyncStates)
      .set({ tokenRefreshLockedUntil: null })
      .where(owned);
  }
}
