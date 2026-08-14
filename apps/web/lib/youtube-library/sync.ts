/**
 * YouTube Library — sync engine (JOV-5136)
 *
 * Provider-agnostic sync of a channel's videos, metric snapshots, thumbnail
 * history, and ISRC release links into the local substrate. The real YouTube
 * API provider lands with the OAuth connector (JOV-3189); everything here
 * runs against the `YouTubeLibraryProvider` interface and the repository
 * seam in `repository.ts`.
 */

import type {
  NewYoutubeThumbnailVersion,
  NewYoutubeVideo,
  NewYoutubeVideoMetricSnapshot,
  NewYoutubeVideoReleaseLink,
  YouTubeThumbnailSet,
  YoutubeThumbnailVersion,
  YoutubeVideo,
} from '@/lib/db/schema/youtube-library';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';
import { classifyYouTubeVideo } from './classify';
import { resolveReleaseLink } from './isrc';
import {
  drizzleYouTubeLibraryRepository,
  type YouTubeLibraryRepository,
} from './repository';
import type {
  YouTubeChannelVideo,
  YouTubeLibraryProvider,
  YouTubeMetricWindow,
  YouTubeVideoMetrics,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_WINDOWS: YouTubeMetricWindow[] = ['day_7', 'day_28', 'lifetime'];

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests)
// ---------------------------------------------------------------------------

/**
 * Pick the best thumbnail URL from a YouTube thumbnail set
 * (same preference order as `getBestThumbnail` in lib/youtube/metadata.ts).
 */
export function bestThumbnailUrl(
  thumbnails: YouTubeThumbnailSet | null | undefined
): string | null {
  if (!thumbnails) return null;
  return (
    thumbnails.maxres?.url ??
    thumbnails.standard?.url ??
    thumbnails.high?.url ??
    thumbnails.medium?.url ??
    thumbnails.default?.url ??
    null
  );
}

/** Build the upsert row for one channel video (classification computed fresh). */
export function buildVideoUpsertRow(
  video: YouTubeChannelVideo,
  creatorProfileId: string,
  now: Date
): NewYoutubeVideo {
  const classification = classifyYouTubeVideo({
    title: video.title,
    description: video.description,
    durationSeconds: video.durationSeconds,
  });
  return {
    creatorProfileId,
    channelId: video.channelId,
    videoId: video.videoId,
    title: video.title,
    description: video.description,
    publishedAt: video.publishedAt,
    durationSeconds: video.durationSeconds,
    url: video.url,
    privacyStatus: video.privacyStatus,
    contentType: classification.contentType,
    classificationRationale: classification.rationale,
    classificationConfidence: classification.confidence.toFixed(4),
    currentThumbnails: video.thumbnails,
    lastSyncedAt: now,
    updatedAt: now,
  };
}

export interface ThumbnailSyncPlan {
  /** Existing version ids to relabel (current -> previous). */
  readonly relabelToPreviousIds: string[];
  readonly inserts: NewYoutubeThumbnailVersion[];
}

/**
 * Plan thumbnail history writes for one video.
 *
 * - New video: append the kind='original' row (approval not required).
 * - Existing video: if the best current thumbnail URL differs from the latest
 *   kind='current' (or 'original' when no current exists) version, relabel
 *   that row 'previous' and append a new kind='current' row.
 * - imageUrl/provenance of existing rows are never touched (append-only).
 */
export function planThumbnailSync(args: {
  videoPk: string;
  thumbnails: YouTubeThumbnailSet | null | undefined;
  versions: readonly YoutubeThumbnailVersion[];
  isNew: boolean;
  now: Date;
}): ThumbnailSyncPlan {
  const { videoPk, thumbnails, versions, isNew, now } = args;
  const best = bestThumbnailUrl(thumbnails);
  if (!best) return { relabelToPreviousIds: [], inserts: [] };

  const detected = {
    videoId: videoPk,
    imageUrl: best,
    provenance: { source: 'youtube' as const },
    detectedAt: now,
  };

  if (isNew || versions.length === 0) {
    return {
      relabelToPreviousIds: [],
      inserts: [
        { ...detected, kind: 'original', approvalStatus: 'not_required' },
      ],
    };
  }

  const byDetectedAtDesc = [...versions].sort(
    (a, b) => b.detectedAt.getTime() - a.detectedAt.getTime()
  );
  const effective =
    byDetectedAtDesc.find(v => v.kind === 'current') ??
    byDetectedAtDesc.find(v => v.kind === 'original') ??
    null;

  if (!effective) return { relabelToPreviousIds: [], inserts: [] };
  if (effective.imageUrl === best) {
    return { relabelToPreviousIds: [], inserts: [] };
  }

  return {
    relabelToPreviousIds: [effective.id],
    inserts: [{ ...detected, kind: 'current', approvalStatus: 'not_required' }],
  };
}

/** Map provider metrics to snapshot rows (unknown video ids are skipped). */
export function buildSnapshotRows(
  metrics: readonly YouTubeVideoMetrics[],
  pkByVideoId: ReadonlyMap<string, string>,
  now: Date
): NewYoutubeVideoMetricSnapshot[] {
  const rows: NewYoutubeVideoMetricSnapshot[] = [];
  for (const m of metrics) {
    const videoPk = pkByVideoId.get(m.videoId);
    if (!videoPk) continue;
    rows.push({
      videoId: videoPk,
      window: m.window,
      windowStart: m.windowStart,
      windowEnd: m.windowEnd,
      impressions: m.impressions,
      ctr: m.ctr === null ? null : m.ctr.toFixed(6),
      views: m.views,
      watchTimeMinutes:
        m.watchTimeMinutes === null ? null : m.watchTimeMinutes.toFixed(2),
      watchTimePerImpression:
        m.watchTimePerImpression === null
          ? null
          : m.watchTimePerImpression.toFixed(4),
      avgViewDurationSeconds:
        m.avgViewDurationSeconds === null
          ? null
          : m.avgViewDurationSeconds.toFixed(2),
      trafficSources: m.trafficSources,
      revenueMicros: m.revenueMicros ?? null,
      currency: m.currency ?? null,
      capturedAt: now,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Sync orchestration
// ---------------------------------------------------------------------------

export interface SyncChannelVideosInput {
  readonly creatorProfileId: string;
  readonly channelId: string;
  readonly provider: YouTubeLibraryProvider;
  readonly windows?: readonly YouTubeMetricWindow[];
  readonly now?: Date;
  /** Test seam — defaults to the Drizzle-backed repository. */
  readonly repo?: YouTubeLibraryRepository;
}

export interface SyncChannelVideosResult {
  readonly creatorProfileId: string;
  readonly channelId: string;
  readonly total: number;
  readonly inserted: number;
  readonly updated: number;
  readonly snapshotsUpserted: number;
  readonly thumbnailsChanged: number;
  readonly linksCreated: number;
}

export async function syncChannelVideos(
  input: SyncChannelVideosInput
): Promise<SyncChannelVideosResult> {
  const repo = input.repo ?? drizzleYouTubeLibraryRepository;
  const now = input.now ?? new Date();
  const windows = input.windows ?? DEFAULT_WINDOWS;
  const { creatorProfileId, channelId, provider } = input;

  const [incoming, existing] = await Promise.all([
    provider.listChannelVideos(channelId),
    repo.listExistingVideos(creatorProfileId, channelId),
  ]);

  const existingByVideoId = new Map(existing.map(v => [v.videoId, v]));

  // 1. Upsert all videos on (channel_id, video_id).
  const upsertRows = incoming.map(v =>
    buildVideoUpsertRow(v, creatorProfileId, now)
  );
  const pkByVideoId =
    upsertRows.length > 0
      ? await repo.upsertVideos(upsertRows)
      : new Map<string, string>();

  // 2. Thumbnail history.
  const existingPks = existing.map(v => v.id);
  const existingVersions = await repo.listThumbnailVersions(existingPks);
  const versionsByVideoPk = new Map<string, YoutubeThumbnailVersion[]>();
  for (const version of existingVersions) {
    const list = versionsByVideoPk.get(version.videoId) ?? [];
    list.push(version);
    versionsByVideoPk.set(version.videoId, list);
  }

  const relabelIds: string[] = [];
  const thumbnailInserts: NewYoutubeThumbnailVersion[] = [];
  for (const video of incoming) {
    const pk = pkByVideoId.get(video.videoId);
    if (!pk) continue;
    const plan = planThumbnailSync({
      videoPk: pk,
      thumbnails: video.thumbnails,
      versions: versionsByVideoPk.get(pk) ?? [],
      isNew: !existingByVideoId.has(video.videoId),
      now,
    });
    relabelIds.push(...plan.relabelToPreviousIds);
    thumbnailInserts.push(...plan.inserts);
  }
  if (thumbnailInserts.length > 0) {
    await repo.insertThumbnailVersions(thumbnailInserts);
  }
  if (relabelIds.length > 0) {
    await repo.relabelThumbnailVersions(relabelIds, 'previous');
  }

  // 3. Metric snapshots (same window+range refreshes in place; new ranges append).
  let snapshotsUpserted = 0;
  if (windows.length > 0 && incoming.length > 0) {
    const metrics = await provider.fetchVideoMetrics(
      channelId,
      incoming.map(v => v.videoId),
      [...windows]
    );
    const snapshotRows = buildSnapshotRows(metrics, pkByVideoId, now);
    if (snapshotRows.length > 0) {
      await repo.upsertMetricSnapshots(snapshotRows);
      snapshotsUpserted = snapshotRows.length;
    }
  }

  // 4. ISRC release links for music videos without an existing link row.
  const linksCreated = await syncReleaseLinks({
    repo,
    creatorProfileId,
    incoming,
    existingByVideoId,
    pkByVideoId,
  });

  const inserted = incoming.filter(
    v => !existingByVideoId.has(v.videoId)
  ).length;
  return {
    creatorProfileId,
    channelId,
    total: incoming.length,
    inserted,
    updated: incoming.length - inserted,
    snapshotsUpserted,
    thumbnailsChanged: relabelIds.length,
    linksCreated,
  };
}

interface SyncReleaseLinksContext {
  readonly repo: YouTubeLibraryRepository;
  readonly creatorProfileId: string;
  readonly incoming: readonly YouTubeChannelVideo[];
  readonly existingByVideoId: ReadonlyMap<string, YoutubeVideo>;
  readonly pkByVideoId: ReadonlyMap<string, string>;
}

async function syncReleaseLinks(ctx: SyncReleaseLinksContext): Promise<number> {
  const { repo, creatorProfileId, incoming, existingByVideoId, pkByVideoId } =
    ctx;

  // Effective content type: fresh classification for new videos, stored value
  // for previously-classified rows.
  const candidates = incoming.filter(video => {
    const existing = existingByVideoId.get(video.videoId);
    const contentType = existing
      ? existing.classificationRationale === null
        ? classifyYouTubeVideo({
            title: video.title,
            description: video.description,
            durationSeconds: video.durationSeconds,
          }).contentType
        : existing.contentType
      : classifyYouTubeVideo({
          title: video.title,
          description: video.description,
          durationSeconds: video.durationSeconds,
        }).contentType;
    return contentType === 'music_video';
  });
  if (candidates.length === 0) return 0;

  const candidatePks = candidates
    .map(v => pkByVideoId.get(v.videoId))
    .filter((pk): pk is string => Boolean(pk));
  const linkedIds = new Set(await repo.listLinkedVideoIds(candidatePks));
  const unlinked = candidates.filter(v => {
    const pk = pkByVideoId.get(v.videoId);
    return pk && !linkedIds.has(pk);
  });
  if (unlinked.length === 0) return 0;

  const catalog = await repo.listCatalogRecordings(creatorProfileId);
  const linkRows: NewYoutubeVideoReleaseLink[] = [];
  for (const video of unlinked) {
    const videoPk = pkByVideoId.get(video.videoId);
    if (!videoPk) continue;
    const resolved = resolveReleaseLink({
      video: { title: video.title, description: video.description },
      catalog,
    });
    if (!resolved) continue;
    linkRows.push({
      videoId: videoPk,
      releaseId: resolved.releaseId,
      recordingId: resolved.recordingId,
      isrc: resolved.isrc,
      matchSource: resolved.matchSource,
      confidence: resolved.confidence.toFixed(4),
      status: resolved.status,
      rationale: resolved.rationale,
    });
  }

  if (linkRows.length > 0) {
    await repo.insertReleaseLinks(linkRows);
  }
  return linkRows.length;
}

// ---------------------------------------------------------------------------
// Scheduled refresh (cron seam)
// ---------------------------------------------------------------------------

export interface RunScheduledRefreshesInput {
  /** Null until the real YouTube provider lands with JOV-3189. */
  readonly provider: YouTubeLibraryProvider | null;
  readonly now?: Date;
  readonly repo?: YouTubeLibraryRepository;
}

export interface RunScheduledRefreshesResult {
  readonly skipped: boolean;
  readonly reason?: string;
  readonly synced?: number;
  readonly failed?: number;
}

/**
 * Re-sync every channel whose last sync is older than 24h (or never ran).
 * With `provider: null` this is a cheap no-op: the real provider wiring
 * lands with JOV-3189.
 */
export async function runScheduledRefreshes(
  input: RunScheduledRefreshesInput
): Promise<RunScheduledRefreshesResult> {
  if (!input.provider) {
    return { skipped: true, reason: 'no-provider' };
  }
  const repo = input.repo ?? drizzleYouTubeLibraryRepository;
  const now = input.now ?? new Date();
  const cutoff = new Date(now.getTime() - DAY_MS);

  const channels = await repo.listStaleChannels(cutoff);
  let synced = 0;
  let failed = 0;
  for (const channel of channels) {
    try {
      await syncChannelVideos({
        creatorProfileId: channel.creatorProfileId,
        channelId: channel.channelId,
        provider: input.provider,
        now,
        repo,
      });
      synced++;
    } catch (error) {
      failed++;
      logger.error('[youtube-library] scheduled refresh failed', {
        channelId: channel.channelId,
        error: error instanceof Error ? error.message : String(error),
      });
      await captureError('YouTube library scheduled refresh failed', error, {
        channelId: channel.channelId,
        creatorProfileId: channel.creatorProfileId,
      });
    }
  }
  return { skipped: false, synced, failed };
}
