import { del } from '@vercel/blob';
import { and, eq, lt, ne } from 'drizzle-orm';
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
    return 0;
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
        ne(albumArtGenerationSessions.status, 'applied')
      )
    )) as CleanupCandidate[];

  if (candidates.length === 0) {
    return { expiredSessions: 0, blobsDeleted: 0 };
  }

  let blobsDeleted = 0;

  for (const candidate of candidates) {
    const cleanupCompletedAt = candidate.payloadJson.cleanupCompletedAt;
    const shouldDeleteBlobs =
      typeof cleanupCompletedAt !== 'string' || cleanupCompletedAt.length === 0;
    let nextCleanupCompletedAt =
      typeof cleanupCompletedAt === 'string' ? cleanupCompletedAt : undefined;

    if (shouldDeleteBlobs) {
      const urls = collectAlbumArtBlobUrls(candidate.payloadJson);
      const deleted = await deleteAlbumArtBlobs(urls);
      if (deleted > 0) {
        blobsDeleted += deleted;
      }
      if (deleted >= 0) {
        nextCleanupCompletedAt = now.toISOString();
      }
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
          ne(albumArtGenerationSessions.status, 'applied')
        )
      );
  }

  logger.info(
    `[album-art-cleanup] Expired ${candidates.length} sessions and deleted ${blobsDeleted} blobs`
  );

  return {
    expiredSessions: candidates.length,
    blobsDeleted,
  };
}
