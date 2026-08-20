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
  ChannelPlaylistRuleCaseId,
  ChannelPlaylistRuleCaseResult,
  GateChannelPlaylistsInput,
} from './playlist-rules';
export {
  CHANNEL_PLAYLIST_RULE_CASE_IDS,
  CHANNEL_PLAYLIST_TARGET_RULES,
  evaluateAllChannelPlaylistRuleCases,
  evaluateChannelPlaylistRuleCase,
  gateChannelPlaylists,
  PLAYLIST_DORMANT_MS,
  PLAYLIST_FRESH_90D_MS,
  PLAYLIST_RECOMMENDATION_CAP_MAX,
  PLAYLIST_RECOMMENDATION_CAP_MIN,
} from './playlist-rules';
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
  ChannelPlaylistGateResult,
  ChannelVideoMetrics,
  ChannelWinSignal,
  CorrelationDimension,
  CorrelationGroup,
  DurationBucket,
  FetchedPlaylistRow,
  GatedPlaylistRecommendation,
  LearningLayerWinAnnotation,
  MetricSource,
  MetricSourceKind,
  PlaylistFreshness,
  PlaylistPlacementStatus,
  RankedVideo,
  TitleLengthBucket,
} from './types';
