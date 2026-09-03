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
import {
  BASELINE_WINDOW_DAYS,
  ensureJovieActiveCohort,
} from '@/lib/metrics/artist-revenue-cohorts';
import { buildReleaseGmvRowForRun } from '@/lib/release-to-revenue/gmv-attribution';
import type { ReleaseToRevenueRunStepOutputs } from '@/lib/release-to-revenue/types';
import { RELEASE_TO_REVENUE_WORKFLOW_KIND } from '@/lib/release-to-revenue/types';
import { logger } from '@/lib/utils/logger';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const RELEASE_OUTCOME_MEASUREMENT_WINDOW_DAYS = BASELINE_WINDOW_DAYS;

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

export type ReleaseOutcomeMeasurementState =
  | 'measuring'
  | 'measured_zero'
  | 'measured_positive';

/** Classify a stored snapshot without treating an unreconciled early row as mature. */
export function resolveReleaseOutcomeMeasurementState(input: {
  readonly windowStart: Date;
  readonly windowEnd: Date;
  readonly gmvDeltaCents: number;
  readonly clickDelta: number;
  readonly dspClickDelta: number;
  readonly newFansDelta: number;
}): ReleaseOutcomeMeasurementState {
  const maturityAt = new Date(
    input.windowStart.getTime() +
      RELEASE_OUTCOME_MEASUREMENT_WINDOW_DAYS * MS_PER_DAY
  );
  if (input.windowEnd < maturityAt) {
    return 'measuring';
  }

  const hasPositiveResult =
    input.gmvDeltaCents > 0 ||
    input.clickDelta > 0 ||
    input.dspClickDelta > 0 ||
    input.newFansDelta > 0;
  return hasPositiveResult ? 'measured_positive' : 'measured_zero';
}

function parseApprovalId(stepOutputs: Record<string, unknown>): string | null {
  return typeof stepOutputs.approvalId === 'string'
    ? stepOutputs.approvalId
    : null;
}

function resolveAttributionWindow(input: {
  readonly kind: string;
  readonly createdAt: Date;
  readonly stepOutputs: Record<string, unknown>;
  readonly completedAt: Date;
  readonly asOf: Date;
}): WorkflowRunAttributionWindow {
  const triggeredAtRaw = input.stepOutputs.triggeredAt;
  const triggeredAt =
    typeof triggeredAtRaw === 'string' ? new Date(triggeredAtRaw) : null;
  const start =
    triggeredAt && !Number.isNaN(triggeredAt.getTime())
      ? triggeredAt
      : input.createdAt;

  if (input.kind !== RELEASE_TO_REVENUE_WORKFLOW_KIND) {
    return { start, end: input.completedAt };
  }

  const maturityAt = new Date(
    start.getTime() + RELEASE_OUTCOME_MEASUREMENT_WINDOW_DAYS * MS_PER_DAY
  );
  const boundedAsOf = new Date(
    Math.max(
      start.getTime(),
      Math.min(input.asOf.getTime(), maturityAt.getTime())
    )
  );
  return { start, end: boundedAsOf };
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
  readonly workflowRunId: string;
  readonly kind: string;
  readonly userId: string;
  readonly createdAt: Date;
  readonly stepOutputs: Record<string, unknown>;
  readonly completedAt?: Date;
  readonly asOf?: Date;
}): Promise<WorkflowRunOutcomeDeltas> {
  const completedAt = input.completedAt ?? new Date();
  const window = resolveAttributionWindow({
    kind: input.kind,
    createdAt: input.createdAt,
    stepOutputs: input.stepOutputs,
    completedAt,
    asOf: input.asOf ?? new Date(),
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
      workflowRunId: input.workflowRunId,
      stepOutputs: releaseStepOutputs,
      window,
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

function resolveReleaseActivationAt(
  stepOutputs: ReleaseToRevenueRunStepOutputs,
  fallback: Date
): Date | null {
  const dispatched = stepOutputs.distributionDrafts?.items.filter(
    draft => draft.status === 'dispatched'
  );
  if (!dispatched || dispatched.length === 0) {
    return null;
  }

  const activationTimes = dispatched
    .map(draft => (draft.dispatchedAt ? new Date(draft.dispatchedAt) : null))
    .filter(
      (date): date is Date => date !== null && !Number.isNaN(date.getTime())
    )
    .sort((a, b) => a.getTime() - b.getTime());
  return activationTimes[0] ?? fallback;
}

export async function recordWorkflowRunOutcome(
  workflowRunId: string,
  options: { readonly asOf?: Date } = {}
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

  const isReleaseOutcome = run.kind === RELEASE_TO_REVENUE_WORKFLOW_KIND;
  const releaseActivationAt = isReleaseOutcome
    ? resolveReleaseActivationAt(
        run.stepOutputs as unknown as ReleaseToRevenueRunStepOutputs,
        run.updatedAt
      )
    : null;
  if (isReleaseOutcome && !releaseActivationAt) {
    return null;
  }

  const [existing] = await db
    .select({ id: workflowRunOutcomes.id })
    .from(workflowRunOutcomes)
    .where(eq(workflowRunOutcomes.workflowRunId, workflowRunId))
    .limit(1);

  if (existing && !isReleaseOutcome) {
    return getAutomationAttributedRevenueForRun(workflowRunId);
  }

  const deltas = await computeWorkflowRunOutcomeDeltas({
    workflowRunId,
    kind: run.kind,
    userId: run.userId,
    createdAt: run.createdAt,
    stepOutputs: run.stepOutputs as Record<string, unknown>,
    completedAt: run.updatedAt,
    asOf: options.asOf,
  });

  const values = {
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
  };

  const [recorded] = isReleaseOutcome
    ? await db
        .insert(workflowRunOutcomes)
        .values(values)
        .onConflictDoUpdate({
          target: workflowRunOutcomes.workflowRunId,
          set: {
            releaseId: values.releaseId,
            suggestedActionId: values.suggestedActionId,
            gmvDeltaCents: values.gmvDeltaCents,
            clickDelta: values.clickDelta,
            dspClickDelta: values.dspClickDelta,
            newFansDelta: values.newFansDelta,
            windowStart: values.windowStart,
            windowEnd: values.windowEnd,
          },
        })
        .returning()
    : await db.insert(workflowRunOutcomes).values(values).returning();

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
  if (!existing) {
    await ensureJovieActiveCohort({
      userId: run.userId,
      activatedAt: releaseActivationAt ?? run.updatedAt,
    });
  }

  return recorded ? toAutomationAttributedRevenue(recorded) : null;
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
