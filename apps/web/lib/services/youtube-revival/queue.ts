/**
 * YouTube Revival Queue — Scoring Logic
 *
 * Pure functions that identify underperforming videos and rank them by
 * revival opportunity. No DB access — callers own storage and transport.
 *
 * Scoring criteria (from GH-10921 AC):
 * 1. CTR < channel median for same traffic source
 * 2. watch-min/impression < baseline
 * 3. High impressions / low views (CTR < 0.5 × median)
 * 4. Evergreen video with declining reach (reachTrend < threshold)
 */

import type {
  ChallengerSet,
  ChannelBaseline,
  RevivalCandidate,
  RevivalFlag,
  VideoMetrics,
} from './types';

/** Minimum impressions for a video to be considered for revival */
export const MIN_IMPRESSIONS_FOR_REVIVAL = 1_000;

/**
 * Watch-min/impression ratio threshold multiplier.
 * A video is flagged when its ratio is below (median × this factor).
 */
export const WATCH_MIN_BASELINE_FACTOR = 0.8;

/**
 * CTR ratio for the "high impressions / low views" flag.
 * A video is flagged when CTR < (median × this factor).
 */
export const HIGH_IMPRESSION_LOW_VIEW_CTR_FACTOR = 0.5;

/** Reach trend threshold below which a decline is flagged */
export const DECLINING_REACH_THRESHOLD = -0.1;

/**
 * Maximum opportunity score.
 * Score is the sum of flag weights, clamped to this ceiling.
 */
const MAX_OPPORTUNITY_SCORE = 100;

/** Weight contributed to opportunityScore by each flag */
const FLAG_WEIGHTS: Record<RevivalFlag, number> = {
  ctr_below_median: 25,
  watch_min_per_impression_below_baseline: 25,
  high_impressions_low_views: 30,
  evergreen_declining_reach: 20,
};

/** Derive watchMinPerImpression from raw metrics */
function watchMinPerImpression(metrics: VideoMetrics): number {
  if (metrics.impressions <= 0) return 0;
  return metrics.watchMinutes / metrics.impressions;
}

/**
 * Evaluate which underperformance flags apply to a single video.
 * Returns an empty array when the video passes all checks.
 */
export function classifyUnderperformer(
  metrics: VideoMetrics,
  baseline: ChannelBaseline
): RevivalFlag[] {
  if (metrics.impressions < MIN_IMPRESSIONS_FOR_REVIVAL) return [];

  const flags: RevivalFlag[] = [];
  const wmpI = watchMinPerImpression(metrics);
  const baselineWmpI = baseline.medianWatchMinPerImpression;

  if (metrics.ctr < baseline.medianCtr) {
    flags.push('ctr_below_median');
  }

  if (baselineWmpI > 0 && wmpI < baselineWmpI * WATCH_MIN_BASELINE_FACTOR) {
    flags.push('watch_min_per_impression_below_baseline');
  }

  if (metrics.ctr < baseline.medianCtr * HIGH_IMPRESSION_LOW_VIEW_CTR_FACTOR) {
    flags.push('high_impressions_low_views');
  }

  if (metrics.isEvergreen && metrics.reachTrend < DECLINING_REACH_THRESHOLD) {
    flags.push('evergreen_declining_reach');
  }

  return flags;
}

/**
 * Compute an opportunity score (0–100) from the set of flags that fired.
 * Higher score = more upside from a packaging swap.
 */
export function scoreOpportunity(flags: RevivalFlag[]): number {
  const raw = flags.reduce((sum, flag) => sum + FLAG_WEIGHTS[flag], 0);
  return Math.min(raw, MAX_OPPORTUNITY_SCORE);
}

/**
 * Build challenger sets recommended for a video based on its flags.
 * Returns 1–3 distinct hypotheses to test.
 */
export function buildChallengerSets(flags: RevivalFlag[]): ChallengerSet[] {
  const challengers: ChallengerSet[] = [];

  if (
    flags.includes('ctr_below_median') ||
    flags.includes('high_impressions_low_views')
  ) {
    challengers.push({
      hypothesis: 'Test a face-in-thumbnail vs. no-face variant',
      packagingElement: 'face',
      rationale:
        'Low CTR is often resolved by swapping the face presence based on niche priors.',
    });
    challengers.push({
      hypothesis: 'Rewrite the title with a stronger curiosity or benefit hook',
      packagingElement: 'title_hook',
      rationale:
        'Titles under 30 characters with a clear promise outperform longer descriptive titles in search and browse.',
    });
  }

  if (flags.includes('evergreen_declining_reach')) {
    challengers.push({
      hypothesis:
        'Refresh thumbnail with high-contrast color palette (cyan or green dominant)',
      packagingElement: 'color',
      rationale:
        'Declining reach on evergreen content responds to a visual refresh that re-attracts browse impressions.',
    });
  }

  if (
    flags.includes('watch_min_per_impression_below_baseline') &&
    challengers.length === 0
  ) {
    challengers.push({
      hypothesis:
        'Align thumbnail/title promise with the actual video content (first-30s hook)',
      packagingElement: 'combined',
      rationale:
        'Low watch-minutes relative to impressions signals a packaging promise that the content does not deliver.',
    });
  }

  // Deduplicate by packagingElement
  const seen = new Set<string>();
  return challengers.filter(c => {
    if (seen.has(c.packagingElement)) return false;
    seen.add(c.packagingElement);
    return true;
  });
}

/**
 * Score a single video and return a RevivalCandidate, or null if it does
 * not qualify as an underperformer.
 */
export function scoreVideo(
  metrics: VideoMetrics,
  baseline: ChannelBaseline
): RevivalCandidate | null {
  const flags = classifyUnderperformer(metrics, baseline);
  if (flags.length === 0) return null;

  return {
    videoId: metrics.videoId,
    title: metrics.title,
    thumbnailUrl: metrics.thumbnailUrl,
    publishedAt: metrics.publishedAt,
    flags,
    opportunityScore: scoreOpportunity(flags),
    challengers: buildChallengerSets(flags),
    metrics: {
      impressions: metrics.impressions,
      ctr: metrics.ctr,
      views: metrics.views,
      watchMinPerImpression: watchMinPerImpression(metrics),
      reachTrend: metrics.reachTrend,
      trafficSource: metrics.trafficSource,
    },
  };
}

/**
 * Build the revival queue from a list of videos and their channel baseline.
 * Returns candidates sorted by opportunityScore descending (highest upside first).
 */
export function buildRevivalQueue(
  videos: readonly VideoMetrics[],
  baselines: readonly ChannelBaseline[]
): RevivalCandidate[] {
  const baselineMap = new Map<string, ChannelBaseline>(
    baselines.map(b => [b.trafficSource, b])
  );

  const candidates: RevivalCandidate[] = [];

  for (const video of videos) {
    const baseline = baselineMap.get(video.trafficSource);
    if (!baseline) continue;

    const candidate = scoreVideo(video, baseline);
    if (candidate) candidates.push(candidate);
  }

  return candidates.sort((a, b) => b.opportunityScore - a.opportunityScore);
}
