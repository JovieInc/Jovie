import 'server-only';

import { and, sql as drizzleSql, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { workflowRuns } from '@/lib/db/schema/connectors';
import type {
  CreateReleaseToRevenueRunResult,
  ReleaseToRevenueRunStepOutputs,
  ResolvedDesignPartnerConfig,
} from './types';
import { RELEASE_TO_REVENUE_WORKFLOW_KIND } from './types';

const ACTIVE_RUN_STATUSES = [
  'queued',
  'running',
  'waiting_for_approval',
] as const;

async function findExistingRunForRelease(
  userId: string,
  releaseId: string
): Promise<string | null> {
  const [existing] = await db
    .select({ id: workflowRuns.id })
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.userId, userId),
        eq(workflowRuns.kind, RELEASE_TO_REVENUE_WORKFLOW_KIND),
        inArray(workflowRuns.status, [...ACTIVE_RUN_STATUSES]),
        drizzleSql`${workflowRuns.stepOutputs} ->> 'releaseId' = ${releaseId}`
      )
    )
    .limit(1);

  return existing?.id ?? null;
}

export async function createReleaseToRevenueRun(input: {
  readonly userId: string;
  readonly designPartner: ResolvedDesignPartnerConfig;
  readonly stepOutputs: ReleaseToRevenueRunStepOutputs;
}): Promise<CreateReleaseToRevenueRunResult> {
  if (input.stepOutputs.releaseId) {
    const existingRunId = await findExistingRunForRelease(
      input.userId,
      input.stepOutputs.releaseId
    );
    if (existingRunId) {
      return { runId: existingRunId, status: 'existing' };
    }
  }

  const [created] = await db
    .insert(workflowRuns)
    .values({
      kind: RELEASE_TO_REVENUE_WORKFLOW_KIND,
      userId: input.userId,
      status: 'queued',
      currentStep: 'initialize',
      stepOutputs: input.stepOutputs,
      runAt: new Date(),
    })
    .returning({ id: workflowRuns.id });

  if (!created) {
    throw new Error('Failed to create release-to-revenue workflow run');
  }

  return { runId: created.id, status: 'created' };
}
