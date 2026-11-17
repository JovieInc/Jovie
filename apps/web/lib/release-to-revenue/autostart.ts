import 'server-only';

import { and, sql as drizzleSql, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { workflowRuns } from '@/lib/db/schema/connectors';
import { discogReleases } from '@/lib/db/schema/content';
import { getAppFlagValue } from '@/lib/flags/server';
import { resolveDesignPartnerConfig } from './design-partner-config';
import { triggerNewRelease } from './trigger-new-release';
import { RELEASE_TO_REVENUE_WORKFLOW_KIND } from './types';

/** One cycle per release per window, so a finished run is not restarted daily. */
export const AUTOPILOT_CYCLE_DAYS = 28;

export type AutopilotAutostartResult =
  | {
      readonly status: 'started' | 'existing';
      readonly runId: string;
      readonly releaseId: string;
    }
  | {
      readonly status:
        | 'flag-off'
        | 'not-configured'
        | 'no-release'
        | 'recent-cycle'
        | 'trigger-failed';
      readonly detail?: string;
    };

async function findFocusReleaseId(creatorProfileId: string) {
  const [row] = await db
    .select({ id: discogReleases.id })
    .from(discogReleases)
    .where(
      and(
        eq(discogReleases.creatorProfileId, creatorProfileId),
        eq(discogReleases.status, 'released'),
        isNull(discogReleases.deletedAt)
      )
    )
    .orderBy(drizzleSql`${discogReleases.releaseDate} DESC NULLS LAST`)
    .limit(1);
  return row?.id ?? null;
}

async function hasRecentCycle(userId: string, releaseId: string, now: Date) {
  const since = new Date(now.getTime() - AUTOPILOT_CYCLE_DAYS * 86_400_000);
  const [row] = await db
    .select({ id: workflowRuns.id })
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.userId, userId),
        eq(workflowRuns.kind, RELEASE_TO_REVENUE_WORKFLOW_KIND),
        gt(workflowRuns.createdAt, since),
        drizzleSql`${workflowRuns.stepOutputs} ->> 'releaseId' = ${releaseId}`
      )
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Starts the design partner's Release-to-Revenue cycle on their newest
 * release when none ran in the last cycle window. Drafts only: every
 * distribution draft still waits for the artist's approval.
 */
export async function autostartDesignPartnerAutopilot(
  now = new Date()
): Promise<AutopilotAutostartResult> {
  const designPartner = await resolveDesignPartnerConfig();
  if (!designPartner) return { status: 'not-configured' };
  const enabled = await getAppFlagValue('RELEASE_TO_REVENUE_AUTOPILOT', {
    userId: designPartner.userId,
  });
  if (!enabled) return { status: 'flag-off' };
  const releaseId = await findFocusReleaseId(designPartner.creatorProfileId);
  if (!releaseId) return { status: 'no-release' };
  if (await hasRecentCycle(designPartner.userId, releaseId, now))
    return { status: 'recent-cycle' };
  const result = await triggerNewRelease({
    userId: designPartner.userId,
    enabled,
    trigger: { triggerSource: 'catalog', releaseId },
  });
  if (!result.ok) return { status: 'trigger-failed', detail: result.code };
  return {
    status: result.run.status === 'created' ? 'started' : 'existing',
    runId: result.run.runId,
    releaseId,
  };
}

/**
 * Daily-maintenance sub-job: a trigger refusal throws so cron monitoring
 * records it. Skips (flag off, no release, recent cycle) are not failures.
 */
export async function runDesignPartnerAutopilotSubJob(
  now = new Date()
): Promise<AutopilotAutostartResult> {
  const result = await autostartDesignPartnerAutopilot(now);
  if (result.status === 'trigger-failed') {
    throw new Error(
      `Design-partner autopilot trigger refused: ${result.detail ?? 'unknown'}`
    );
  }
  return result;
}
