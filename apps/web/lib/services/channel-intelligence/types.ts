/**
 * Channel-intelligence report types (JOV-3193).
 * Pure types — connector hydrates YouTube Reporting / Analytics API rows.
 */

export type TitleLengthBucket = 'short' | 'medium' | 'long';
export type DurationBucket = 'short' | 'medium' | 'long';

export interface ChannelVideoMetrics {
  readonly videoId: string;
  readonly title: string;
  readonly thumbnailUrl?: string;
  readonly publishedAt: string;
  readonly impressions: number;
  readonly views: number;
  readonly watchMinutes: number;
  /** CTR 0–1 */
  readonly ctr: number;
  readonly avgViewDurationSeconds: number;
  /** (recent - older) / older impressions */
  readonly reachTrend: number;
  readonly hasFace: boolean | null;
  readonly hasText: boolean | null;
  readonly topic: string | null;
  readonly titleWordCount: number | null;
  readonly durationSeconds: number | null;
}

export type MetricSourceKind =
  | 'youtube_reporting_api'
  | 'youtube_analytics_api'
  | 'learning_layer'
  | 'derived';

export interface MetricSource {
  readonly kind: MetricSourceKind;
  readonly label: string;
  readonly metricKeys: readonly string[];
  readonly videoIds?: readonly string[];
  readonly windowStart?: string;
  readonly windowEnd?: string;
}

export interface RankedVideo {
  readonly videoId: string;
  readonly title: string;
  readonly thumbnailUrl?: string;
  readonly publishedAt: string;
  readonly watchMinutesPerImpression: number;
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
  readonly key: string;
  readonly dimension: CorrelationDimension;
  readonly label: string;
  readonly sampleSize: number;
  readonly meanWatchMinutesPerImpression: number;
  readonly liftVsChannelMean: number;
}

export interface ChannelWinSignal {
  readonly dimension: CorrelationDimension;
  readonly summary: string;
  readonly winningLabel: string | null;
  readonly losingLabel: string | null;
  readonly liftPercent: number;
  readonly sampleSize: number;
  readonly confidence: 'low' | 'medium' | 'high';
  readonly groups: readonly CorrelationGroup[];
  readonly source: MetricSource;
}

export type ChannelChangeEvidenceTier =
  | 'reporting_api'
  | 'derived'
  | 'learning_layer'
  | 'insufficient';

export interface ChannelChangePlanItem {
  readonly priority: number;
  readonly action: string;
  readonly observation: string;
  readonly evidenceTier: ChannelChangeEvidenceTier;
  readonly sources: readonly MetricSource[];
}

export type PlaylistFreshness = '90d' | '12m' | 'unknown';
export type PlaylistPlacementStatus = 'current' | 'past' | 'unknown';

/**
 * A playlist row as fetched this run. Missing fields stay missing —
 * the gate never invents a name, URL, or follower count.
 */
export interface FetchedPlaylistRow {
  readonly id: string;
  readonly name?: string | null;
  readonly url?: string | null;
  readonly followerCount?: number | null;
  /** Last add or other list activity, ISO-8601 when known. */
  readonly lastActivityAt?: string | null;
  readonly placementStatus?: PlaylistPlacementStatus | null;
  /** Peers currently on this list, when peer-placement data exists. */
  readonly peerCount?: number | null;
  readonly artistIsOnList?: boolean | null;
}

export interface GatedPlaylistRecommendation {
  readonly id: string;
  readonly name?: string;
  readonly url?: string;
  readonly followerCount?: number;
  readonly freshness: PlaylistFreshness;
  readonly placementStatus: PlaylistPlacementStatus;
  /** True only when peer data exists: 2+ peers and the artist is not on the list. */
  readonly peerWarmth: boolean;
}

export interface ChannelPlaylistGateResult {
  readonly recommendations: readonly GatedPlaylistRecommendation[];
  readonly empty: boolean;
  readonly emptyReason: string | null;
}

export interface ChannelIntelligenceReport {
  readonly channelId: string;
  readonly generatedAt: string;
  readonly windowStart: string | null;
  readonly windowEnd: string | null;
  readonly videoCount: number;
  readonly channelMeanWatchMinutesPerImpression: number;
  readonly bestVideos: readonly RankedVideo[];
  readonly worstVideos: readonly RankedVideo[];
  readonly decliningVideos: readonly RankedVideo[];
  readonly winSignals: readonly ChannelWinSignal[];
  readonly changePlan: readonly ChannelChangePlanItem[];
  readonly sources: readonly MetricSource[];
  readonly playlists: readonly GatedPlaylistRecommendation[];
  readonly playlistGate: {
    readonly empty: boolean;
    readonly emptyReason: string | null;
  };
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
  readonly nowIso?: string;
  readonly listLimit?: number;
  readonly learningLayerSummaries?: readonly LearningLayerWinAnnotation[];
  /** Playlist rows fetched this run. Omitted/empty → report says empty; never invent. */
  readonly playlists?: readonly FetchedPlaylistRow[] | null;
  /**
   * Optional draft recommendations to reconcile against fetched rows.
   * IDs not in the fetch are refused; fields come from the fetched row only.
   */
  readonly proposedPlaylists?: readonly FetchedPlaylistRow[] | null;
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
  readonly listLimit?: number;
}
