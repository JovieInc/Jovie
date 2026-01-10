import type { DbType } from '@/lib/db';
import { extractLinkfire, fetchLinkfireDocument } from '../strategies/linkfire';
import { executeIngestionJob } from './executor';
import { type LinkfirePayload, linkfirePayloadSchema } from './schemas';
import type { JobExecutionResult, JobExecutorConfig } from './types';

/**
 * Job executor configuration for Linkfire imports.
 */
export const linkfireJobConfig: JobExecutorConfig<LinkfirePayload> = {
  payloadSchema: linkfirePayloadSchema,
  platformName: 'Linkfire',
  fetchAndExtract: async payload => {
    const html = await fetchLinkfireDocument(payload.sourceUrl);
    return extractLinkfire(html);
  },
};

/**
 * Process a Linkfire import job.
 */
export async function processLinkfireJob(
  tx: DbType,
  jobPayload: unknown
): Promise<JobExecutionResult> {
  return executeIngestionJob(tx, jobPayload, linkfireJobConfig);
}
