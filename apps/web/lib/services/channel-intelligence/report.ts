/**
 * Builds the full channel-intelligence report (JOV-3193).
 */

import type { ChannelPackagingRules } from '@/lib/services/packaging-intelligence/channel-rules';
import {
  computeChannelCorrelations,
  findingsFromLearningLayer,
  selectWhatWorks,
} from './correlations';
import { isDeclining, isEligibleForRank } from './metrics';
import { channelMeanWmpi, rankVideosByWatchMinutesPerImpression } from './rank';
import type {
  ChannelIntelligenceReport,
  ChannelVideoMetrics,
  MetricSource,
  RankedVideo,
} from './types';

export interface BuildChannelIntelligenceReportInput {
  readonly channelId: string;
  readonly videos: readonly ChannelVideoMetrics[];
  /** Optional learning-layer rules for this channel */
  readonly channelRules?: ChannelPackagingRules | null;
  /** ISO timestamp override for tests */
  readonly nowIso?: string;
}

function decliningVideos(ranked: readonly RankedVideo[]): RankedVideo[] {
  return ranked
    .filter(v => v.reachTrend < -0.1)
    .sort((a, b) => a.reachTrend - b.reachTrend);
}

/**
 * Builds a channel-intelligence report from Reporting-API video metrics
 * and optional learning-layer packaging rules.
 */
export function buildChannelIntelligenceReport(
  input: BuildChannelIntelligenceReportInput
): ChannelIntelligenceReport {
  const generatedAt = input.nowIso ?? new Date().toISOString();
  const rankedVideos = rankVideosByWatchMinutesPerImpression(input.videos);
  const { findings: metricFindings, channelMeanWmpi: meanFromCorr } =
    computeChannelCorrelations(input.videos);
  const learningFindings = findingsFromLearningLayer(
    input.channelRules ?? null
  );

  // Prefer learning-layer keys when both speak to the same dimension signal
  const learningKeys = new Set(learningFindings.map(f => f.segmentKey));
  const mergedFindings = [
    ...learningFindings,
    ...metricFindings.filter(f => !learningKeys.has(f.segmentKey)),
  ].sort((a, b) => Math.abs(b.liftVsChannel) - Math.abs(a.liftVsChannel));

  const mean =
    rankedVideos.length > 0 ? channelMeanWmpi(rankedVideos) : meanFromCorr;

  const sources: MetricSource[] = [
    {
      kind: 'youtube_reporting_api',
      label: 'YouTube Reporting API',
      detail: `Ranked ${rankedVideos.length} of ${input.videos.length} videos by watch_minutes_per_impression`,
      videoIds: rankedVideos.map(v => v.videoId),
    },
  ];
  if (learningFindings.length > 0) {
    sources.push({
      kind: 'learning_layer',
      label: 'Channel packaging rules',
      detail: `${learningFindings.length} observed dimension rule(s)`,
    });
  }

  return {
    channelId: input.channelId,
    generatedAt,
    rankedVideos,
    channelMeanWmpi: mean,
    correlations: mergedFindings,
    whatWorks: selectWhatWorks(mergedFindings),
    declining: decliningVideos(rankedVideos),
    sources,
    videoCount: rankedVideos.length,
  };
}

/** True when at least one video is eligible for ranking. */
export function hasChannelIntelligenceData(
  videos: readonly ChannelVideoMetrics[]
): boolean {
  return videos.some(isEligibleForRank);
}

export { isDeclining };
