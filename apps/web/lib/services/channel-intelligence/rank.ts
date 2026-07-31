/**
 * Rank channel videos by watch_minutes_per_impression (not CTR alone).
 */

import {
  ctrTimesAvgViewDurationMinutes,
  isDeclining,
  isRankable,
  watchMinutesPerImpression,
} from './metrics';
import type { ChannelVideoMetrics, RankedVideo } from './types';

function toRanked(metrics: ChannelVideoMetrics, rank: number): RankedVideo {
  return {
    videoId: metrics.videoId,
    title: metrics.title,
    thumbnailUrl: metrics.thumbnailUrl,
    publishedAt: metrics.publishedAt,
    watchMinutesPerImpression: watchMinutesPerImpression(metrics),
    ctrTimesAvgViewDurationMinutes: ctrTimesAvgViewDurationMinutes(metrics),
    ctr: metrics.ctr,
    avgViewDurationSeconds: metrics.avgViewDurationSeconds,
    impressions: metrics.impressions,
    views: metrics.views,
    watchMinutes: metrics.watchMinutes,
    reachTrend: metrics.reachTrend,
    rank,
  };
}

/**
 * Rank videos by watch_minutes_per_impression descending (best first).
 * Videos below the impression floor are excluded.
 */
export function rankVideosByWatchMinutesPerImpression(
  videos: readonly ChannelVideoMetrics[]
): RankedVideo[] {
  const sorted = videos
    .filter(isRankable)
    .slice()
    .sort((a, b) => {
      const wmpi = watchMinutesPerImpression(b) - watchMinutesPerImpression(a);
      if (wmpi !== 0) return wmpi;
      // Stable secondary: more impressions first when WMPI ties
      return b.impressions - a.impressions;
    });

  return sorted.map((video, index) => toRanked(video, index + 1));
}

/**
 * Worst videos: same ranking metric, ascending (lowest WMPI first).
 */
export function rankWorstVideosByWatchMinutesPerImpression(
  videos: readonly ChannelVideoMetrics[]
): RankedVideo[] {
  const bestFirst = rankVideosByWatchMinutesPerImpression(videos);
  return bestFirst
    .slice()
    .reverse()
    .map((video, index) => ({ ...video, rank: index + 1 }));
}

/**
 * Videos with declining reach, ordered by WMPI ascending (weakest first among decliners).
 */
export function rankDecliningVideos(
  videos: readonly ChannelVideoMetrics[]
): RankedVideo[] {
  const declining = videos.filter(v => isRankable(v) && isDeclining(v));
  return rankWorstVideosByWatchMinutesPerImpression(declining);
}
