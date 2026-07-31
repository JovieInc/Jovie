import 'server-only';

import { and, eq } from 'drizzle-orm';
import type { PersistedToolEvent } from '@/lib/chat/tool-events';
import {
  markWorkflowCompleted,
  markWorkflowFailed,
} from '@/lib/connectors/workflows/execute-approved-action';
import { db } from '@/lib/db';
import { chatMessages } from '@/lib/db/schema/chat';
import { workflowRuns } from '@/lib/db/schema/connectors';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';
import {
  ONBOARDING_PRESENCE_BUILD_WORKFLOW_KIND,
  PRESENCE_BUILD_STEPS,
  type PresenceBuildStepId,
} from './constants';
import { executePresenceBuildStep } from './execute-step';
import {
  buildFailedToolEvent,
  buildSucceededToolEvent,
  replaceToolEvent,
} from './tool-events';
import {
  isPresenceBuildStepOutputs,
  type PresenceBuildStepOutputs,
  type PresenceBuildStepState,
} from './types';

export interface AdvancePresenceBuildResult {
  readonly done: boolean;
  readonly advanced: boolean;
  readonly workflowRunId: string;
  readonly toolEvents: PersistedToolEvent[];
  readonly steps: Record<PresenceBuildStepId, PresenceBuildStepState>;
  readonly lastStepId: PresenceBuildStepId | null;
}

function nextQueuedStep(
  outputs: PresenceBuildStepOutputs
): PresenceBuildStepId | null {
  for (const stepId of PRESENCE_BUILD_STEPS) {
    const status = outputs.steps[stepId]?.status;
    if (status === 'queued' || status === 'running') {
      return stepId;
    }
  }
  return null;
}

function allTerminal(outputs: PresenceBuildStepOutputs): boolean {
  return PRESENCE_BUILD_STEPS.every(stepId => {
    const status = outputs.steps[stepId]?.status;
    return (
      status === 'completed' || status === 'skipped' || status === 'failed'
    );
  });
}

/**
 * Advance one presence-build step for a workflow run.
 * Updates workflow_runs.stepOutputs and the welcome message tool_calls.
 */
export async function advanceOnboardingPresenceBuild(options: {
  readonly workflowRunId: string;
}): Promise<AdvancePresenceBuildResult | null> {
  try {
    const [run] = await db
      .select({
        id: workflowRuns.id,
        status: workflowRuns.status,
        stepOutputs: workflowRuns.stepOutputs,
        kind: workflowRuns.kind,
      })
      .from(workflowRuns)
      .where(eq(workflowRuns.id, options.workflowRunId))
      .limit(1);

    if (!run || run.kind !== ONBOARDING_PRESENCE_BUILD_WORKFLOW_KIND) {
      return null;
    }

    if (!isPresenceBuildStepOutputs(run.stepOutputs)) {
      await markWorkflowFailed(run.id, 'invalid presence-build stepOutputs');
      return null;
    }

    const outputs = run.stepOutputs;

    if (run.status === 'completed' || allTerminal(outputs)) {
      return {
        done: true,
        advanced: false,
        workflowRunId: run.id,
        toolEvents: outputs.toolEvents,
        steps: outputs.steps,
        lastStepId: null,
      };
    }

    const stepId = nextQueuedStep(outputs);
    if (!stepId) {
      await markWorkflowCompleted(run.id, {
        ...outputs,
      } as unknown as Record<string, unknown>);
      return {
        done: true,
        advanced: false,
        workflowRunId: run.id,
        toolEvents: outputs.toolEvents,
        steps: outputs.steps,
        lastStepId: null,
      };
    }

    // Claim running if still queued
    if (run.status === 'queued') {
      await db
        .update(workflowRuns)
        .set({
          status: 'running',
          claimedAt: new Date(),
          leaseExpiresAt: new Date(Date.now() + 5 * 60_000),
          currentStep: stepId,
          updatedAt: new Date(),
        })
        .where(
          and(eq(workflowRuns.id, run.id), eq(workflowRuns.status, 'queued'))
        );
    } else {
      await db
        .update(workflowRuns)
        .set({
          currentStep: stepId,
          leaseExpiresAt: new Date(Date.now() + 5 * 60_000),
          updatedAt: new Date(),
        })
        .where(eq(workflowRuns.id, run.id));
    }

    let nextToolEvent: PersistedToolEvent;
    let nextStepState: PresenceBuildStepState;

    try {
      const artifact = await executePresenceBuildStep(
        stepId,
        outputs.profileId
      );
      const isEmpty = Boolean(artifact.empty);
      nextToolEvent = buildSucceededToolEvent(stepId, artifact);
      nextStepState = {
        id: stepId,
        status: isEmpty ? 'skipped' : 'completed',
        artifact,
        completedAt: new Date().toISOString(),
      };
    } catch (stepError) {
      const message =
        stepError instanceof Error ? stepError.message : String(stepError);
      logger.warn('[presence-build] step failed', {
        workflowRunId: run.id,
        stepId,
        message,
      });
      nextToolEvent = buildFailedToolEvent(stepId, message);
      nextStepState = {
        id: stepId,
        status: 'failed',
        error: message,
        completedAt: new Date().toISOString(),
      };
    }

    const nextToolEvents = replaceToolEvent(outputs.toolEvents, nextToolEvent);
    const nextOutputs: PresenceBuildStepOutputs = {
      ...outputs,
      steps: {
        ...outputs.steps,
        [stepId]: nextStepState,
      },
      toolEvents: nextToolEvents,
    };

    await db
      .update(chatMessages)
      .set({ toolCalls: nextToolEvents })
      .where(eq(chatMessages.id, outputs.messageId));

    const done = allTerminal(nextOutputs);
    if (done) {
      await markWorkflowCompleted(
        run.id,
        nextOutputs as unknown as Record<string, unknown>
      );
    } else {
      await db
        .update(workflowRuns)
        .set({
          stepOutputs: nextOutputs,
          currentStep: nextQueuedStep(nextOutputs),
          updatedAt: new Date(),
        })
        .where(eq(workflowRuns.id, run.id));
    }

    return {
      done,
      advanced: true,
      workflowRunId: run.id,
      toolEvents: nextToolEvents,
      steps: nextOutputs.steps,
      lastStepId: stepId,
    };
  } catch (error) {
    await captureError('Failed to advance onboarding presence build', error, {
      route: 'onboarding/presence-build',
      workflowRunId: options.workflowRunId,
    });
    try {
      await markWorkflowFailed(
        options.workflowRunId,
        error instanceof Error ? error.message : String(error)
      );
    } catch {
      // markWorkflowFailed is best-effort
    }
    return null;
  }
}

/** Drain remaining steps (cron / background). Bounded to step count. */
export async function runOnboardingPresenceBuild(
  workflowRunId: string
): Promise<void> {
  for (let i = 0; i < PRESENCE_BUILD_STEPS.length + 1; i += 1) {
    const result = await advanceOnboardingPresenceBuild({ workflowRunId });
    if (!result || result.done || !result.advanced) {
      return;
    }
  }
}
