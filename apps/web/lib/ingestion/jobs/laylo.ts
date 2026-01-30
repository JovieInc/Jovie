import type { DbOrTransaction } from '@/lib/db';
import {
  extractLaylo,
  extractLayloHandle,
  fetchLayloProfile,
} from '../strategies/laylo';
import { executeIngestionJob } from './executor';
import { type LayloPayload, layloPayloadSchema } from './schemas';
import type { JobExecutionResult, JobExecutorConfig } from './types';

/**
 * Derive the Laylo handle from the source URL or profile username.
 */
export function deriveLayloHandle(
  sourceUrl: string,
  usernameNormalized: string | null
): string {
  const handleFromUrl = extractLayloHandle(sourceUrl);
  if (handleFromUrl) return handleFromUrl;
  if (usernameNormalized) return usernameNormalized;

  throw new Error('Unable to determine Laylo handle from sourceUrl or profile');
}

/**
 * Job executor configuration for Laylo imports.
 */
export const layloJobConfig: JobExecutorConfig<LayloPayload> = {
  payloadSchema: layloPayloadSchema,
  platformName: 'Laylo',
  fetchAndExtract: async (payload, profile) => {
    const layloHandle = deriveLayloHandle(
      payload.sourceUrl,
      profile.usernameNormalized
    );
    const { profile: layloProfile, user } =
      await fetchLayloProfile(layloHandle);
    return extractLaylo(layloProfile, user);
  },
};

/**
 * Process a Laylo import job.
 */
export async function processLayloJob(
  tx: DbOrTransaction,
  jobPayload: unknown
): Promise<JobExecutionResult> {
  return executeIngestionJob(tx, jobPayload, layloJobConfig);
}
