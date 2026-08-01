/**
 * Build a full channel-intelligence report from Reporting-API shaped metrics.
 */

import {
  computeChannelCorrelations,
  mergeLearningLayerAnnotations,
} from './correlations';
import {
  meanWatchMinutesPerImpression,
  rankDecliningVideos,
  rankVideosByWatchMinutesPerImpression,
  rankWorstVideosByWatchMinutesPerImpression,
} from './metrics';
import type {
  BuildChannelIntelligenceReportInput,
  ChannelIntelligenceReport,
  MetricSource,
} from './types';

const DEFAULT_LIST_LIMIT = 10;

function reportingSources(
  videoIds: readonly string[],
  windowStart: string | null,
  windowEnd: string | null
): MetricSource[] {
  return [
    {
      kind: 'youtube_reporting_api',
      label: 'YouTube Reporting API',
      metricKeys: [
        'impressions',
        'views',
        'watch_minutes',
        'ctr',
        'average_view_duration',
        'watch_minutes_per_impression',
      ],
      videoIds,
      ...(windowStart ? { windowStart } : {}),
      ...(windowEnd ? { windowEnd } : {}),
    },
    {
      kind: 'derived',
      label: 'Derived: watch_minutes_per_impression',
      metricKeys: ['watch_minutes_per_impression'],
      videoIds,
    },
  ];
}

/**
 * Build the channel-intelligence dashboard report.
 *
 * Ranking is always by watch_minutes_per_impression (not CTR alone).
 * Win signals come from packaging correlations on THIS channel's data,
 * optionally annotated by the packaging learning layer.
 */
export function buildChannelIntelligenceReport(
  input: BuildChannelIntelligenceReportInput
): ChannelIntelligenceReport {
  const listLimit = input.listLimit ?? DEFAULT_LIST_LIMIT;
  const windowStart = input.windowStart ?? null;
  const windowEnd = input.windowEnd ?? null;
  const generatedAt = input.nowIso ?? new Date().toISOString();

  const bestVideos = rankVideosByWatchMinutesPerImpression(input.videos).slice(
    0,
    listLimit
  );
  const worstVideos = rankWorstVideosByWatchMinutesPerImpression(
    input.videos
  ).slice(0, listLimit);
  const decliningVideos = rankDecliningVideos(input.videos).slice(0, listLimit);

  const metricSignals = computeChannelCorrelations(input.videos);
  const winSignals = mergeLearningLayerAnnotations(
    metricSignals,
    input.learningLayerSummaries
  );

  const videoIds = input.videos.map(v => v.videoId);
  const sources = reportingSources(videoIds, windowStart, windowEnd);

  if (input.learningLayerSummaries?.some(a => a.source === 'observed')) {
    sources.push({
      kind: 'learning_layer',
      label: 'Channel packaging learning layer',
      metricKeys: ['experiment_lift', 'face', 'text', 'title_length'],
    });
  }

  return {
    channelId: input.channelId,
    generatedAt,
    windowStart,
    windowEnd,
    videoCount: input.videos.length,
    channelMeanWatchMinutesPerImpression: meanWatchMinutesPerImpression(
      input.videos
    ),
    bestVideos,
    worstVideos,
    decliningVideos,
    winSignals,
    sources,
  };
}
