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
  titleLengthBucket,
  watchMinutesPerImpression,
} from './metrics';
export {
  rankDecliningVideos,
  rankVideosByWatchMinutesPerImpression,
  rankWorstVideosByWatchMinutesPerImpression,
} from './rank';
export { buildChannelIntelligenceReport } from './report';
export type {
  AnswerChannelIntelligenceQueryInput,
  BuildChannelIntelligenceReportInput,
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
