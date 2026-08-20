/**
 * YouTube Library — provider-facing types (JOV-5136)
 *
 * The sync engine (`sync.ts`) is written against the `YouTubeLibraryProvider`
 * interface so the real YouTube Data/Analytics API client (landing with the
 * OAuth connector in JOV-3189) can plug in without changing sync logic.
 */

import type { YouTubeThumbnailSet } from '@/lib/db/schema/youtube-library';

/** Metric window identifiers — mirrors `youtubeMetricWindowEnum`. */
export type YouTubeMetricWindow =
  | 'day_1'
  | 'day_7'
  | 'day_28'
  | 'day_90'
  | 'lifetime'
  | 'experiment';

/** One video on a creator's YouTube channel, as reported by the provider. */
export interface YouTubeChannelVideo {
  readonly channelId: string;
  readonly videoId: string;
  readonly title: string;
  readonly description: string | null;
  readonly publishedAt: Date | null;
  readonly durationSeconds: number | null;
  readonly url: string;
  readonly privacyStatus: string | null;
  readonly thumbnails: YouTubeThumbnailSet;
}

/** Analytics payload for one video over one window. */
export interface YouTubeVideoMetrics {
  readonly videoId: string;
  readonly window: YouTubeMetricWindow;
  readonly windowStart: Date;
  readonly windowEnd: Date;
  readonly impressions: number | null;
  readonly ctr: number | null;
  readonly views: number | null;
  readonly watchTimeMinutes: number | null;
  readonly watchTimePerImpression: number | null;
  readonly avgViewDurationSeconds: number | null;
  readonly trafficSources: Record<string, number> | null;
  /** Only present when the OAuth grant includes the revenue scope. */
  readonly revenueMicros?: number | null;
  readonly currency?: string | null;
}

/**
 * Pluggable YouTube data source. The real implementation (JOV-3189) calls the
 * YouTube Data API v3 + YouTube Analytics API; tests use fakes.
 */
export interface YouTubeLibraryProvider {
  /** List all videos for a channel. */
  listChannelVideos(channelId: string): Promise<YouTubeChannelVideo[]>;
  /** Fetch analytics for a set of videos over the given windows. */
  fetchVideoMetrics(
    channelId: string,
    videoIds: string[],
    windows: YouTubeMetricWindow[]
  ): Promise<YouTubeVideoMetrics[]>;
}
