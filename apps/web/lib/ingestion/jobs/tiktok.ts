import type { DbType } from '@/lib/db';
import { extractTikTok, fetchTikTokDocument } from '../strategies/tiktok';
import { executeIngestionJob } from './executor';
import { type TikTokPayload, tiktokPayloadSchema } from './schemas';
import type { JobExecutionResult, JobExecutorConfig } from './types';

/**
 * Job executor configuration for TikTok imports.
 */
export const tiktokJobConfig: JobExecutorConfig<TikTokPayload> = {
  payloadSchema: tiktokPayloadSchema,
  platformName: 'TikTok',
  fetchAndExtract: async payload => {
    const html = await fetchTikTokDocument(payload.sourceUrl);
    return extractTikTok(html);
  },
};

/**
 * Process a TikTok import job.
 */
export async function processTikTokJob(
  tx: DbType,
  jobPayload: unknown
): Promise<JobExecutionResult> {
  return executeIngestionJob(tx, jobPayload, tiktokJobConfig);
}
