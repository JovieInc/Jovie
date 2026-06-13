/**
 * Recovery for accepted suggested_actions rows missing a workflow_runs enqueue.
 *
 * The approve endpoint performs two sequential writes (CAS update, then insert).
 * If the insert fails after CAS succeeds, the action is stuck accepted with no
 * run until recovered here or via the approve retry path.
 */

import { and, sql as drizzleSql, eq, notExists } from 'drizzle-orm';
import { db } from '@/lib/db';
import { suggestedActions, workflowRuns } from '@/lib/db/schema/connectors';
import { logger } from '@/lib/utils/logger';

type BookingPayload = {
  title?: string;
  startsAt?: string;
  endsAt?: string;
  timeZone?: string;
};

export type OrphanedApprovalRecoveryResult =
  | 'enqueued'
  | 'already-queued'
  | 'not-accepted'
  | 'not-found';

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
  eventPayload: BookingPayload | null;
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
  const [action] = await db
    .select({
      id: suggestedActions.id,
      status: suggestedActions.status,
      userId: suggestedActions.userId,
      payload: suggestedActions.payload,
    })
    .from(suggestedActions)
    .where(eq(suggestedActions.id, input.approvalId))
    .limit(1);

  if (!action) {
    return 'not-found';
  }

  if (action.userId !== input.userId || action.status !== 'accepted') {
    return 'not-accepted';
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
    eventPayload: action.payload as BookingPayload | null,
  });

  if (enqueueResult === 'already-queued') {
    return 'already-queued';
  }

  logger.info('[reconcile] recovered orphaned accepted suggested_action', {
    approvalId: input.approvalId,
    userId: input.userId,
  });

  return 'enqueued';
}

export async function reconcileOrphanedAcceptedActions(
  limit = 20
): Promise<{ scanned: number; enqueued: number }> {
  const orphaned = await db
    .select({
      id: suggestedActions.id,
      userId: suggestedActions.userId,
      payload: suggestedActions.payload,
    })
    .from(suggestedActions)
    .where(
      and(
        eq(suggestedActions.status, 'accepted'),
        workflowRunMissingForSuggestedAction()
      )
    )
    .limit(limit);

  let enqueued = 0;
  for (const action of orphaned) {
    const enqueueResult = await enqueueApprovedActionWorkflow({
      userId: action.userId,
      approvalId: action.id,
      eventPayload: action.payload as BookingPayload | null,
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
}
