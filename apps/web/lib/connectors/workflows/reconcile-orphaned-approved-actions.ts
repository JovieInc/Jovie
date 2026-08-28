/**
 * Recovery for accepted suggested_actions rows missing a workflow_runs enqueue.
 *
 * The approve endpoint performs two sequential writes (CAS update, then insert).
 * If the insert fails after CAS succeeds, the action is stuck accepted with no
 * run until recovered here or via the approve retry path.
 */

import { and, sql as drizzleSql, eq, notExists } from 'drizzle-orm';
import { isMissingConnectorWorkflowTablesError } from '@/lib/connectors/schema-errors';
import {
  type ApprovedCalendarPayload,
  resolveSuggestedActionDispatch,
} from '@/lib/connectors/suggested-action-dispatch';
import { CALENDAR_CREATE_EVENT_KIND } from '@/lib/connectors/suggested-action-kinds';
import { db } from '@/lib/db';
import { suggestedActions, workflowRuns } from '@/lib/db/schema/connectors';
import { logger } from '@/lib/utils/logger';

export type OrphanedApprovalRecoveryResult =
  | 'enqueued'
  | 'already-queued'
  | 'decision-only'
  | 'invalid-decision-only'
  | 'invalid-action'
  | 'non-executable'
  | 'not-accepted'
  | 'not-found';

const EMPTY_RECONCILE_RESULT = { scanned: 0, enqueued: 0 } as const;

function workflowRunMissingForSuggestedAction() {
  return notExists(
    db
      .select({ id: workflowRuns.id })
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.kind, 'execute_approved_action'),
          drizzleSql`${workflowRuns.stepOutputs} ->> 'approvalId' = ${suggestedActions.id}::text`
        )
      )
  );
}

export async function enqueueApprovedActionWorkflow(input: {
  userId: string;
  approvalId: string;
  eventPayload: ApprovedCalendarPayload;
}): Promise<'enqueued' | 'already-queued'> {
  const inserted = await db
    .insert(workflowRuns)
    .values({
      kind: 'execute_approved_action',
      userId: input.userId,
      status: 'queued',
      currentStep: 'create_calendar_event',
      stepOutputs: {
        approvalId: input.approvalId,
        eventPayload: input.eventPayload,
      },
      runAt: new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: workflowRuns.id });

  return inserted.length > 0 ? 'enqueued' : 'already-queued';
}

export async function recoverOrphanedApprovedAction(input: {
  approvalId: string;
  userId: string;
}): Promise<OrphanedApprovalRecoveryResult> {
  try {
    const [action] = await db
      .select({
        id: suggestedActions.id,
        status: suggestedActions.status,
        userId: suggestedActions.userId,
        payload: suggestedActions.payload,
        kind: suggestedActions.kind,
        signalType: suggestedActions.signalType,
      })
      .from(suggestedActions)
      .where(eq(suggestedActions.id, input.approvalId))
      .limit(1);

    if (!action) {
      return 'not-found';
    }

    if (action.userId !== input.userId || action.status !== 'approved') {
      return 'not-accepted';
    }

    const dispatch = resolveSuggestedActionDispatch(action);
    if (dispatch.mode === 'invalid') {
      return dispatch.error === 'brand-deal-evidence-unverified'
        ? 'invalid-decision-only'
        : 'invalid-action';
    }
    if (dispatch.mode === 'decision-only') {
      return 'decision-only';
    }
    if (
      dispatch.mode === 'workflow-capture' ||
      dispatch.mode === 'next-step-only'
    ) {
      return 'non-executable';
    }

    const [existingRun] = await db
      .select({ id: workflowRuns.id })
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.kind, 'execute_approved_action'),
          drizzleSql`${workflowRuns.stepOutputs} ->> 'approvalId' = ${input.approvalId}`
        )
      )
      .limit(1);

    if (existingRun) {
      return 'already-queued';
    }

    const enqueueResult = await enqueueApprovedActionWorkflow({
      userId: action.userId,
      approvalId: action.id,
      eventPayload: dispatch.eventPayload,
    });

    if (enqueueResult === 'already-queued') {
      return 'already-queued';
    }

    logger.info('[reconcile] recovered orphaned accepted suggested_action', {
      approvalId: input.approvalId,
      userId: input.userId,
    });

    return 'enqueued';
  } catch (error) {
    if (isMissingConnectorWorkflowTablesError(error)) {
      logger.info(
        '[reconcile] connector workflow tables not migrated; skipping recovery',
        { approvalId: input.approvalId }
      );
      return 'not-found';
    }
    throw error;
  }
}

export async function reconcileOrphanedAcceptedActions(
  limit = 20
): Promise<{ scanned: number; enqueued: number }> {
  try {
    const orphaned = await db
      .select({
        id: suggestedActions.id,
        userId: suggestedActions.userId,
        payload: suggestedActions.payload,
        kind: suggestedActions.kind,
        signalType: suggestedActions.signalType,
      })
      .from(suggestedActions)
      .where(
        and(
          eq(suggestedActions.status, 'approved'),
          eq(suggestedActions.kind, CALENDAR_CREATE_EVENT_KIND),
          workflowRunMissingForSuggestedAction()
        )
      )
      .limit(limit);

    let enqueued = 0;
    for (const action of orphaned) {
      const dispatch = resolveSuggestedActionDispatch(action);
      // Defense in depth if a caller or mock bypasses the SQL predicate.
      if (dispatch.mode !== 'calendar-workflow') {
        continue;
      }
      const enqueueResult = await enqueueApprovedActionWorkflow({
        userId: action.userId,
        approvalId: action.id,
        eventPayload: dispatch.eventPayload,
      });
      if (enqueueResult === 'enqueued') {
        enqueued++;
      }
    }

    if (enqueued > 0) {
      logger.info(
        '[reconcile] cron enqueued orphaned accepted suggested_actions',
        {
          scanned: orphaned.length,
          enqueued,
        }
      );
    }

    return { scanned: orphaned.length, enqueued };
  } catch (error) {
    if (isMissingConnectorWorkflowTablesError(error)) {
      logger.info(
        '[reconcile] connector workflow tables not migrated; skipping cron recovery'
      );
      return EMPTY_RECONCILE_RESULT;
    }
    throw error;
  }
}
