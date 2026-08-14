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
  ChannelChangePlanItem,
  ChannelIntelligenceReport,
  MetricSource,
  RankedVideo,
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

const WEAK_CTR = 0.04;
const WEAK_AVD_SECONDS = 45;

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Turn ranked metrics into a prioritized change plan. The report is the
 * plan — WMPI/CTR are evidence, not the deliverable.
 */
export function buildChannelChangePlan(input: {
  readonly worstVideos: readonly RankedVideo[];
  readonly decliningVideos: readonly RankedVideo[];
  readonly winSignals: ChannelIntelligenceReport['winSignals'];
  readonly sources: readonly MetricSource[];
}): ChannelChangePlanItem[] {
  const items: ChannelChangePlanItem[] = [];
  const reportingSourcesForPlan = input.sources.filter(
    source =>
      source.kind === 'youtube_reporting_api' ||
      source.kind === 'derived' ||
      source.kind === 'learning_layer'
  );

  for (const signal of input.winSignals) {
    if (!signal.winningLabel) continue;
    items.push({
      priority: items.length + 1,
      action: `Do more of “${signal.winningLabel}” on the next upload (${signal.dimension}).`,
      observation: signal.summary,
      evidenceTier:
        signal.source.kind === 'learning_layer' ? 'learning_layer' : 'derived',
      sources: [signal.source],
    });
  }

  for (const video of input.worstVideos.slice(0, 3)) {
    const weakCtr = video.ctr < WEAK_CTR;
    const weakRetention = video.avgViewDurationSeconds < WEAK_AVD_SECONDS;
    if (!weakCtr && !weakRetention) continue;
    const gate =
      weakCtr && weakRetention
        ? 'CTR and retention both miss the continued-distribution gate'
        : weakCtr
          ? 'CTR misses the continued-distribution gate'
          : 'Retention misses the continued-distribution gate';
    items.push({
      priority: items.length + 1,
      action: weakCtr
        ? `Rewrite title/thumbnail for “${video.title}” (≤3 mobile-legible words).`
        : `Fix the first-30s hook on “${video.title}” before more distribution.`,
      observation: `${gate}: CTR ${formatPct(video.ctr)}, AVD ${Math.round(video.avgViewDurationSeconds)}s, WMPI ${video.watchMinutesPerImpression.toFixed(3)}.`,
      evidenceTier: 'reporting_api',
      sources: reportingSourcesForPlan,
    });
  }

  for (const video of input.decliningVideos.slice(0, 2)) {
    if (items.some(item => item.observation.includes(video.title))) continue;
    items.push({
      priority: items.length + 1,
      action: `Pause lookalike packaging for “${video.title}” until reach stabilizes.`,
      observation: `Reach ${formatPct(video.reachTrend)} with WMPI ${video.watchMinutesPerImpression.toFixed(3)}.`,
      evidenceTier: 'reporting_api',
      sources: reportingSourcesForPlan,
    });
  }

  if (items.length === 0) {
    items.push({
      priority: 1,
      action:
        'Collect more Reporting API rows (≥100 impressions) before changing packaging.',
      observation:
        'Not enough ranked videos or packaging variety to justify a change.',
      evidenceTier: 'insufficient',
      sources: reportingSourcesForPlan,
    });
  }

  return items.map((item, index) => ({ ...item, priority: index + 1 }));
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
    changePlan: buildChannelChangePlan({
      worstVideos,
      decliningVideos,
      winSignals,
      sources,
    }),
    sources,
  };
}
