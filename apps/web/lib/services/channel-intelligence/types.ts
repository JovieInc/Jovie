/**
 * Channel-intelligence report types (JOV-3193 / GH-10917).
 *
 * Pure contracts for ranking videos by watch_minutes_per_impression,
 * correlating packaging attributes with wins on THIS channel, and answering
 * chat questions with cited Reporting-API sources.
 *
 * Live YouTube OAuth connector supplies metrics; this layer stays pure.
 */

/** Provenance for every numeric claim in the report. */
export interface MetricSource {
  readonly kind: 'youtube_reporting_api' | 'learning_layer' | 'derived';
  readonly label: string;
  readonly videoIds?: readonly string[];
  readonly detail?: string;
}

/**
 * Per-video metrics from YouTube Analytics / Reporting API, plus optional
 * packaging attributes used for per-channel correlation.
 */
export interface ChannelVideoMetrics {
  readonly videoId: string;
  readonly title: string;
  readonly thumbnailUrl?: string;
  /** ISO-8601 publish date */
  readonly publishedAt: string;
  /** Thumbnail impressions in the measurement window */
  readonly impressions: number;
  /** Click-through rate (0–1) */
  readonly ctr: number;
  readonly views: number;
  /** Total watch minutes in the window (Reporting API) */
  readonly watchMinutes: number;
  /** Average view duration in seconds */
  readonly avgViewDurationSeconds: number;
  /**
   * Reach trend: (recentImpressions - olderImpressions) / olderImpressions.
   * Negative = declining.
   */
  readonly reachTrend: number;
  /** Thumbnail face presence; null when unknown */
  readonly hasFace: boolean | null;
  /** Thumbnail text overlay; null when unknown */
  readonly hasText: boolean | null;
  /** Topic / niche tag for this video; null when unknown */
  readonly topic: string | null;
  /** Content length in seconds; null when unknown */
  readonly durationSeconds: number | null;
  /** Title word count; null when unknown */
  readonly titleWordCount: number | null;
}

export type CorrelationDimension = 'face' | 'text' | 'topic' | 'length';

export type LengthBucket = 'short' | 'medium' | 'long';

/** Video ranked by watch_minutes_per_impression (primary winner metric). */
export interface RankedVideo {
  readonly videoId: string;
  readonly title: string;
  readonly thumbnailUrl?: string;
  readonly publishedAt: string;
  readonly rank: number;
  /** Primary metric: watch_minutes / impressions */
  readonly watchMinutesPerImpression: number;
  /** CTR alone — never used as the ranking key */
  readonly ctr: number;
  readonly impressions: number;
  readonly views: number;
  readonly watchMinutes: number;
  readonly avgViewDurationSeconds: number;
  readonly reachTrend: number;
  readonly hasFace: boolean | null;
  readonly hasText: boolean | null;
  readonly topic: string | null;
  readonly durationSeconds: number | null;
  readonly sources: readonly MetricSource[];
}

export interface CorrelationFinding {
  readonly dimension: CorrelationDimension;
  /** Human-readable segment label, e.g. "Face", "No face", "Topic: music" */
  readonly segment: string;
  readonly segmentKey: string;
  readonly avgWatchMinutesPerImpression: number;
  readonly sampleSize: number;
  /** Relative lift vs channel mean WMPI (0.1 = +10%) */
  readonly liftVsChannel: number;
  readonly confidence: 'low' | 'medium' | 'high';
  readonly sources: readonly MetricSource[];
}

export type ChannelQuestionIntent =
  | 'best_videos'
  | 'worst_videos'
  | 'whats_working'
  | 'whats_declining'
  | 'channel_overview';

export interface ChannelIntelligenceAnswer {
  readonly intent: ChannelQuestionIntent;
  readonly summary: string;
  readonly rankedVideos: readonly RankedVideo[];
  readonly findings: readonly CorrelationFinding[];
  readonly sources: readonly MetricSource[];
  /** False when no Reporting-API metrics are available yet */
  readonly hasData: boolean;
}

export interface ChannelIntelligenceReport {
  readonly channelId: string;
  readonly generatedAt: string;
  /** Videos ranked best → worst by watch_minutes_per_impression */
  readonly rankedVideos: readonly RankedVideo[];
  /** Channel mean WMPI across ranked videos */
  readonly channelMeanWmpi: number;
  /** What correlates with wins on THIS channel */
  readonly correlations: readonly CorrelationFinding[];
  /** Top positive correlations (what works) */
  readonly whatWorks: readonly CorrelationFinding[];
  /** Videos with declining reach, ranked by severity */
  readonly declining: readonly RankedVideo[];
  readonly sources: readonly MetricSource[];
  readonly videoCount: number;
}
