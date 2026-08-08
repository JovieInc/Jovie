/**
 * Winner metric helpers for channel intelligence (JOV-3193).
 *
 * Primary metric: watch_minutes_per_impression
 *   = watchMinutes / impressions
 *   ≈ ctr × avg_view_duration_minutes
 *
 * Ranking MUST use this metric, never CTR alone. A thumbnail that wins clicks
 * but loses retention must rank lower.
 */

import type { ChannelVideoMetrics, LengthBucket } from './types';

/** Minimum impressions before a video enters ranking / correlation. */
export const MIN_IMPRESSIONS_FOR_RANK = 100;

/** Reach trend below this is treated as declining. */
export const DECLINING_REACH_THRESHOLD = -0.1;

/**
 * Content length buckets (seconds):
 * short &lt; 3 min, medium 3–10 min, long &gt; 10 min.
 */
export const LENGTH_SHORT_MAX_SECONDS = 180;
export const LENGTH_MEDIUM_MAX_SECONDS = 600;

/**
 * Computes watch_minutes_per_impression.
 *
 * Prefers Reporting-API watchMinutes / impressions. Falls back to
 * CTR × avg view duration (minutes) when watch minutes are missing but
 * impressions + CTR + AVD are present — same identity used in the packaging
 * experiment engine.
 */
export function watchMinutesPerImpression(v: ChannelVideoMetrics): number {
  if (v.impressions <= 0) return 0;

  if (v.watchMinutes > 0) {
    return v.watchMinutes / v.impressions;
  }

  // Fallback: CTR × AVD(minutes) ≈ watch_minutes / impressions
  if (v.ctr > 0 && v.avgViewDurationSeconds > 0) {
    return v.ctr * (v.avgViewDurationSeconds / 60);
  }

  return 0;
}

/**
 * CTR × average view duration in minutes — explicit form of the epic metric.
 * Exposed for tests and callers that already hold CTR/AVD only.
 */
export function ctrTimesAvgViewDurationMinutes(
  ctr: number,
  avgViewDurationSeconds: number
): number {
  if (ctr <= 0 || avgViewDurationSeconds <= 0) return 0;
  return ctr * (avgViewDurationSeconds / 60);
}

export function lengthBucket(
  durationSeconds: number | null | undefined
): LengthBucket | null {
  if (durationSeconds == null || durationSeconds < 0) return null;
  if (durationSeconds < LENGTH_SHORT_MAX_SECONDS) return 'short';
  if (durationSeconds <= LENGTH_MEDIUM_MAX_SECONDS) return 'medium';
  return 'long';
}

export function lengthBucketLabel(bucket: LengthBucket): string {
  switch (bucket) {
    case 'short':
      return 'Short (<3 min)';
    case 'medium':
      return 'Medium (3–10 min)';
    case 'long':
      return 'Long (>10 min)';
  }
}

export function isEligibleForRank(v: ChannelVideoMetrics): boolean {
  return v.impressions >= MIN_IMPRESSIONS_FOR_RANK;
}

export function isDeclining(v: ChannelVideoMetrics): boolean {
  return v.reachTrend < DECLINING_REACH_THRESHOLD;
}
