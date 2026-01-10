import type { DbType } from '@/lib/db';
import {
  extractFeatureFm,
  fetchFeatureFmDocument,
} from '../strategies/featurefm';
import { executeIngestionJob } from './executor';
import { type FeaturefmPayload, featurefmPayloadSchema } from './schemas';
import type { JobExecutionResult, JobExecutorConfig } from './types';

/**
 * Job executor configuration for Feature.fm imports.
 */
export const featurefmJobConfig: JobExecutorConfig<FeaturefmPayload> = {
  payloadSchema: featurefmPayloadSchema,
  platformName: 'Feature.fm',
  fetchAndExtract: async payload => {
    const html = await fetchFeatureFmDocument(payload.sourceUrl);
    return extractFeatureFm(html);
  },
};

/**
 * Process a Feature.fm import job.
 */
export async function processFeaturefmJob(
  tx: DbType,
  jobPayload: unknown
): Promise<JobExecutionResult> {
  return executeIngestionJob(tx, jobPayload, featurefmJobConfig);
}
