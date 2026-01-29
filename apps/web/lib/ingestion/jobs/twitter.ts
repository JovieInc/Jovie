import type { DbType } from '@/lib/db';
import { extractTwitter, fetchTwitterDocument } from '../strategies/twitter';
import { executeIngestionJob } from './executor';
import { type TwitterPayload, twitterPayloadSchema } from './schemas';
import type { JobExecutionResult, JobExecutorConfig } from './types';

/**
 * Job executor configuration for Twitter imports.
 */
export const twitterJobConfig: JobExecutorConfig<TwitterPayload> = {
  payloadSchema: twitterPayloadSchema,
  platformName: 'Twitter',
  fetchAndExtract: async payload => {
    const html = await fetchTwitterDocument(payload.sourceUrl);
    return extractTwitter(html);
  },
};

/**
 * Process a Twitter import job.
 */
export async function processTwitterJob(
  tx: DbType,
  jobPayload: unknown
): Promise<JobExecutionResult> {
  return executeIngestionJob(tx, jobPayload, twitterJobConfig);
}
