import 'server-only';

import { createHash } from 'node:crypto';
import { and, desc, sql as drizzleSql, eq } from 'drizzle-orm';
import { YOUTUBE_THUMBNAIL_CANDIDATE_KIND } from '@/lib/connectors/suggested-action-kinds';
import { buildYouTubeThumbnailCandidatePayload } from '@/lib/connectors/youtube-thumbnail-candidate';
import { db } from '@/lib/db';
import { suggestedActions } from '@/lib/db/schema/connectors';
import {
  type YouTubeThumbnailSet,
  youtubeThumbnailVersions,
  youtubeVideoMetricSnapshots,
  youtubeVideos,
} from '@/lib/db/schema/youtube-library';

function deterministicUuid(value: string): string {
  const bytes = createHash('sha256').update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function deriveThumbnailCandidateReviewIds(input: {
  readonly userId: string;
  readonly videoPk: string;
  readonly artifactSha256: string;
}) {
  const thumbnailVersionId = deterministicUuid(
    `youtube-thumbnail-version:${input.videoPk}:${input.artifactSha256}`
  );
  return {
    thumbnailVersionId,
    reviewActionId: deterministicUuid(
      `youtube-thumbnail-review:${input.userId}:${thumbnailVersionId}`
    ),
  };
}

function decimalToNumber(value: string | null): number | null {
  return value === null ? null : Number(value);
}

function bestThumbnailUrl(
  thumbnails: YouTubeThumbnailSet | null
): string | null {
  return (
    thumbnails?.maxres?.url ??
    thumbnails?.standard?.url ??
    thumbnails?.high?.url ??
    thumbnails?.medium?.url ??
    thumbnails?.default?.url ??
    null
  );
}

export type RegisterThumbnailCandidateReviewResult =
  | {
      readonly ok: true;
      readonly thumbnailVersionId: string;
      readonly reviewActionId: string;
      readonly metricsCapturedAt: string;
    }
  | {
      readonly ok: false;
      readonly error: 'video-not-found' | 'api-metrics-required';
    };

/**
 * Register one immutable candidate and its Inbox decision card. Both ids are
 * deterministic, so a retry repairs either half of the two-write sequence
 * without duplicating the append-only candidate.
 */
export async function registerThumbnailCandidateReview(input: {
  readonly userId: string;
  readonly creatorProfileId: string;
  readonly youtubeVideoId: string;
  readonly imageUrl: string;
  readonly artifactSha256: string;
  readonly provenance?: {
    readonly generator?: string;
    readonly prompt?: string;
    readonly model?: string;
  };
  readonly experimentId?: string | null;
  readonly cohortId?: string | null;
}): Promise<RegisterThumbnailCandidateReviewResult> {
  const [video] = await db
    .select({
      id: youtubeVideos.id,
      channelId: youtubeVideos.channelId,
      title: youtubeVideos.title,
      currentThumbnails: youtubeVideos.currentThumbnails,
    })
    .from(youtubeVideos)
    .where(
      and(
        eq(youtubeVideos.creatorProfileId, input.creatorProfileId),
        eq(youtubeVideos.videoId, input.youtubeVideoId)
      )
    )
    .limit(1);
  if (!video) return { ok: false, error: 'video-not-found' };

  const [metric] = await db
    .select({
      capturedAt: youtubeVideoMetricSnapshots.capturedAt,
      views: youtubeVideoMetricSnapshots.views,
      watchTimeMinutes: youtubeVideoMetricSnapshots.watchTimeMinutes,
      avgViewDurationSeconds:
        youtubeVideoMetricSnapshots.avgViewDurationSeconds,
    })
    .from(youtubeVideoMetricSnapshots)
    .where(
      and(
        eq(youtubeVideoMetricSnapshots.videoId, video.id),
        eq(youtubeVideoMetricSnapshots.window, 'lifetime')
      )
    )
    .orderBy(desc(youtubeVideoMetricSnapshots.capturedAt))
    .limit(1);
  if (!metric) return { ok: false, error: 'api-metrics-required' };

  const [currentVersion] = await db
    .select({ imageUrl: youtubeThumbnailVersions.imageUrl })
    .from(youtubeThumbnailVersions)
    .where(
      and(
        eq(youtubeThumbnailVersions.videoId, video.id),
        drizzleSql`${youtubeThumbnailVersions.kind} in ('current', 'original')`
      )
    )
    .orderBy(desc(youtubeThumbnailVersions.detectedAt))
    .limit(1);

  const { thumbnailVersionId, reviewActionId } =
    deriveThumbnailCandidateReviewIds({
      userId: input.userId,
      videoPk: video.id,
      artifactSha256: input.artifactSha256,
    });
  const payload = buildYouTubeThumbnailCandidatePayload({
    creatorProfileId: input.creatorProfileId,
    channelId: video.channelId,
    youtubeVideoId: input.youtubeVideoId,
    videoTitle: video.title,
    candidateThumbnailVersionId: thumbnailVersionId,
    candidateImageUrl: input.imageUrl,
    currentThumbnailUrl:
      currentVersion?.imageUrl ?? bestThumbnailUrl(video.currentThumbnails),
    artifactSha256: input.artifactSha256,
    apiMetrics: {
      source: 'youtube-analytics-api',
      window: 'lifetime',
      capturedAt: metric.capturedAt.toISOString(),
      views: metric.views,
      watchTimeMinutes: decimalToNumber(metric.watchTimeMinutes),
      avgViewDurationSeconds: decimalToNumber(metric.avgViewDurationSeconds),
      // The official Analytics API does not expose Studio thumbnail CTR or
      // thumbnail impressions. Preserve null instead of inventing values.
      impressions: null,
      ctr: null,
    },
  });

  await db
    .insert(youtubeThumbnailVersions)
    .values({
      id: thumbnailVersionId,
      videoId: video.id,
      kind: 'candidate',
      imageUrl: input.imageUrl,
      provenance: {
        source: 'generated',
        ...input.provenance,
        artifactSha256: input.artifactSha256,
      },
      approvalStatus: 'pending',
      experimentId: input.experimentId ?? null,
      cohortId: input.cohortId ?? null,
    })
    .onConflictDoNothing({ target: youtubeThumbnailVersions.id });

  await db
    .insert(suggestedActions)
    .values({
      id: reviewActionId,
      userId: input.userId,
      kind: YOUTUBE_THUMBNAIL_CANDIDATE_KIND,
      payload,
      signalType: 'other',
      status: 'pending',
      sourceRefs: [
        {
          source: 'youtube-analytics-api',
          creatorProfileId: input.creatorProfileId,
          channelId: video.channelId,
          videoId: input.youtubeVideoId,
          capturedAt: metric.capturedAt.toISOString(),
        },
      ],
      rationale: `Compare the live control with this candidate using YouTube API metrics captured ${metric.capturedAt.toISOString()}.`,
      idempotencyKey: `youtube-thumbnail-review:${thumbnailVersionId}`,
      sideEffects: [],
    })
    .onConflictDoNothing({ target: suggestedActions.id });

  return {
    ok: true,
    thumbnailVersionId,
    reviewActionId,
    metricsCapturedAt: metric.capturedAt.toISOString(),
  };
}
