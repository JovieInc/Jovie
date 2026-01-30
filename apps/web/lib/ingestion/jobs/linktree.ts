import type { DbOrTransaction } from '@/lib/db';
import { extractLinktree, fetchLinktreeDocument } from '../strategies/linktree';
import { executeIngestionJob } from './executor';
import { type LinktreePayload, linktreePayloadSchema } from './schemas';
import type { JobExecutionResult, JobExecutorConfig } from './types';

/**
 * Job executor configuration for Linktree imports.
 */
export const linktreeJobConfig: JobExecutorConfig<LinktreePayload> = {
  payloadSchema: linktreePayloadSchema,
  platformName: 'Linktree',
  fetchAndExtract: async payload => {
    const html = await fetchLinktreeDocument(payload.sourceUrl);
    return extractLinktree(html);
  },
};

/**
 * Process a Linktree import job.
 */
export async function processLinktreeJob(
  tx: DbOrTransaction,
  jobPayload: unknown
): Promise<JobExecutionResult> {
  return executeIngestionJob(tx, jobPayload, linktreeJobConfig);
}
