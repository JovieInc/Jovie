/**
 * YouTube thumbnail experiment detector (JOV-3935 / GH #13176).
 *
 * Flags videos with default/weak thumbnails and emits a suggested_actions card
 * with an evidence line + sourced projected-impact range. Pure builders for
 * the card payload; DB insert is a separate fail-soft helper.
 */

import { db } from '@/lib/db';
import { suggestedActions } from '@/lib/db/schema/connectors';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

export const YOUTUBE_THUMBNAIL_PLAYBOOK_KIND =
  'youtube.thumbnail_experiment' as const;

/** Industry-sourced projected CTR lift range for packaging improvements. */
export const PROJECTED_IMPACT_RANGE = {
  minPercent: 8,
  maxPercent: 35,
  source: 'YouTube packaging research (CTR band for custom vs default thumbs)',
} as const;

export interface WeakThumbnailVideo {
  readonly videoId: string;
  readonly title: string;
  readonly thumbnailUrl?: string | null;
  /** True when YouTube assigned an auto-generated / default frame. */
  readonly isDefaultThumbnail: boolean;
  /** Optional quality score 0–1; below threshold counts as weak. */
  readonly qualityScore?: number | null;
}

export interface ThumbnailDetectorInput {
  readonly userId: string;
  readonly channelId: string;
  readonly videos: readonly WeakThumbnailVideo[];
  readonly weakQualityThreshold?: number;
}

export interface ThumbnailOpportunityPayload {
  readonly playbook: typeof YOUTUBE_THUMBNAIL_PLAYBOOK_KIND;
  readonly channelId: string;
  readonly affectedVideoIds: readonly string[];
  readonly affectedCount: number;
  readonly projectedImpact: {
    readonly minPercent: number;
    readonly maxPercent: number;
    readonly source: string;
  };
  readonly title: string;
  readonly why: string;
  readonly primaryActionLabel: string;
}

const DEFAULT_WEAK_QUALITY = 0.45;

export function selectWeakThumbnailVideos(
  videos: readonly WeakThumbnailVideo[],
  weakQualityThreshold = DEFAULT_WEAK_QUALITY
): readonly WeakThumbnailVideo[] {
  return videos.filter(video => {
    if (video.isDefaultThumbnail) return true;
    if (
      typeof video.qualityScore === 'number' &&
      video.qualityScore < weakQualityThreshold
    ) {
      return true;
    }
    return false;
  });
}

export function buildThumbnailOpportunityPayload(
  input: ThumbnailDetectorInput
): ThumbnailOpportunityPayload | null {
  const weak = selectWeakThumbnailVideos(
    input.videos,
    input.weakQualityThreshold
  );
  if (weak.length === 0) return null;

  const count = weak.length;
  const title =
    count === 1
      ? 'Refresh a weak YouTube thumbnail'
      : `Refresh ${count} weak YouTube thumbnails`;
  const why = `${count} video${count === 1 ? '' : 's'} on your channel still use default or low-signal thumbnails. Custom packaging typically lifts CTR ${PROJECTED_IMPACT_RANGE.minPercent}–${PROJECTED_IMPACT_RANGE.maxPercent}% (${PROJECTED_IMPACT_RANGE.source}).`;

  return {
    playbook: YOUTUBE_THUMBNAIL_PLAYBOOK_KIND,
    channelId: input.channelId,
    affectedVideoIds: weak.map(v => v.videoId),
    affectedCount: count,
    projectedImpact: {
      minPercent: PROJECTED_IMPACT_RANGE.minPercent,
      maxPercent: PROJECTED_IMPACT_RANGE.maxPercent,
      source: PROJECTED_IMPACT_RANGE.source,
    },
    title,
    why,
    primaryActionLabel: 'Generate variants',
  };
}

/**
 * Insert a pending suggested_actions card for the thumbnail playbook.
 * Idempotent per (user, channel) via idempotencyKey.
 */
export async function emitThumbnailOpportunityCard(
  input: ThumbnailDetectorInput
): Promise<{ created: boolean; actionId: string | null }> {
  const payload = buildThumbnailOpportunityPayload(input);
  if (!payload) {
    return { created: false, actionId: null };
  }

  const idempotencyKey = `${input.userId}:youtube-thumb:${input.channelId}:${payload.affectedCount}`;

  try {
    const inserted = await db
      .insert(suggestedActions)
      .values({
        userId: input.userId,
        kind: YOUTUBE_THUMBNAIL_PLAYBOOK_KIND,
        payload,
        status: 'pending',
        sourceRefs: [
          {
            channelId: input.channelId,
            videoIds: payload.affectedVideoIds,
          },
        ],
        rationale: payload.why,
        idempotencyKey,
        sideEffects: [],
      })
      .onConflictDoNothing()
      .returning({ id: suggestedActions.id });

    if (inserted.length === 0) {
      return { created: false, actionId: null };
    }

    logger.info('[youtube-thumbnail-detector] emitted opportunity card', {
      userId: input.userId,
      channelId: input.channelId,
      affectedCount: payload.affectedCount,
      actionId: inserted[0].id,
    });

    return { created: true, actionId: inserted[0].id };
  } catch (error) {
    await captureError(
      'Failed to emit YouTube thumbnail opportunity card',
      error,
      {
        userId: input.userId,
        channelId: input.channelId,
      }
    );
    return { created: false, actionId: null };
  }
}

/**
 * Measurement report payload for the result card. Never fabricate numbers —
 * callers must pass real baseline/post deltas.
 */
export interface ThumbnailMeasurementReport {
  readonly experimentId: string;
  readonly deltaPercent: number;
  readonly items: readonly {
    readonly videoId: string;
    readonly label: string;
    readonly deltaPercent: number;
  }[];
}

export function buildThumbnailReportCardPayload(
  report: ThumbnailMeasurementReport
): {
  readonly kind: 'report';
  readonly title: string;
  readonly why: string;
  readonly metricLabel: string;
  readonly deltaPercent: number;
  readonly experimentId: string;
  readonly items: ThumbnailMeasurementReport['items'];
} {
  const sign = report.deltaPercent > 0 ? '+' : '';
  return {
    kind: 'report',
    title: 'YouTube thumbnail experiment results',
    why: `Measured ${sign}${report.deltaPercent.toFixed(1)}% change vs baseline across ${report.items.length} video${report.items.length === 1 ? '' : 's'}.`,
    metricLabel: 'Views / impressions delta',
    deltaPercent: report.deltaPercent,
    experimentId: report.experimentId,
    items: report.items,
  };
}
