/**
 * Channel-intelligence report (GH-10917 / JOV-3193).
 *
 * Pure query + summarize layer over YouTube Reporting API metrics:
 * rank by watch_minutes_per_impression, surface channel-specific packaging
 * correlations, and answer chat questions with sources.
 */

export {
  answerChannelIntelligenceQuery,
  classifyChannelIntelligenceIntent,
} from './answer';
export {
  computeChannelCorrelations,
  MIN_GROUP_SAMPLE,
  MIN_LIFT_ABS,
  mergeLearningLayerAnnotations,
} from './correlations';
export {
  ctrTimesAvgViewDurationMinutes,
  DECLINING_REACH_THRESHOLD,
  durationBucket,
  isDeclining,
  isRankable,
  MIN_IMPRESSIONS_FOR_RANKING,
  meanWatchMinutesPerImpression,
  rankDecliningVideos,
  rankVideosByWatchMinutesPerImpression,
  rankWorstVideosByWatchMinutesPerImpression,
  titleLengthBucket,
  watchMinutesPerImpression,
} from './metrics';
export type {
  ChannelIntelPlaylistCaseId,
  ChannelIntelPlaylistCaseResult,
  FetchedPlaylistRow,
  GatedPlaylistTarget,
  PlaylistActivityStatus,
  PlaylistDropReason,
  PlaylistFreshnessGateResult,
  PlaylistPeerWarmth,
} from './playlist-freshness';
export {
  CHANNEL_INTEL_PLAYLIST_CASE_IDS,
  CHANNEL_INTEL_PLAYLIST_FRESHNESS_RULES,
  evaluateAllChannelIntelPlaylistCases,
  evaluateChannelIntelPlaylistCase,
  formatPlaylistActivity,
  formatPlaylistFollowerCount,
  gatePlaylistTargets,
  PLAYLIST_DORMANT_DAYS,
  PLAYLIST_FRESH_DAYS,
  PLAYLIST_RECOMMEND_MAX,
  PLAYLIST_RECOMMEND_MIN,
} from './playlist-freshness';
export {
  buildChannelChangePlan,
  buildChannelIntelligenceReport,
} from './report';
export type {
  AnswerChannelIntelligenceQueryInput,
  BuildChannelIntelligenceReportInput,
  ChannelChangeEvidenceTier,
  ChannelChangePlanItem,
  ChannelIntelligenceAnswer,
  ChannelIntelligenceIntent,
  ChannelIntelligenceReport,
  ChannelVideoMetrics,
  ChannelWinSignal,
  CorrelationDimension,
  CorrelationGroup,
  DurationBucket,
  LearningLayerWinAnnotation,
  MetricSource,
  MetricSourceKind,
  RankedVideo,
  TitleLengthBucket,
} from './types';
