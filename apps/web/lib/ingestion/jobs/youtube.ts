import type { DbOrTransaction } from '@/lib/db';
import {
  extractYouTube,
  fetchYouTubeAboutDocument,
} from '../strategies/youtube';
import { executeIngestionJob } from './executor';
import { type YouTubePayload, youtubePayloadSchema } from './schemas';
import type { JobExecutionResult, JobExecutorConfig } from './types';

/**
 * Job executor configuration for YouTube imports.
 */
export const youtubeJobConfig: JobExecutorConfig<YouTubePayload> = {
  payloadSchema: youtubePayloadSchema,
  platformName: 'YouTube',
  fetchAndExtract: async payload => {
    const html = await fetchYouTubeAboutDocument(payload.sourceUrl);
    return extractYouTube(html);
  },
};

/**
 * Process a YouTube import job.
 */
export async function processYouTubeJob(
  tx: DbOrTransaction,
  jobPayload: unknown
): Promise<JobExecutionResult> {
  return executeIngestionJob(tx, jobPayload, youtubeJobConfig);
}
