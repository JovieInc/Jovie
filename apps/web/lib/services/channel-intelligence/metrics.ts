/**
 * Channel-intelligence metric derivations (GH-10917 / JOV-3193).
 *
 * Winner metric for the whole packaging epic:
 *   watch_minutes_per_impression
 *     = watch_minutes / impressions
 *     ≈ CTR × average_view_duration_minutes
 *
 * Never rank or declare winners by CTR alone — a thumbnail that wins clicks
 * but loses retention must lose.
 */

import type {
  ChannelVideoMetrics,
  DurationBucket,
  TitleLengthBucket,
} from './types';

/** Minimum impressions before a video enters ranking / correlation sets. */
export const MIN_IMPRESSIONS_FOR_RANKING = 100;

/** Reach trend below this is treated as declining. */
export const DECLINING_REACH_THRESHOLD = -0.1;

/**
 * Title word-count buckets (aligned with packaging niche titleLengthBias):
 * short < 5, medium 5–10, long > 10.
 */
export function titleLengthBucket(
  wordCount: number | null | undefined
): TitleLengthBucket | null {
  if (wordCount == null || !Number.isFinite(wordCount) || wordCount < 0) {
    return null;
  }
  if (wordCount < 5) return 'short';
  if (wordCount <= 10) return 'medium';
  return 'long';
}

/**
 * Video duration buckets (minutes of content):
 * short < 8 min, medium 8–20, long > 20.
 */
export function durationBucket(
  durationSeconds: number | null | undefined
): DurationBucket | null {
  if (
    durationSeconds == null ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds < 0
  ) {
    return null;
  }
  const minutes = durationSeconds / 60;
  if (minutes < 8) return 'short';
  if (minutes <= 20) return 'medium';
  return 'long';
}

/**
 * Primary ranking metric: watch_minutes / impressions.
 * Falls back to CTR × AVD(minutes) when impressions are missing but CTR+AVD exist.
 */
export function watchMinutesPerImpression(
  metrics: Pick<
    ChannelVideoMetrics,
    'impressions' | 'watchMinutes' | 'ctr' | 'avgViewDurationSeconds'
  >
): number {
  if (metrics.impressions > 0) {
    return metrics.watchMinutes / metrics.impressions;
  }
  return ctrTimesAvgViewDurationMinutes(metrics);
}

/**
 * Product form of the winner metric: CTR × average_view_duration_minutes.
 * Used for display and to prove ranking is not CTR-only.
 */
export function ctrTimesAvgViewDurationMinutes(
  metrics: Pick<ChannelVideoMetrics, 'ctr' | 'avgViewDurationSeconds'>
): number {
  if (metrics.ctr <= 0 || metrics.avgViewDurationSeconds <= 0) return 0;
  return metrics.ctr * (metrics.avgViewDurationSeconds / 60);
}

export function isRankable(
  metrics: Pick<ChannelVideoMetrics, 'impressions'>
): boolean {
  return metrics.impressions >= MIN_IMPRESSIONS_FOR_RANKING;
}

export function isDeclining(
  metrics: Pick<ChannelVideoMetrics, 'reachTrend'>
): boolean {
  return metrics.reachTrend < DECLINING_REACH_THRESHOLD;
}

export function meanWatchMinutesPerImpression(
  videos: readonly Pick<
    ChannelVideoMetrics,
    'impressions' | 'watchMinutes' | 'ctr' | 'avgViewDurationSeconds'
  >[]
): number {
  const rankable = videos.filter(isRankable);
  if (rankable.length === 0) return 0;
  const sum = rankable.reduce(
    (acc, v) => acc + watchMinutesPerImpression(v),
    0
  );
  return sum / rankable.length;
}
