/**
 * Automation → outcome revenue attribution (JOV-3618).
 *
 * Writes a durable outcome row when a workflow_run reaches `completed` so each
 * automation can be joined to GMV, smartlink clicks, DSP clicks, and captured fans.
 */

import 'server-only';

import { and, sql as drizzleSql, eq, gte, lte, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { audienceMembers, clickEvents } from '@/lib/db/schema/analytics';
import { workflowRunOutcomes, workflowRuns } from '@/lib/db/schema/connectors';
import { ensureJovieActiveCohort } from '@/lib/metrics/artist-revenue-cohorts';
import { buildReleaseGmvRowForRun } from '@/lib/release-to-revenue/gmv-attribution';
import type { ReleaseToRevenueRunStepOutputs } from '@/lib/release-to-revenue/types';
import { RELEASE_TO_REVENUE_WORKFLOW_KIND } from '@/lib/release-to-revenue/types';
import { logger } from '@/lib/utils/logger';

export interface WorkflowRunAttributionWindow {
  readonly start: Date;
  readonly end: Date;
}

export interface WorkflowRunOutcomeDeltas {
  readonly releaseId: string | null;
  readonly suggestedActionId: string | null;
  readonly creatorProfileId: string | null;
  readonly gmvDeltaCents: number;
  readonly clickDelta: number;
  readonly dspClickDelta: number;
  readonly newFansDelta: number;
  readonly window: WorkflowRunAttributionWindow;
}

export interface AutomationAttributedRevenue {
  readonly workflowRunId: string;
  readonly userId: string;
  readonly releaseId: string | null;
  readonly suggestedActionId: string | null;
  readonly gmvDeltaCents: number;
  readonly clickDelta: number;
  readonly dspClickDelta: number;
  readonly newFansDelta: number;
  readonly windowStart: Date;
  readonly windowEnd: Date;
}

function parseApprovalId(stepOutputs: Record<string, unknown>): string | null {
  return typeof stepOutputs.approvalId === 'string'
    ? stepOutputs.approvalId
    : null;
}

function resolveAttributionWindow(input: {
  readonly createdAt: Date;
  readonly stepOutputs: Record<string, unknown>;
  readonly completedAt: Date;
}): WorkflowRunAttributionWindow {
  const triggeredAtRaw = input.stepOutputs.triggeredAt;
  const triggeredAt =
    typeof triggeredAtRaw === 'string' ? new Date(triggeredAtRaw) : null;
  const start =
    triggeredAt && !Number.isNaN(triggeredAt.getTime())
      ? triggeredAt
      : input.createdAt;

  return { start, end: input.completedAt };
}

async function countReleaseClicks(input: {
  readonly creatorProfileId: string;
  readonly releaseId: string;
  readonly window: WorkflowRunAttributionWindow;
  readonly listenOnly: boolean;
}): Promise<number> {
  const conditions = [
    eq(clickEvents.creatorProfileId, input.creatorProfileId),
    eq(clickEvents.isBot, false),
    gte(clickEvents.createdAt, input.window.start),
    lte(clickEvents.createdAt, input.window.end),
    drizzleSql`${clickEvents.metadata} ->> 'contentId' = ${input.releaseId}`,
  ];

  if (input.listenOnly) {
    conditions.push(eq(clickEvents.linkType, 'listen'));
  }

  const [row] = await db
    .select({ count: drizzleSql<number>`count(*)::int` })
    .from(clickEvents)
    .where(and(...conditions));

  return Number(row?.count ?? 0);
}

async function countCapturedFansInWindow(input: {
  readonly creatorProfileId: string;
  readonly window: WorkflowRunAttributionWindow;
}): Promise<number> {
  const [row] = await db
    .select({ count: drizzleSql<number>`count(*)::int` })
    .from(audienceMembers)
    .where(
      and(
        eq(audienceMembers.creatorProfileId, input.creatorProfileId),
        gte(audienceMembers.firstSeenAt, input.window.start),
        lte(audienceMembers.firstSeenAt, input.window.end),
        or(
          drizzleSql`${audienceMembers.email} IS NOT NULL`,
          drizzleSql`${audienceMembers.phone} IS NOT NULL`
        )
      )
    );

  return Number(row?.count ?? 0);
}

export async function computeWorkflowRunOutcomeDeltas(input: {
  readonly kind: string;
  readonly userId: string;
  readonly createdAt: Date;
  readonly stepOutputs: Record<string, unknown>;
  readonly completedAt?: Date;
}): Promise<WorkflowRunOutcomeDeltas> {
  const completedAt = input.completedAt ?? new Date();
  const window = resolveAttributionWindow({
    createdAt: input.createdAt,
    stepOutputs: input.stepOutputs,
    completedAt,
  });
  const suggestedActionId = parseApprovalId(input.stepOutputs);

  if (input.kind !== RELEASE_TO_REVENUE_WORKFLOW_KIND) {
    return {
      releaseId: null,
      suggestedActionId,
      creatorProfileId: null,
      gmvDeltaCents: 0,
      clickDelta: 0,
      dspClickDelta: 0,
      newFansDelta: 0,
      window,
    };
  }

  const releaseStepOutputs =
    input.stepOutputs as unknown as ReleaseToRevenueRunStepOutputs;
  const releaseId = releaseStepOutputs.releaseId ?? null;
  const creatorProfileId =
    releaseStepOutputs.designPartner?.creatorProfileId ?? null;

  let gmvDeltaCents = 0;
  if (releaseStepOutputs.release?.title) {
    const gmvRow = await buildReleaseGmvRowForRun({
      workflowRunId: 'pending',
      stepOutputs: releaseStepOutputs,
    });
    gmvDeltaCents = gmvRow.gmvCents;
  }

  let clickDelta = 0;
  let dspClickDelta = 0;
  let newFansDelta = 0;

  if (creatorProfileId && releaseId) {
    [clickDelta, dspClickDelta, newFansDelta] = await Promise.all([
      countReleaseClicks({
        creatorProfileId,
        releaseId,
        window,
        listenOnly: false,
      }),
      countReleaseClicks({
        creatorProfileId,
        releaseId,
        window,
        listenOnly: true,
      }),
      countCapturedFansInWindow({ creatorProfileId, window }),
    ]);
  }

  return {
    releaseId,
    suggestedActionId,
    creatorProfileId,
    gmvDeltaCents,
    clickDelta,
    dspClickDelta,
    newFansDelta,
    window,
  };
}

export async function recordWorkflowRunOutcome(
  workflowRunId: string
): Promise<AutomationAttributedRevenue | null> {
  const [run] = await db
    .select()
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.id, workflowRunId),
        eq(workflowRuns.status, 'completed')
      )
    )
    .limit(1);

  if (!run) {
    return null;
  }

  const [existing] = await db
    .select({ id: workflowRunOutcomes.id })
    .from(workflowRunOutcomes)
    .where(eq(workflowRunOutcomes.workflowRunId, workflowRunId))
    .limit(1);

  if (existing) {
    return getAutomationAttributedRevenueForRun(workflowRunId);
  }

  const deltas = await computeWorkflowRunOutcomeDeltas({
    kind: run.kind,
    userId: run.userId,
    createdAt: run.createdAt,
    stepOutputs: run.stepOutputs as Record<string, unknown>,
    completedAt: run.updatedAt,
  });

  const [inserted] = await db
    .insert(workflowRunOutcomes)
    .values({
      workflowRunId,
      userId: run.userId,
      releaseId: deltas.releaseId,
      suggestedActionId: deltas.suggestedActionId,
      gmvDeltaCents: deltas.gmvDeltaCents,
      clickDelta: deltas.clickDelta,
      dspClickDelta: deltas.dspClickDelta,
      newFansDelta: deltas.newFansDelta,
      windowStart: deltas.window.start,
      windowEnd: deltas.window.end,
    })
    .returning();

  logger.info('[workflow-run-outcome] recorded automation attribution', {
    workflowRunId,
    releaseId: deltas.releaseId,
    gmvDeltaCents: deltas.gmvDeltaCents,
    clickDelta: deltas.clickDelta,
    dspClickDelta: deltas.dspClickDelta,
    newFansDelta: deltas.newFansDelta,
  });

  // First recorded automation outcome tags the artist jovie_active and
  // snapshots their pre-Jovie baseline (IRPAA cohort foundation, gh-12141).
  // Best-effort: never blocks the automation path.
  await ensureJovieActiveCohort({
    userId: run.userId,
    activatedAt: run.updatedAt,
  });

  return inserted ? toAutomationAttributedRevenue(inserted) : null;
}

function toAutomationAttributedRevenue(
  row: typeof workflowRunOutcomes.$inferSelect
): AutomationAttributedRevenue {
  return {
    workflowRunId: row.workflowRunId,
    userId: row.userId,
    releaseId: row.releaseId,
    suggestedActionId: row.suggestedActionId,
    gmvDeltaCents: row.gmvDeltaCents,
    clickDelta: row.clickDelta,
    dspClickDelta: row.dspClickDelta,
    newFansDelta: row.newFansDelta,
    windowStart: row.windowStart,
    windowEnd: row.windowEnd,
  };
}

export async function getAutomationAttributedRevenueForRun(
  workflowRunId: string
): Promise<AutomationAttributedRevenue | null> {
  const [row] = await db
    .select()
    .from(workflowRunOutcomes)
    .where(eq(workflowRunOutcomes.workflowRunId, workflowRunId))
    .limit(1);

  return row ? toAutomationAttributedRevenue(row) : null;
}

export interface ArtistRevenueLiftSummary {
  readonly userId: string;
  readonly windowStart: Date;
  readonly windowEnd: Date;
  readonly runCount: number;
  readonly gmvDeltaCents: number;
  readonly clickDelta: number;
  readonly dspClickDelta: number;
  readonly newFansDelta: number;
}

export async function sumArtistAutomationAttributedRevenue(input: {
  readonly userId: string;
  readonly windowStart: Date;
  readonly windowEnd: Date;
}): Promise<ArtistRevenueLiftSummary> {
  const [row] = await db
    .select({
      runCount: drizzleSql<number>`count(*)::int`,
      gmvDeltaCents: drizzleSql<number>`coalesce(sum(${workflowRunOutcomes.gmvDeltaCents}), 0)::int`,
      clickDelta: drizzleSql<number>`coalesce(sum(${workflowRunOutcomes.clickDelta}), 0)::int`,
      dspClickDelta: drizzleSql<number>`coalesce(sum(${workflowRunOutcomes.dspClickDelta}), 0)::int`,
      newFansDelta: drizzleSql<number>`coalesce(sum(${workflowRunOutcomes.newFansDelta}), 0)::int`,
    })
    .from(workflowRunOutcomes)
    .where(
      and(
        eq(workflowRunOutcomes.userId, input.userId),
        gte(workflowRunOutcomes.windowEnd, input.windowStart),
        lte(workflowRunOutcomes.windowStart, input.windowEnd)
      )
    );

  return {
    userId: input.userId,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    runCount: Number(row?.runCount ?? 0),
    gmvDeltaCents: Number(row?.gmvDeltaCents ?? 0),
    clickDelta: Number(row?.clickDelta ?? 0),
    dspClickDelta: Number(row?.dspClickDelta ?? 0),
    newFansDelta: Number(row?.newFansDelta ?? 0),
  };
}
