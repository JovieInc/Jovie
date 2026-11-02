/**
 * Ingestion Processor
 *
 * Slim orchestrator that delegates to modular job executors.
 * See ./jobs/ for platform-specific implementations.
 *
 * @deprecated Direct imports from this file are deprecated.
 * Import from specific modules instead:
 * - Job processors: import from './jobs/laylo', './jobs/beacons', etc.
 * - Scheduling: import from './scheduler'
 * - Merge logic: import from './merge'
 */

import type { DbOrTransaction } from '@/lib/db';
import type { ingestionJobs } from '@/lib/db/schema/ingestion';
import {
  processDspArtistDiscoveryJob,
  processMusicFetchEnrichmentJob,
} from '@/lib/dsp-enrichment/jobs';
import { musicFetchEnrichmentPayloadSchema } from '@/lib/dsp-enrichment/jobs/musicfetch-enrichment';
import { processReleaseEnrichmentJob } from '@/lib/dsp-enrichment/jobs/release-enrichment';
import { processSendClaimInviteJob } from '@/lib/email/jobs/send-claim-invite';
import { processWaitlistEmailJob } from '@/lib/waitlist/email-jobs';
import { processBeaconsJob } from './jobs/beacons';
import { processLayloJob } from './jobs/laylo';
import { processTikTokJob } from './jobs/tiktok';
import { processTwitterJob } from './jobs/twitter';
import { processYouTubeJob } from './jobs/youtube';
import { disabledSocialHtmlDocument } from './social-html-policy';
import { IngestionStatusManager } from './status-manager';

// Re-export followup functions
export { enqueueFollowupIngestionJobs } from './followup';
export { beaconsJobConfig, processBeaconsJob } from './jobs/beacons';
export {
  deriveLayloHandle,
  layloJobConfig,
  processLayloJob,
} from './jobs/laylo';
// Re-export job processors (direct imports to avoid barrel export issues)
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
 * Job types whose processors own their own short transaction phases (via
 * executeIngestionJob) and must NOT be wrapped in a spanning transaction by
 * callers: their external HTTP must never run inside an open transaction
 * (JOV-10139). All other job types (DSP enrichment, email) keep the caller's
 * withSystemIngestionSession transaction.
 */
export const SELF_MANAGED_JOB_TYPES = new Set([
  'import_beacons',
  'import_laylo',
  'import_tiktok',
  'import_twitter',
  'import_youtube',
]);

/**
 * Process a job based on its type.
 * Routes to the appropriate platform-specific processor.
 *
 * `conn` must be the pool-level handle (db), NOT a live transaction:
 * processors await external HTTP (platform scrapes, MusicFetch, Resend), and
 * holding BEGIN across those awaits leaves the Postgres session
 * idle-in-transaction until Neon terminates it (JOV-10139). Social import
 * processors manage their own short DB-only transaction phases; DSP/email
 * processors keep the handle for their (individually committed) writes.
 */
export async function processJob(
  conn: DbOrTransaction,
  job: typeof ingestionJobs.$inferSelect
) {
  switch (job.jobType) {
    case 'import_linktree':
    case 'import_instagram':
      return disabledSocialHtmlDocument();
    case 'import_laylo':
      return processLayloJob(job.payload);
    case 'import_youtube':
      return processYouTubeJob(job.payload);
    case 'import_beacons':
      return processBeaconsJob(job.payload);
    case 'import_tiktok':
      return processTikTokJob(job.payload);
    case 'import_twitter':
      return processTwitterJob(job.payload);
    case 'send_claim_invite':
      return processSendClaimInviteJob(conn, job.payload);
    case 'send_waitlist_email':
      return processWaitlistEmailJob(conn, job.payload, { jobId: job.id });
    case 'dsp_artist_discovery':
      return processDspArtistDiscoveryJob(conn, job.payload);
    case 'dsp_track_enrichment':
      return processReleaseEnrichmentJob(conn, job.payload);
    case 'musicfetch_enrichment': {
      const parsed = musicFetchEnrichmentPayloadSchema.safeParse(job.payload);
      const recoveryProfileId =
        parsed.success && parsed.data.recoveryClaimed
          ? parsed.data.creatorProfileId
          : null;
      if (recoveryProfileId) {
        await IngestionStatusManager.markProcessing(conn, recoveryProfileId);
      }
      const result = await processMusicFetchEnrichmentJob(conn, job.payload);
      if (recoveryProfileId) {
        if (result.status === 'complete') {
          await IngestionStatusManager.markIdle(conn, recoveryProfileId);
        } else {
          await IngestionStatusManager.markFailed(
            conn,
            recoveryProfileId,
            result.errors.join('; ') || 'MusicFetch enrichment failed'
          );
        }
      }
      return result;
    }
    default:
      throw new Error(`Unsupported ingestion job type: ${job.jobType}`);
  }
}
