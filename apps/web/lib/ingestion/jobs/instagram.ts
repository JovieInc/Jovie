import type { DbOrTransaction } from '@/lib/db';
import {
  extractInstagram,
  fetchInstagramDocument,
} from '../strategies/instagram';
import { executeIngestionJob } from './executor';
import { type InstagramPayload, instagramPayloadSchema } from './schemas';
import type { JobExecutionResult, JobExecutorConfig } from './types';

/**
 * Job executor configuration for Instagram imports.
 */
export const instagramJobConfig: JobExecutorConfig<InstagramPayload> = {
  payloadSchema: instagramPayloadSchema,
  platformName: 'Instagram',
  fetchAndExtract: async payload => {
    const html = await fetchInstagramDocument(payload.sourceUrl);
    return extractInstagram(html);
  },
};

/**
 * Process an Instagram import job.
 */
export async function processInstagramJob(
  tx: DbOrTransaction,
  jobPayload: unknown
): Promise<JobExecutionResult> {
  return executeIngestionJob(tx, jobPayload, instagramJobConfig);
}
