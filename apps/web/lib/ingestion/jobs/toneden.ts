import type { DbType } from '@/lib/db';
import { extractToneDen, fetchToneDenDocument } from '../strategies/toneden';
import { executeIngestionJob } from './executor';
import { type TonedenPayload, tonedenPayloadSchema } from './schemas';
import type { JobExecutionResult, JobExecutorConfig } from './types';

/**
 * Job executor configuration for ToneDen imports.
 */
export const tonedenJobConfig: JobExecutorConfig<TonedenPayload> = {
  payloadSchema: tonedenPayloadSchema,
  platformName: 'ToneDen',
  fetchAndExtract: async payload => {
    const html = await fetchToneDenDocument(payload.sourceUrl);
    return extractToneDen(html);
  },
};

/**
 * Process a ToneDen import job.
 */
export async function processTonedenJob(
  tx: DbType,
  jobPayload: unknown
): Promise<JobExecutionResult> {
  return executeIngestionJob(tx, jobPayload, tonedenJobConfig);
}
