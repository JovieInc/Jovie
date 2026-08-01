/**
 * Channel-intelligence report (JOV-3193 / GH-10917).
 *
 * Rank videos by watch_minutes_per_impression, surface per-channel packaging
 * correlations, and answer chat questions with Reporting-API sources.
 */

export {
  computeChannelCorrelations,
  findingsFromLearningLayer,
  MIN_SEGMENT_SAMPLE,
  selectWhatWorks,
} from './correlations';
export {
  ctrTimesAvgViewDurationMinutes,
  DECLINING_REACH_THRESHOLD,
  isDeclining,
  isEligibleForRank,
  LENGTH_MEDIUM_MAX_SECONDS,
  LENGTH_SHORT_MAX_SECONDS,
  lengthBucket,
  lengthBucketLabel,
  MIN_IMPRESSIONS_FOR_RANK,
  watchMinutesPerImpression,
} from './metrics';
export {
  answerChannelQuestion,
  answerChannelQuestionFromText,
  detectChannelQuestionIntent,
} from './qa';
export { channelMeanWmpi, rankVideosByWatchMinutesPerImpression } from './rank';
export {
  type BuildChannelIntelligenceReportInput,
  buildChannelIntelligenceReport,
  hasChannelIntelligenceData,
} from './report';
export type {
  ChannelIntelligenceAnswer,
  ChannelIntelligenceReport,
  ChannelQuestionIntent,
  ChannelVideoMetrics,
  CorrelationDimension,
  CorrelationFinding,
  LengthBucket,
  MetricSource,
  RankedVideo,
} from './types';
