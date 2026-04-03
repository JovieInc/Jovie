import { del } from '@vercel/blob';
import { and, sql as drizzleSql, eq, lt, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { albumArtGenerationSessions } from '@/lib/db/schema/album-art';
import { env } from '@/lib/env-server';
import { logger } from '@/lib/utils/logger';

interface CleanupCandidate {
  readonly id: string;
  readonly status: string;
  readonly payloadJson: Record<string, unknown>;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function collectAlbumArtBlobUrls(
  payload: Record<string, unknown> | null | undefined
): string[] {
  if (!payload || !Array.isArray(payload.options)) {
    return [];
  }

  const urls = new Set<string>();

  for (const option of payload.options) {
    if (!isObjectRecord(option)) {
      continue;
    }

    for (const key of ['previewUrl', 'finalImageUrl', 'backgroundUrl']) {
      const value = option[key];
      if (typeof value === 'string' && value.startsWith('https://')) {
        urls.add(value);
      }
    }
  }

  return [...urls];
}

async function deleteAlbumArtBlobs(urls: string[]): Promise<number> {
  if (urls.length === 0) {
    return 0;
  }

  const token = env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    logger.error(
      '[album-art-cleanup] Missing blob token for album art cleanup',
      {
        urlCount: urls.length,
      }
    );
    return -1;
  }

  try {
    await del(urls, { token });
    return urls.length;
  } catch (error) {
    logger.error('[album-art-cleanup] Failed to delete album art blobs', {
      error: error instanceof Error ? error.message : String(error),
      urlCount: urls.length,
    });
    return -1;
  }
}

export async function cleanupExpiredAlbumArtSessions(): Promise<{
  expiredSessions: number;
  blobsDeleted: number;
}> {
  const now = new Date();
  const candidates = (await db
    .select({
      id: albumArtGenerationSessions.id,
      status: albumArtGenerationSessions.status,
      payloadJson: albumArtGenerationSessions.payloadJson,
    })
    .from(albumArtGenerationSessions)
    .where(
      and(
        lt(albumArtGenerationSessions.expiresAt, now),
        ne(albumArtGenerationSessions.status, 'applied'),
        drizzleSql`coalesce(${albumArtGenerationSessions.payloadJson} ->> 'cleanupCompletedAt', '') = ''`
      )
    )) as CleanupCandidate[];

  if (candidates.length === 0) {
    return { expiredSessions: 0, blobsDeleted: 0 };
  }

  let expiredSessions = 0;
  let blobsDeleted = 0;

  for (const candidate of candidates) {
    const cleanupCompletedAt = candidate.payloadJson.cleanupCompletedAt;
    const alreadyCleaned =
      typeof cleanupCompletedAt === 'string' && cleanupCompletedAt.length > 0;
    if (alreadyCleaned) {
      continue;
    }

    let nextCleanupCompletedAt =
      typeof cleanupCompletedAt === 'string' ? cleanupCompletedAt : undefined;

    const urls = collectAlbumArtBlobUrls(candidate.payloadJson);
    const deleted = await deleteAlbumArtBlobs(urls);
    if (deleted > 0) {
      blobsDeleted += deleted;
    }
    if (deleted >= 0) {
      nextCleanupCompletedAt = now.toISOString();
    }

    const shouldMarkExpired = candidate.status !== 'expired';
    const shouldPersistCleanupCompletion = Boolean(nextCleanupCompletedAt);
    if (!shouldMarkExpired && !shouldPersistCleanupCompletion) {
      continue;
    }

    await db
      .update(albumArtGenerationSessions)
      .set({
        status: 'expired',
        payloadJson: {
          ...candidate.payloadJson,
          ...(nextCleanupCompletedAt
            ? { cleanupCompletedAt: nextCleanupCompletedAt }
            : {}),
        },
        updatedAt: now,
      })
      .where(
        and(
          eq(albumArtGenerationSessions.id, candidate.id),
          ne(albumArtGenerationSessions.status, 'applied'),
          drizzleSql`coalesce(${albumArtGenerationSessions.payloadJson} ->> 'cleanupCompletedAt', '') = ''`
        )
      );

    if (shouldMarkExpired) {
      expiredSessions += 1;
    }
  }

  logger.info(
    `[album-art-cleanup] Expired ${expiredSessions} sessions and deleted ${blobsDeleted} blobs`
  );

  return {
    expiredSessions,
    blobsDeleted,
  };
}
