import type { DbOrTransaction } from '@/lib/db';
import { extractBeacons, fetchBeaconsDocument } from '../strategies/beacons';
import { executeIngestionJob } from './executor';
import { type BeaconsPayload, beaconsPayloadSchema } from './schemas';
import type { JobExecutionResult, JobExecutorConfig } from './types';

/**
 * Job executor configuration for Beacons imports.
 */
export const beaconsJobConfig: JobExecutorConfig<BeaconsPayload> = {
  payloadSchema: beaconsPayloadSchema,
  platformName: 'Beacons',
  fetchAndExtract: async payload => {
    const html = await fetchBeaconsDocument(payload.sourceUrl);
    return extractBeacons(html);
  },
};

/**
 * Process a Beacons import job.
 */
export async function processBeaconsJob(
  tx: DbOrTransaction,
  jobPayload: unknown
): Promise<JobExecutionResult> {
  return executeIngestionJob(tx, jobPayload, beaconsJobConfig);
}
