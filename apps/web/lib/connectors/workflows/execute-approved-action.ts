/**
 * Workflow executor: execute_approved_action
 *
 * Fetches an approved suggested_action from a workflow_runs row and
 * creates the corresponding Google Calendar event.
 *
 * Called by the /api/cron/process-workflow-runs route.
 *
 * Invariants:
 * - The workflow_runs row must have kind='execute_approved_action'
 * - stepOutputs.approvalId must reference an accepted suggested_actions row
 * - createCalendarEvent handles the idempotent Google API call
 * - On success: CAS workflow_runs running → completed
 * - On failure: CAS workflow_runs running → failed, error captured
 */

import { and, eq } from 'drizzle-orm';
import type { CalendarApiClient } from '@/lib/connectors/google-calendar/create-event';
import { createCalendarEvent } from '@/lib/connectors/google-calendar/create-event';
import { db } from '@/lib/db';
import { suggestedActions, workflowRuns } from '@/lib/db/schema/connectors';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';
import { recordWorkflowStepResult } from '@/lib/analytics/agent-task-metrics';
import { recordWorkflowRunOutcome } from './outcome-attribution';

/** Agent identifier written to workflow_step_results rows for this executor. */
const EXECUTOR_AGENT = 'execute_approved_action';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExecuteApprovedActionInput {
  workflowRunId: string;
  calendarClient?: CalendarApiClient;
}

// ---------------------------------------------------------------------------
// Helpers: CAS state transitions on workflow_runs
// ---------------------------------------------------------------------------

export async function markWorkflowCompleted(
  workflowRunId: string,
  result: Record<string, unknown>
): Promise<void> {
  await db
    .update(workflowRuns)
    .set({
      status: 'completed',
      stepOutputs: result,
      // Opportunity lifecycle end (#12140): the automation's output is
      // published/sent when the run reaches completed.
      shippedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workflowRuns.id, workflowRunId),
        eq(workflowRuns.status, 'running')
      )
    );

  try {
    await recordWorkflowRunOutcome(workflowRunId);
  } catch (err) {
    logger.error(
      '[execute-approved-action] failed to record workflow run outcome',
      { workflowRunId, err }
    );
  }
}

export async function markWorkflowFailed(
  workflowRunId: string,
  errorMessage: string
): Promise<void> {
  try {
    await db
      .update(workflowRuns)
      .set({ status: 'failed', error: errorMessage, updatedAt: new Date() })
      .where(
        and(
          eq(workflowRuns.id, workflowRunId),
          eq(workflowRuns.status, 'running')
        )
      );
  } catch (err) {
    // markWorkflowFailed must not throw — it's called in error paths.
    logger.error('[execute-approved-action] markWorkflowFailed itself failed', {
      workflowRunId,
      errorMessage,
      err,
    });
  }
}

// ---------------------------------------------------------------------------
// Main executor
// ---------------------------------------------------------------------------

/**
 * Execute a workflow_runs row of kind='execute_approved_action'.
 *
 * 1. Load the workflow_runs row (must be status='running', kind=execute_approved_action)
 * 2. Extract approvalId from stepOutputs
 * 3. Load the suggested_actions row for userId/approval gating
 * 4. Call createCalendarEvent (idempotent, gates on accepted status)
 * 5. CAS: running → completed
 */
export async function executeApprovedAction(
  input: ExecuteApprovedActionInput
): Promise<void> {
  const { workflowRunId, calendarClient } = input;
  const executionStartedAtMs = Date.now();

  // 1. Load the workflow_runs row
  const [run] = await db
    .select()
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.id, workflowRunId),
        eq(workflowRuns.status, 'running'),
        eq(workflowRuns.kind, 'execute_approved_action')
      )
    )
    .limit(1);

  if (!run) {
    // Row not found or not in running state — another cron tick may have claimed it
    logger.warn(
      '[execute-approved-action] workflow_run not found or not running',
      { workflowRunId }
    );
    return;
  }

  // 2. Extract approvalId from stepOutputs
  const stepOutputs = run.stepOutputs as Record<string, unknown>;
  const approvalId =
    typeof stepOutputs.approvalId === 'string' ? stepOutputs.approvalId : null;

  if (!approvalId) {
    const msg = 'stepOutputs.approvalId is missing or not a string';
    logger.error('[execute-approved-action] ' + msg, { workflowRunId });
    await markWorkflowFailed(workflowRunId, msg);
    return;
  }

  // 3. Load suggested_actions to get the userId for the createCalendarEvent gate
  const [action] = await db
    .select({ userId: suggestedActions.userId })
    .from(suggestedActions)
    .where(eq(suggestedActions.id, approvalId))
    .limit(1);

  if (!action) {
    const msg = `suggested_action not found: ${approvalId}`;
    logger.error('[execute-approved-action] ' + msg, { workflowRunId });
    await markWorkflowFailed(workflowRunId, msg);
    return;
  }

  // 4. Extract the event payload from stepOutputs (set by extraction step)
  const rawPayload = stepOutputs.eventPayload as
    | {
        title?: string;
        startsAt?: string;
        endsAt?: string;
        timeZone?: string;
      }
    | undefined;

  if (!rawPayload?.title || !rawPayload?.startsAt) {
    const msg = 'stepOutputs.eventPayload is missing title or startsAt';
    logger.error('[execute-approved-action] ' + msg, {
      workflowRunId,
      approvalId,
    });
    await markWorkflowFailed(workflowRunId, msg);
    return;
  }

  // 5. Call createCalendarEvent (idempotent — Google 409 = success)
  try {
    const result = await createCalendarEvent({
      approvalId,
      userId: action.userId,
      payload: {
        title: rawPayload.title,
        startsAt: rawPayload.startsAt,
        endsAt: rawPayload.endsAt,
        timeZone: rawPayload.timeZone ?? 'UTC',
      },
      calendarClient,
    });

    // 6. CAS: running → completed
    // Merge into existing stepOutputs so approvalId survives completion —
    // the cycle-time join (#12140) and outcome attribution both read
    // step_outputs ->> 'approvalId' on completed runs.
    await markWorkflowCompleted(workflowRunId, {
      ...stepOutputs,
      ...(result as unknown as Record<string, unknown>),
    });

    // Workflow-level result log (#12145) — fail-soft, never throws.
    await recordWorkflowStepResult({
      runId: workflowRunId,
      step: 'execute_approved_action',
      agent: EXECUTOR_AGENT,
      status: 'success',
      latencyMs: Date.now() - executionStartedAtMs,
      linkedOpportunityId: approvalId,
    });

    logger.info('[execute-approved-action] Workflow completed', {
      workflowRunId,
      approvalId,
      googleEventId: result.googleEventId,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error('[execute-approved-action] createCalendarEvent failed', {
      workflowRunId,
      approvalId,
      err,
    });
    await captureError('execute-approved-action failed', err, {
      workflowRunId,
      approvalId,
    });
    await markWorkflowFailed(workflowRunId, errorMessage);

    // Workflow-level result log (#12145) — fail-soft, never throws.
    await recordWorkflowStepResult({
      runId: workflowRunId,
      step: 'execute_approved_action',
      agent: EXECUTOR_AGENT,
      status: 'failed',
      latencyMs: Date.now() - executionStartedAtMs,
      linkedOpportunityId: approvalId,
    });
  }
}
