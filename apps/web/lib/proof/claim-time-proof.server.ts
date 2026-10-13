import 'server-only';

import { and, desc, sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { workflowRuns } from '@/lib/db/schema/connectors';
import { captureWarning } from '@/lib/error-tracking';
import { ONBOARDING_PRESENCE_BUILD_WORKFLOW_KIND } from '@/lib/onboarding/presence-build/constants';
import { isPresenceBuildStepOutputs } from '@/lib/onboarding/presence-build/types';
import {
  type ClaimTimeFinding,
  claimTimeProofFindings,
} from './claim-time-proof';

/**
 * Computed proof for one profile at the paywall (JOV-7794): the findings its
 * latest onboarding presence build resolved from real data. Any read failure
 * or missing run returns no findings, so the proof card hides.
 */
export async function loadClaimTimeProof(
  profileId: string
): Promise<readonly ClaimTimeFinding[]> {
  try {
    const [run] = await db
      .select({ stepOutputs: workflowRuns.stepOutputs })
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.kind, ONBOARDING_PRESENCE_BUILD_WORKFLOW_KIND),
          drizzleSql`${workflowRuns.stepOutputs} ->> 'profileId' = ${profileId}`
        )
      )
      .orderBy(desc(workflowRuns.createdAt))
      .limit(1);
    if (!run || !isPresenceBuildStepOutputs(run.stepOutputs)) return [];
    return claimTimeProofFindings(run.stepOutputs.steps);
  } catch (error) {
    await captureWarning(
      '[proof] claim-time proof read failed; hiding the proof card',
      error,
      { operation: 'loadClaimTimeProof' }
    );
    return [];
  }
}
