/**
 * Ingestion Processor
 *
 * Slim orchestrator that delegates to modular job executors.
 * See ./jobs/ for platform-specific implementations.
 *
 * @deprecated Direct imports from this file are deprecated.
 * Import from specific modules instead:
 * - Job processors: import from './jobs/linktree', './jobs/beacons', etc.
 * - Scheduling: import from './scheduler'
 * - Merge logic: import from './merge'
 */

import * as Sentry from '@sentry/nextjs';
import type { DbType } from '@/lib/db';
import type { ingestionJobs } from '@/lib/db/schema';
import { processDspArtistDiscoveryJob } from '@/lib/dsp-enrichment/jobs';
import { processSendClaimInviteJob } from '@/lib/email/jobs/send-claim-invite';
import { processBeaconsJob } from './jobs/beacons';
import { processInstagramJob } from './jobs/instagram';
import { processLayloJob } from './jobs/laylo';
import { processLinktreeJob } from './jobs/linktree';
import { processTikTokJob } from './jobs/tiktok';
import { processTwitterJob } from './jobs/twitter';
import { processYouTubeJob } from './jobs/youtube';

// Re-export followup functions
export { enqueueFollowupIngestionJobs } from './followup';
export { beaconsJobConfig, processBeaconsJob } from './jobs/beacons';
export { instagramJobConfig, processInstagramJob } from './jobs/instagram';
export {
  deriveLayloHandle,
  layloJobConfig,
  processLayloJob,
} from './jobs/laylo';
// Re-export job processors (direct imports to avoid barrel export issues)
export { linktreeJobConfig, processLinktreeJob } from './jobs/linktree';
export { processTikTokJob, tiktokJobConfig } from './jobs/tiktok';
export { processTwitterJob, twitterJobConfig } from './jobs/twitter';
// Re-export types
export type {
  BaseJobPayload,
  JobExecutionResult,
  JobExecutorConfig,
  JobFailureReason,
  ProfileData,
  SupportedRecursiveJobType,
} from './jobs/types';
export { processYouTubeJob, youtubeJobConfig } from './jobs/youtube';
// Re-export merge functions
export {
  createInMemorySocialLinkRow,
  mergeEvidence,
  normalizeAndMergeExtraction,
} from './merge';
// Re-export scheduling functions
export {
  calculateBackoff,
  claimPendingJobs,
  determineJobFailure,
  failJob,
  getCreatorProfileIdFromJob,
  handleIngestionJobFailure,
  resetJobForRetry,
  succeedJob,
} from './scheduler';

/**
 * Process a job based on its type.
 * Routes to the appropriate platform-specific processor.
 */
export async function processJob(
  tx: DbType,
  job: typeof ingestionJobs.$inferSelect
) {
  switch (job.jobType) {
    case 'import_linktree':
      return processLinktreeJob(tx, job.payload);
    case 'import_laylo':
      return processLayloJob(tx, job.payload);
    case 'import_youtube':
      return processYouTubeJob(tx, job.payload);
    case 'import_beacons':
      return processBeaconsJob(tx, job.payload);
    case 'import_instagram':
      return processInstagramJob(tx, job.payload);
    case 'import_tiktok':
      return processTikTokJob(tx, job.payload);
    case 'import_twitter':
      return processTwitterJob(tx, job.payload);
    case 'send_claim_invite':
      return processSendClaimInviteJob(tx, job.payload);
    case 'dsp_artist_discovery':
      return processDspArtistDiscoveryJob(tx, job.payload);
    case 'dsp_track_enrichment':
      // Track enrichment logic will be implemented in a future PR
      // For now, return success to avoid blocking the queue
      // See JOV-480: DSP Track Enrichment Implementation
      Sentry.addBreadcrumb({
        category: 'ingestion',
        message:
          'DSP Track Enrichment job enqueued, processor not yet implemented',
        level: 'info',
        data: { payload: job.payload },
      });
      return {
        success: true,
        message: 'Track enrichment pending implementation',
      };
    default:
      throw new Error(`Unsupported ingestion job type: ${job.jobType}`);
  }
}
