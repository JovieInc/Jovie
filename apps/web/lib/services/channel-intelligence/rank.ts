/**
 * Rank channel videos by watch_minutes_per_impression (JOV-3193).
 */

import { isEligibleForRank, watchMinutesPerImpression } from './metrics';
import type { ChannelVideoMetrics, MetricSource, RankedVideo } from './types';

const REPORTING_SOURCE: MetricSource = {
  kind: 'youtube_reporting_api',
  label: 'YouTube Reporting API',
  detail: 'watch_minutes_per_impression = watchMinutes / impressions',
};

function toRankedVideo(
  v: ChannelVideoMetrics,
  rank: number,
  wmpi: number
): RankedVideo {
  return {
    videoId: v.videoId,
    title: v.title,
    thumbnailUrl: v.thumbnailUrl,
    publishedAt: v.publishedAt,
    rank,
    watchMinutesPerImpression: wmpi,
    ctr: v.ctr,
    impressions: v.impressions,
    views: v.views,
    watchMinutes: v.watchMinutes,
    avgViewDurationSeconds: v.avgViewDurationSeconds,
    reachTrend: v.reachTrend,
    hasFace: v.hasFace,
    hasText: v.hasText,
    topic: v.topic,
    durationSeconds: v.durationSeconds,
    sources: [
      {
        ...REPORTING_SOURCE,
        videoIds: [v.videoId],
      },
    ],
  };
}

/**
 * Ranks eligible videos by watch_minutes_per_impression descending.
 * Never ranks by CTR alone.
 */
export function rankVideosByWatchMinutesPerImpression(
  videos: readonly ChannelVideoMetrics[]
): RankedVideo[] {
  const scored = videos
    .filter(isEligibleForRank)
    .map(v => ({
      video: v,
      wmpi: watchMinutesPerImpression(v),
    }))
    // Stable secondary sort by impressions when WMPI ties
    .sort((a, b) => {
      if (b.wmpi !== a.wmpi) return b.wmpi - a.wmpi;
      return b.video.impressions - a.video.impressions;
    });

  return scored.map((entry, index) =>
    toRankedVideo(entry.video, index + 1, entry.wmpi)
  );
}

export function channelMeanWmpi(ranked: readonly RankedVideo[]): number {
  if (ranked.length === 0) return 0;
  const sum = ranked.reduce((acc, v) => acc + v.watchMinutesPerImpression, 0);
  return sum / ranked.length;
}
