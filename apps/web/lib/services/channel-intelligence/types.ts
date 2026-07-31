/**
 * Channel-intelligence report types (GH-10917 / JOV-3193).
 *
 * Pure types — no DB or network. Metrics are shaped for YouTube Reporting /
 * Analytics API rows; the connector is responsible for hydration.
 */

/** Title-length bucket aligned with packaging niche priors. */
export type TitleLengthBucket = 'short' | 'medium' | 'long';

/** Video runtime bucket for length correlation. */
export type DurationBucket = 'short' | 'medium' | 'long';

/**
 * Per-video metrics + packaging attributes for channel intelligence.
 * `watchMinutes` + `impressions` are the preferred ground truth; CTR and
 * avg view duration are kept so the product form (CTR × AVD) can be derived
 * or validated.
 */
export interface ChannelVideoMetrics {
  readonly videoId: string;
  readonly title: string;
  readonly thumbnailUrl?: string;
  /** ISO publish date */
  readonly publishedAt: string;
  /** Thumbnail impressions in the measurement window */
  readonly impressions: number;
  /** Views in the measurement window */
  readonly views: number;
  /** Total watch minutes in the measurement window */
  readonly watchMinutes: number;
  /** Click-through rate 0–1 from Reporting API */
  readonly ctr: number;
  /** Average view duration in seconds */
  readonly avgViewDurationSeconds: number;
  /**
   * Reach trend: negative = declining, 0 = flat, positive = growing.
   * (recentImpressions - olderImpressions) / olderImpressions.
   */
  readonly reachTrend: number;
  /** Face present in thumbnail (null when unknown / not classified) */
  readonly hasFace: boolean | null;
  /** Text overlay present on thumbnail (null when unknown) */
  readonly hasText: boolean | null;
  /** Topic / niche tag for this video (null = untagged) */
  readonly topic: string | null;
  /** Title word count (null when not provided) */
  readonly titleWordCount: number | null;
  /** Video duration in seconds (null when not provided) */
  readonly durationSeconds: number | null;
}

/** How a metric or claim was obtained — required for chat answers with sources. */
export type MetricSourceKind =
  | 'youtube_reporting_api'
  | 'youtube_analytics_api'
  | 'learning_layer'
  | 'derived';

export interface MetricSource {
  readonly kind: MetricSourceKind;
  /** Human-readable label for chat / UI footnotes */
  readonly label: string;
  /** Metric keys cited (e.g. watch_minutes_per_impression, ctr) */
  readonly metricKeys: readonly string[];
  readonly videoIds?: readonly string[];
  /** ISO window start when known */
  readonly windowStart?: string;
  /** ISO window end when known */
  readonly windowEnd?: string;
}

/** A ranked video row in the intelligence report. */
export interface RankedVideo {
  readonly videoId: string;
  readonly title: string;
  readonly thumbnailUrl?: string;
  readonly publishedAt: string;
  /** Primary ranking metric — never CTR alone */
  readonly watchMinutesPerImpression: number;
  /** CTR × avg_view_duration_minutes (product form of the same metric) */
  readonly ctrTimesAvgViewDurationMinutes: number;
  readonly ctr: number;
  readonly avgViewDurationSeconds: number;
  readonly impressions: number;
  readonly views: number;
  readonly watchMinutes: number;
  readonly reachTrend: number;
  readonly rank: number;
}

export type CorrelationDimension =
  | 'face'
  | 'text'
  | 'topic'
  | 'title_length'
  | 'duration';

export interface CorrelationGroup {
  /** Dimension bucket key, e.g. 'face:true', 'topic:music', 'title_length:short' */
  readonly key: string;
  readonly dimension: CorrelationDimension;
  readonly label: string;
  readonly sampleSize: number;
  readonly meanWatchMinutesPerImpression: number;
  /** Lift vs channel mean WMPI (fraction, e.g. 0.15 = +15%) */
  readonly liftVsChannelMean: number;
}

/**
 * A dimension-level win signal for this channel.
 * Prefer observed groups with enough sample; learning-layer priors may annotate.
 */
export interface ChannelWinSignal {
  readonly dimension: CorrelationDimension;
  readonly summary: string;
  /** Winning bucket label when one group clearly leads */
  readonly winningLabel: string | null;
  /** Losing / weaker bucket label when contrast is available */
  readonly losingLabel: string | null;
  readonly liftPercent: number;
  readonly sampleSize: number;
  readonly confidence: 'low' | 'medium' | 'high';
  readonly groups: readonly CorrelationGroup[];
  readonly source: MetricSource;
}

export interface ChannelIntelligenceReport {
  readonly channelId: string;
  readonly generatedAt: string;
  readonly windowStart: string | null;
  readonly windowEnd: string | null;
  readonly videoCount: number;
  readonly channelMeanWatchMinutesPerImpression: number;
  /** Best videos by WMPI descending */
  readonly bestVideos: readonly RankedVideo[];
  /** Worst videos by WMPI ascending (still ranked by WMPI, not CTR) */
  readonly worstVideos: readonly RankedVideo[];
  /** Videos with declining reach */
  readonly decliningVideos: readonly RankedVideo[];
  /** What correlates with wins on THIS channel */
  readonly winSignals: readonly ChannelWinSignal[];
  readonly sources: readonly MetricSource[];
}

export type ChannelIntelligenceIntent =
  | 'best_videos'
  | 'worst_videos'
  | 'whats_working'
  | 'whats_declining'
  | 'unknown';

export interface ChannelIntelligenceAnswer {
  readonly intent: ChannelIntelligenceIntent;
  readonly summary: string;
  readonly rankedVideos: readonly RankedVideo[];
  readonly winSignals: readonly ChannelWinSignal[];
  readonly sources: readonly MetricSource[];
}

export interface BuildChannelIntelligenceReportInput {
  readonly channelId: string;
  readonly videos: readonly ChannelVideoMetrics[];
  readonly windowStart?: string | null;
  readonly windowEnd?: string | null;
  /** ISO now override for tests */
  readonly nowIso?: string;
  /** Max rows in best / worst lists (default 10) */
  readonly listLimit?: number;
  /**
   * Optional learning-layer rules (from packaging-intelligence channel-rules).
   * When present, win signals for face/text/title may be annotated as observed.
   */
  readonly learningLayerSummaries?: readonly LearningLayerWinAnnotation[];
}

export interface LearningLayerWinAnnotation {
  readonly dimension: 'face' | 'text' | 'title_length';
  readonly summary: string;
  readonly liftPercent: number;
  readonly sampleSize: number;
  readonly confidence: number;
  readonly source: 'observed' | '1of10';
}

export interface AnswerChannelIntelligenceQueryInput {
  readonly question: string;
  readonly report: ChannelIntelligenceReport;
  /** Max ranked videos to include in the answer body (default 5) */
  readonly listLimit?: number;
}
