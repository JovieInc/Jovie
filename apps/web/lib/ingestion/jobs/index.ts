/**
 * Job Registry - Central export for all ingestion job processors.
 */

export { beaconsJobConfig, processBeaconsJob } from './beacons';
export { executeIngestionJob } from './executor';
export { instagramJobConfig, processInstagramJob } from './instagram';
export { deriveLayloHandle, layloJobConfig, processLayloJob } from './laylo';

// Platform-specific job processors
export { linktreeJobConfig, processLinktreeJob } from './linktree';
export type {
  BeaconsPayload,
  InstagramPayload,
  LayloPayload,
  LinktreePayload,
  TikTokPayload,
  TwitterPayload,
  YouTubePayload,
} from './schemas';
export {
  beaconsPayloadSchema,
  instagramPayloadSchema,
  layloPayloadSchema,
  linktreePayloadSchema,
  tiktokPayloadSchema,
  twitterPayloadSchema,
  youtubePayloadSchema,
} from './schemas';
export { processTikTokJob, tiktokJobConfig } from './tiktok';
export { processTwitterJob, twitterJobConfig } from './twitter';
export type {
  BaseJobPayload,
  JobExecutionResult,
  JobExecutorConfig,
  JobFailureReason,
  JobProcessor,
  ProfileData,
  SupportedRecursiveJobType,
} from './types';
export { MAX_DEPTH_BY_JOB_TYPE } from './types';
export { processYouTubeJob, youtubeJobConfig } from './youtube';
