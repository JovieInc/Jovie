/**
 * YouTube Library — read helpers for MCP + approval queue (JOV-5136)
 *
 * All functions scope by creator profile so cross-profile reads are
 * impossible. Dates are serialized to ISO strings and decimals to numbers
 * in the returned shapes.
 */

import {
  and,
  desc,
  sql as drizzleSql,
  eq,
  gte,
  inArray,
  isNotNull,
  lte,
  or,
} from 'drizzle-orm';
import { db } from '@/lib/db';
import { optimizationExperiments } from '@/lib/db/schema/library-content-graph';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';
import type {
  YoutubeThumbnailVersion,
  YoutubeVideo,
  YoutubeVideoMetricSnapshot,
  YoutubeVideoReleaseLink,
} from '@/lib/db/schema/youtube-library';
import {
  youtubeThumbnailVersions,
  youtubeVideoMetricSnapshots,
  youtubeVideoReleaseLinks,
  youtubeVideos,
} from '@/lib/db/schema/youtube-library';
import type { YouTubeOptimizationSnapshot } from './optimization-types';
import type { YouTubeMetricWindow } from './types';

const MAX_LIST_LIMIT = 100;

// ---------------------------------------------------------------------------
// Public-safe shapes
// ---------------------------------------------------------------------------

export interface PublicVideoListItem {
  readonly id: string;
  readonly videoId: string;
  readonly title: string;
  readonly url: string;
  readonly publishedAt: string | null;
  readonly durationSeconds: number | null;
  readonly privacyStatus: string | null;
  readonly contentType: YoutubeVideo['contentType'];
  readonly classificationConfidence: number | null;
  readonly thumbnailUrl: string | null;
  /** Present only when a link is approved. */
  readonly releaseLink: {
    isrc: string | null;
    releaseId: string | null;
  } | null;
}

export interface VideoMetricSnapshotItem {
  readonly window: YouTubeMetricWindow;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly impressions: number | null;
  readonly ctr: number | null;
  readonly views: number | null;
  readonly watchTimeMinutes: number | null;
  readonly watchTimePerImpression: number | null;
  readonly avgViewDurationSeconds: number | null;
  readonly trafficSources: Record<string, number> | null;
  readonly revenueMicros: number | null;
  readonly currency: string | null;
  readonly capturedAt: string;
}

export interface ThumbnailHistoryItem {
  readonly id: string;
  readonly kind: YoutubeThumbnailVersion['kind'];
  readonly imageUrl: string;
  readonly provenance: YoutubeThumbnailVersion['provenance'];
  readonly approvalStatus: YoutubeThumbnailVersion['approvalStatus'];
  readonly experimentId: string | null;
  readonly cohortId: string | null;
  readonly swappedAt: string | null;
  readonly detectedAt: string;
}

export interface PendingReleaseLinkItem {
  readonly id: string;
  readonly videoId: string;
  readonly youtubeVideoId: string;
  readonly videoTitle: string;
  readonly isrc: string | null;
  readonly matchSource: YoutubeVideoReleaseLink['matchSource'];
  readonly confidence: number;
  readonly status: YoutubeVideoReleaseLink['status'];
  readonly rationale: string | null;
  readonly createdAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toIso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

function toNumber(value: string | null): number | null {
  return value === null ? null : Number(value);
}

/**
 * Pick the display thumbnail per video: latest kind='current', else latest
 * kind='original'. Candidate/previous versions never surface publicly.
 */
function pickDisplayThumbnails(
  versions: readonly YoutubeThumbnailVersion[]
): Map<string, string> {
  const byVideo = new Map<string, YoutubeThumbnailVersion[]>();
  for (const v of versions) {
    const list = byVideo.get(v.videoId) ?? [];
    list.push(v);
    byVideo.set(v.videoId, list);
  }
  const out = new Map<string, string>();
  for (const [videoPk, list] of byVideo) {
    const sorted = [...list].sort(
      (a, b) => b.detectedAt.getTime() - a.detectedAt.getTime()
    );
    const effective =
      sorted.find(v => v.kind === 'current') ??
      sorted.find(v => v.kind === 'original');
    if (effective) out.set(videoPk, effective.imageUrl);
  }
  return out;
}

function toPublicItem(
  video: YoutubeVideo,
  link: YoutubeVideoReleaseLink | null,
  thumbnailUrl: string | null
): PublicVideoListItem {
  return {
    id: video.id,
    videoId: video.videoId,
    title: video.title,
    url: video.url,
    publishedAt: toIso(video.publishedAt),
    durationSeconds: video.durationSeconds,
    privacyStatus: video.privacyStatus,
    contentType: video.contentType,
    classificationConfidence: toNumber(video.classificationConfidence),
    thumbnailUrl,
    releaseLink:
      link && link.status === 'approved'
        ? { isrc: link.isrc, releaseId: link.releaseId }
        : null,
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export interface ListVideosForProfileInput {
  readonly creatorProfileId: string;
  readonly contentType?: YoutubeVideo['contentType'];
  /** Only videos having a thumbnail version tagged with this experiment. */
  readonly experimentId?: string;
  readonly hasApprovedReleaseLink?: boolean;
  /** Capped at 100. */
  readonly limit?: number;
}

export async function listVideosForProfile(
  input: ListVideosForProfileInput
): Promise<PublicVideoListItem[]> {
  const limit = Math.min(
    Math.max(input.limit ?? MAX_LIST_LIMIT, 1),
    MAX_LIST_LIMIT
  );

  return queryVideosForProfile(input, limit);
}

/**
 * Authenticated Library projection. Unlike the public/MCP helper, this does
 * not silently truncate a creator's imported channel history.
 */
export async function listLibraryVideosForProfile(input: {
  readonly creatorProfileId: string;
}): Promise<PublicVideoListItem[]> {
  return queryVideosForProfile(input, null);
}

async function queryVideosForProfile(
  input: Omit<ListVideosForProfileInput, 'limit'>,
  limit: number | null
): Promise<PublicVideoListItem[]> {
  let experimentVideoPks: Set<string> | null = null;
  if (input.experimentId) {
    const rows = await db
      .selectDistinct({ videoId: youtubeThumbnailVersions.videoId })
      .from(youtubeThumbnailVersions)
      .innerJoin(
        youtubeVideos,
        eq(youtubeVideos.id, youtubeThumbnailVersions.videoId)
      )
      .where(
        and(
          eq(youtubeVideos.creatorProfileId, input.creatorProfileId),
          eq(youtubeThumbnailVersions.experimentId, input.experimentId)
        )
      );
    experimentVideoPks = new Set(rows.map(r => r.videoId));
    if (experimentVideoPks.size === 0) return [];
  }

  const conditions = [
    eq(youtubeVideos.creatorProfileId, input.creatorProfileId),
  ];
  if (input.contentType) {
    conditions.push(eq(youtubeVideos.contentType, input.contentType));
  }
  if (experimentVideoPks) {
    conditions.push(inArray(youtubeVideos.id, [...experimentVideoPks]));
  }

  const baseQuery = db
    .select({ video: youtubeVideos, link: youtubeVideoReleaseLinks })
    .from(youtubeVideos)
    .leftJoin(
      youtubeVideoReleaseLinks,
      eq(youtubeVideoReleaseLinks.videoId, youtubeVideos.id)
    )
    .where(and(...conditions))
    .orderBy(desc(youtubeVideos.publishedAt));
  const rows = limit === null ? await baseQuery : await baseQuery.limit(limit);

  const videoPks = rows.map(r => r.video.id);
  const versions: YoutubeThumbnailVersion[] = [];
  for (let index = 0; index < videoPks.length; index += 500) {
    const batch = videoPks.slice(index, index + 500);
    versions.push(
      ...(await db
        .select()
        .from(youtubeThumbnailVersions)
        .where(inArray(youtubeThumbnailVersions.videoId, batch)))
    );
  }
  const thumbnails = pickDisplayThumbnails(versions);

  return rows
    .map(r => toPublicItem(r.video, r.link, thumbnails.get(r.video.id) ?? null))
    .filter(item =>
      input.hasApprovedReleaseLink === undefined
        ? true
        : input.hasApprovedReleaseLink
          ? item.releaseLink !== null
          : item.releaseLink === null
    );
}

/** Authenticated Library projection: uncapped, one row per video. */
export async function listVideosForLibraryProjection(input: {
  readonly creatorProfileId: string;
}): Promise<PublicVideoListItem[]> {
  const videos = await db
    .select()
    .from(youtubeVideos)
    .where(eq(youtubeVideos.creatorProfileId, input.creatorProfileId))
    .orderBy(desc(youtubeVideos.publishedAt));
  if (videos.length === 0) return [];

  const videoPks = videos.map(video => video.id);
  const [links, versions] = await Promise.all([
    db
      .select()
      .from(youtubeVideoReleaseLinks)
      .where(
        and(
          inArray(youtubeVideoReleaseLinks.videoId, videoPks),
          eq(youtubeVideoReleaseLinks.status, 'approved')
        )
      ),
    db
      .select()
      .from(youtubeThumbnailVersions)
      .where(inArray(youtubeThumbnailVersions.videoId, videoPks)),
  ]);

  const linkByVideo = new Map<string, YoutubeVideoReleaseLink>();
  for (const link of links) {
    if (!linkByVideo.has(link.videoId)) {
      linkByVideo.set(link.videoId, link);
    }
  }
  const thumbnails = pickDisplayThumbnails(versions);
  return videos.map(video =>
    toPublicItem(
      video,
      linkByVideo.get(video.id) ?? null,
      thumbnails.get(video.id) ?? null
    )
  );
}

export interface GetVideoMetricsInput {
  readonly creatorProfileId: string;
  /** YouTube video id (as exposed publicly), not the internal row id. */
  readonly videoId: string;
  readonly window?: YouTubeMetricWindow;
  readonly from?: Date;
  readonly to?: Date;
}

/**
 * Metric snapshots for one video, scoped to the owning profile.
 * Returns null when the video does not belong to the profile.
 */
export async function getVideoMetricsForProfile(
  input: GetVideoMetricsInput
): Promise<VideoMetricSnapshotItem[] | null> {
  const [video] = await db
    .select({ id: youtubeVideos.id })
    .from(youtubeVideos)
    .where(
      and(
        eq(youtubeVideos.creatorProfileId, input.creatorProfileId),
        eq(youtubeVideos.videoId, input.videoId)
      )
    )
    .limit(1);
  if (!video) return null;

  const conditions = [eq(youtubeVideoMetricSnapshots.videoId, video.id)];
  if (input.window) {
    conditions.push(eq(youtubeVideoMetricSnapshots.window, input.window));
  }
  if (input.from) {
    conditions.push(gte(youtubeVideoMetricSnapshots.windowStart, input.from));
  }
  if (input.to) {
    conditions.push(lte(youtubeVideoMetricSnapshots.windowEnd, input.to));
  }

  const rows: YoutubeVideoMetricSnapshot[] = await db
    .select()
    .from(youtubeVideoMetricSnapshots)
    .where(and(...conditions))
    .orderBy(
      youtubeVideoMetricSnapshots.window,
      youtubeVideoMetricSnapshots.windowStart
    );

  return rows.map(r => ({
    window: r.window,
    windowStart: r.windowStart.toISOString(),
    windowEnd: r.windowEnd.toISOString(),
    impressions: r.impressions,
    ctr: toNumber(r.ctr),
    views: r.views,
    watchTimeMinutes: toNumber(r.watchTimeMinutes),
    watchTimePerImpression: toNumber(r.watchTimePerImpression),
    avgViewDurationSeconds: toNumber(r.avgViewDurationSeconds),
    trafficSources: r.trafficSources,
    revenueMicros: r.revenueMicros,
    currency: r.currency,
    capturedAt: r.capturedAt.toISOString(),
  }));
}

/**
 * Full append-only thumbnail history for a video.
 * `videoId` is the internal youtube_videos row id.
 */
export async function getThumbnailHistory(input: {
  videoId: string;
}): Promise<ThumbnailHistoryItem[]> {
  const rows = await db
    .select()
    .from(youtubeThumbnailVersions)
    .where(eq(youtubeThumbnailVersions.videoId, input.videoId))
    .orderBy(youtubeThumbnailVersions.detectedAt);

  return rows.map(r => ({
    id: r.id,
    kind: r.kind,
    imageUrl: r.imageUrl,
    provenance: r.provenance,
    approvalStatus: r.approvalStatus,
    experimentId: r.experimentId,
    cohortId: r.cohortId,
    swappedAt: toIso(r.swappedAt),
    detectedAt: r.detectedAt.toISOString(),
  }));
}

export async function getYouTubeOptimizationSnapshotForProfile(input: {
  readonly creatorProfileId: string;
  readonly videoId: string;
}): Promise<YouTubeOptimizationSnapshot | null> {
  const [video] = await db
    .select({ id: youtubeVideos.id })
    .from(youtubeVideos)
    .where(
      and(
        eq(youtubeVideos.id, input.videoId),
        eq(youtubeVideos.creatorProfileId, input.creatorProfileId)
      )
    )
    .limit(1);
  if (!video) return null;

  const [thumbnails, metrics, experiments] = await Promise.all([
    db
      .select()
      .from(youtubeThumbnailVersions)
      .where(eq(youtubeThumbnailVersions.videoId, video.id))
      .orderBy(desc(youtubeThumbnailVersions.detectedAt)),
    db
      .select()
      .from(youtubeVideoMetricSnapshots)
      .where(eq(youtubeVideoMetricSnapshots.videoId, video.id))
      .orderBy(desc(youtubeVideoMetricSnapshots.capturedAt)),
    db
      .select()
      .from(optimizationExperiments)
      .where(
        and(
          eq(optimizationExperiments.creatorProfileId, input.creatorProfileId),
          eq(optimizationExperiments.subjectType, 'youtube_video'),
          eq(optimizationExperiments.subjectId, video.id)
        )
      )
      .orderBy(desc(optimizationExperiments.createdAt)),
  ]);

  return {
    thumbnails: thumbnails.map(thumbnail => ({
      id: thumbnail.id,
      kind: thumbnail.kind,
      imageUrl: thumbnail.imageUrl,
      approvalStatus: thumbnail.approvalStatus,
      experimentId: thumbnail.experimentId,
      detectedAt: thumbnail.detectedAt.toISOString(),
    })),
    metrics: metrics.map(metric => ({
      window: metric.window,
      views: metric.views,
      watchTimeMinutes: toNumber(metric.watchTimeMinutes),
      avgViewDurationSeconds: toNumber(metric.avgViewDurationSeconds),
      capturedAt: metric.capturedAt.toISOString(),
    })),
    experiments: experiments.map(experiment => ({
      id: experiment.id,
      objective: experiment.objective,
      status: experiment.status,
      winnerVariantKey: experiment.winnerVariantKey,
      variants: experiment.variants,
      decisionEvidence: experiment.decisionEvidence ?? null,
    })),
  };
}

/**
 * Approval queue: pending_review links across every profile owned by the
 * given app user (`users.id`, per the getCachedAuth contract). Ownership is
 * canonical userProfileClaims with the legacy creatorProfiles.userId fallback.
 */
export async function listPendingReleaseLinksForUser(
  appUserId: string
): Promise<PendingReleaseLinkItem[]> {
  const rows = await db
    .select({ link: youtubeVideoReleaseLinks, video: youtubeVideos })
    .from(youtubeVideoReleaseLinks)
    .innerJoin(
      youtubeVideos,
      eq(youtubeVideos.id, youtubeVideoReleaseLinks.videoId)
    )
    .innerJoin(
      creatorProfiles,
      eq(creatorProfiles.id, youtubeVideos.creatorProfileId)
    )
    .leftJoin(
      userProfileClaims,
      and(
        eq(userProfileClaims.creatorProfileId, creatorProfiles.id),
        eq(userProfileClaims.userId, appUserId)
      )
    )
    .where(
      and(
        eq(youtubeVideoReleaseLinks.status, 'pending_review'),
        or(
          isNotNull(userProfileClaims.id),
          eq(creatorProfiles.userId, appUserId)
        )
      )
    )
    .orderBy(desc(youtubeVideoReleaseLinks.createdAt))
    .limit(MAX_LIST_LIMIT);

  return rows.map(r => ({
    id: r.link.id,
    videoId: r.link.videoId,
    youtubeVideoId: r.video.videoId,
    videoTitle: r.video.title,
    isrc: r.link.isrc,
    matchSource: r.link.matchSource,
    confidence: Number(r.link.confidence),
    status: r.link.status,
    rationale: r.link.rationale,
    createdAt: r.link.createdAt.toISOString(),
  }));
}

/**
 * Resolve a public YouTube video id to its internal row id, scoped to the
 * owning profile. Returns null when the video is unknown or not owned.
 */
export async function getVideoPkForProfile(input: {
  creatorProfileId: string;
  videoId: string;
}): Promise<string | null> {
  const [video] = await db
    .select({ id: youtubeVideos.id })
    .from(youtubeVideos)
    .where(
      and(
        eq(youtubeVideos.creatorProfileId, input.creatorProfileId),
        eq(youtubeVideos.videoId, input.videoId)
      )
    )
    .limit(1);
  return video?.id ?? null;
}

/** Raw count of videos per channel — used by tests and ops diagnostics. */
export async function countVideosForChannel(
  channelId: string
): Promise<number> {
  const [row] = await db
    .select({ count: drizzleSql<number>`count(*)::int` })
    .from(youtubeVideos)
    .where(eq(youtubeVideos.channelId, channelId));
  return row?.count ?? 0;
}
