import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getCachedAuth } from '@/lib/auth/cached';
import { getExactProfileAccess } from '@/lib/auth/profile-access';
import { db } from '@/lib/db';
import {
  type LibraryRelationship,
  libraryRelationships,
  optimizationExperiments,
} from '@/lib/db/schema/library-content-graph';
import { merchCards } from '@/lib/db/schema/merch';
import { youtubeVideos } from '@/lib/db/schema/youtube-library';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  getThumbnailHistory,
  getVideoMetricsForProfile,
  getVideoPkForProfile,
} from '@/lib/youtube-library/queries';
import type {
  LibraryRelationshipView,
  YouTubeOptimizationSnapshot,
} from './track-drawer-types';

export async function requireLibraryProfileAccess(creatorProfileId: string) {
  const { userId } = await getCachedAuth();
  if (!userId) {
    return {
      error: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      ),
    };
  }
  const access = await getExactProfileAccess(db, userId, creatorProfileId);
  if (!access.ok) {
    return {
      error: NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: NO_STORE_HEADERS }
      ),
    };
  }
  return { userId };
}

export class LibraryRelationshipWriteError extends Error {
  readonly code: 'not_found' | 'conflict';
  constructor(code: 'not_found' | 'conflict', message: string) {
    super(message);
    this.name = 'LibraryRelationshipWriteError';
    this.code = code;
  }
}

function toView(row: LibraryRelationship): LibraryRelationshipView {
  return {
    id: row.id,
    kind: row.kind,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    objectType: row.objectType,
    objectId: row.objectId,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listActiveLibraryRelationships(
  creatorProfileId: string
): Promise<LibraryRelationshipView[]> {
  const rows = await db
    .select()
    .from(libraryRelationships)
    .where(
      and(
        eq(libraryRelationships.creatorProfileId, creatorProfileId),
        eq(libraryRelationships.status, 'active')
      )
    )
    .orderBy(desc(libraryRelationships.createdAt));
  return rows.map(toView);
}

async function findMerchFeature(input: {
  readonly creatorProfileId: string;
  readonly videoId: string;
  readonly merchCardId: string;
}) {
  const [row] = await db
    .select()
    .from(libraryRelationships)
    .where(
      and(
        eq(libraryRelationships.creatorProfileId, input.creatorProfileId),
        eq(libraryRelationships.kind, 'features_merch'),
        eq(libraryRelationships.subjectType, 'youtube_video'),
        eq(libraryRelationships.subjectId, input.videoId),
        eq(libraryRelationships.objectType, 'merch_product'),
        eq(libraryRelationships.objectId, input.merchCardId)
      )
    )
    .limit(1);
  return row;
}

export async function tagMerchInYouTubeVideo(input: {
  readonly creatorProfileId: string;
  readonly videoId: string;
  readonly merchCardId: string;
}): Promise<LibraryRelationshipView> {
  const [[video], [card]] = await Promise.all([
    db
      .select({ videoId: youtubeVideos.videoId })
      .from(youtubeVideos)
      .where(
        and(
          eq(youtubeVideos.creatorProfileId, input.creatorProfileId),
          eq(youtubeVideos.videoId, input.videoId)
        )
      )
      .limit(1),
    db
      .select({ id: merchCards.id })
      .from(merchCards)
      .where(
        and(
          eq(merchCards.creatorProfileId, input.creatorProfileId),
          eq(merchCards.id, input.merchCardId)
        )
      )
      .limit(1),
  ]);
  if (!video || !card) {
    throw new LibraryRelationshipWriteError(
      'not_found',
      'Video or merch product was not found'
    );
  }
  const existing = await findMerchFeature({
    creatorProfileId: input.creatorProfileId,
    videoId: video.videoId,
    merchCardId: card.id,
  });
  const [saved] = existing
    ? await db
        .update(libraryRelationships)
        .set({ status: 'active', updatedAt: new Date() })
        .where(eq(libraryRelationships.id, existing.id))
        .returning()
    : await db
        .insert(libraryRelationships)
        .values({
          creatorProfileId: input.creatorProfileId,
          kind: 'features_merch',
          subjectType: 'youtube_video',
          subjectId: video.videoId,
          objectType: 'merch_product',
          objectId: card.id,
          status: 'active',
          evidence: { source: 'library-track-drawer' },
        })
        .returning();
  if (!saved) {
    throw new LibraryRelationshipWriteError(
      'conflict',
      'Relationship could not be saved'
    );
  }
  return toView(saved);
}

export async function untagMerchInYouTubeVideo(input: {
  readonly creatorProfileId: string;
  readonly videoId: string;
  readonly merchCardId: string;
}): Promise<void> {
  const existing = await findMerchFeature(input);
  if (!existing || existing.status === 'removed') return;
  const [updated] = await db
    .update(libraryRelationships)
    .set({ status: 'removed', updatedAt: new Date() })
    .where(eq(libraryRelationships.id, existing.id))
    .returning();
  if (!updated) {
    throw new LibraryRelationshipWriteError(
      'conflict',
      'Relationship could not be saved'
    );
  }
}

export async function loadYouTubeOptimizationSnapshot(input: {
  readonly creatorProfileId: string;
  readonly videoId: string;
}): Promise<YouTubeOptimizationSnapshot | null> {
  const videoPk = await getVideoPkForProfile(input);
  if (!videoPk) return null;
  const [thumbnails, metrics, experiments] = await Promise.all([
    getThumbnailHistory({ videoId: videoPk }),
    getVideoMetricsForProfile(input),
    db
      .select()
      .from(optimizationExperiments)
      .where(
        and(
          eq(optimizationExperiments.creatorProfileId, input.creatorProfileId),
          eq(optimizationExperiments.subjectType, 'youtube_video'),
          eq(optimizationExperiments.subjectId, input.videoId)
        )
      )
      .orderBy(desc(optimizationExperiments.updatedAt)),
  ]);
  const latestFirst = [...(metrics ?? [])].sort(
    (left, right) =>
      new Date(right.capturedAt).getTime() - new Date(left.capturedAt).getTime()
  );
  return {
    thumbnails: thumbnails.map(
      ({ id, kind, imageUrl, approvalStatus, experimentId, detectedAt }) => ({
        id,
        kind,
        imageUrl,
        approvalStatus,
        experimentId,
        detectedAt,
      })
    ),
    metrics: latestFirst.map(
      ({
        window,
        views,
        watchTimeMinutes,
        avgViewDurationSeconds,
        capturedAt,
      }) => ({
        window,
        views,
        watchTimeMinutes,
        avgViewDurationSeconds,
        capturedAt,
      })
    ),
    experiments: experiments.map(
      ({ id, objective, status, winnerVariantKey }) => ({
        id,
        objective,
        status,
        winnerVariantKey,
      })
    ),
  };
}
