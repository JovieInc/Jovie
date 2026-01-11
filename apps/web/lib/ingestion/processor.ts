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

import type { DbType } from '@/lib/db';
import type { ingestionJobs } from '@/lib/db/schema';

// Re-export followup functions
export { enqueueFollowupIngestionJobs } from './followup';
export { beaconsJobConfig, processBeaconsJob } from './jobs/beacons';
export {
  deriveLayloHandle,
  layloJobConfig,
  processLayloJob,
} from './jobs/laylo';
// Re-export job processors (direct imports to avoid barrel export issues)
export { linktreeJobConfig, processLinktreeJob } from './jobs/linktree';
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
  // Import dynamically to avoid circular dependencies
  const { processLinktreeJob } = await import('./jobs/linktree');
  const { processLayloJob } = await import('./jobs/laylo');
  const { processYouTubeJob } = await import('./jobs/youtube');
  const { processBeaconsJob } = await import('./jobs/beacons');
  const { processSendClaimInviteJob } = await import(
    '@/lib/email/jobs/send-claim-invite'
  );

  switch (job.jobType) {
    case 'import_linktree':
      return processLinktreeJob(tx, job.payload);
    case 'import_laylo':
      return processLayloJob(tx, job.payload);
    case 'import_youtube':
      return processYouTubeJob(tx, job.payload);
    case 'import_beacons':
      return processBeaconsJob(tx, job.payload);
    case 'send_claim_invite':
      return processSendClaimInviteJob(tx, job.payload);
    default:
      throw new Error(`Unsupported ingestion job type: ${job.jobType}`);
  }
}
