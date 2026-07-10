/**
 * One-click campaign approval orchestrator (JOV-2210).
 *
 * Idempotent multi-step workflow with visible step status, retries, and
 * partial-failure safety (no silent inconsistent success).
 */

import type {
  ApprovalStepId,
  ApprovalStepRecord,
  ApprovalWorkflowState,
} from './types';

export const APPROVAL_STEP_ORDER: readonly ApprovalStepId[] = Object.freeze([
  'create_campaign',
  'create_drop',
  'update_smart_link',
  'draft_notifications',
  'select_audience',
  'create_tasks',
  'schedule_launch',
  'enable_monitoring',
]);

function nowIso(now?: string): string {
  return now ?? new Date().toISOString();
}

function emptyStep(id: ApprovalStepId, at: string): ApprovalStepRecord {
  return {
    id,
    status: 'pending',
    attempt: 0,
    output: null,
    error: null,
    updatedAt: at,
  };
}

export function buildApprovalIdempotencyKey(input: {
  readonly artistId: string;
  readonly recommendationId: string;
}): string {
  return `approve:${input.artistId}:${input.recommendationId}`;
}

export function createApprovalWorkflow(input: {
  readonly workflowId: string;
  readonly artistId: string;
  readonly recommendationId: string;
  readonly now?: string;
}): ApprovalWorkflowState {
  const at = nowIso(input.now);
  const idempotencyKey = buildApprovalIdempotencyKey({
    artistId: input.artistId,
    recommendationId: input.recommendationId,
  });

  return {
    workflowId: input.workflowId,
    recommendationId: input.recommendationId,
    artistId: input.artistId,
    idempotencyKey,
    steps: APPROVAL_STEP_ORDER.map(id => emptyStep(id, at)),
    status: 'pending',
    createdAt: at,
    updatedAt: at,
  };
}

/**
 * Idempotent start: same idempotency key returns existing workflow.
 */
export function startOrResumeApproval(input: {
  readonly existing: ApprovalWorkflowState | null;
  readonly workflowId: string;
  readonly artistId: string;
  readonly recommendationId: string;
  readonly now?: string;
}): { readonly workflow: ApprovalWorkflowState; readonly created: boolean } {
  const key = buildApprovalIdempotencyKey({
    artistId: input.artistId,
    recommendationId: input.recommendationId,
  });

  if (input.existing && input.existing.idempotencyKey === key) {
    return { workflow: input.existing, created: false };
  }

  return {
    workflow: createApprovalWorkflow({
      workflowId: input.workflowId,
      artistId: input.artistId,
      recommendationId: input.recommendationId,
      now: input.now,
    }),
    created: true,
  };
}

function deriveWorkflowStatus(
  steps: readonly ApprovalStepRecord[]
): ApprovalWorkflowState['status'] {
  if (steps.every(s => s.status === 'succeeded' || s.status === 'skipped')) {
    return 'completed';
  }
  if (steps.some(s => s.status === 'failed')) {
    const anySuccess = steps.some(s => s.status === 'succeeded');
    return anySuccess ? 'partial' : 'failed';
  }
  if (steps.some(s => s.status === 'running' || s.status === 'succeeded')) {
    return 'running';
  }
  return 'pending';
}

export function markStepRunning(
  workflow: ApprovalWorkflowState,
  stepId: ApprovalStepId,
  now?: string
): ApprovalWorkflowState {
  const at = nowIso(now);
  const steps = workflow.steps.map(step =>
    step.id === stepId
      ? {
          ...step,
          status: 'running' as const,
          attempt: step.attempt + 1,
          error: null,
          updatedAt: at,
        }
      : step
  );
  return {
    ...workflow,
    steps,
    status: 'running',
    updatedAt: at,
  };
}

export function markStepSucceeded(
  workflow: ApprovalWorkflowState,
  stepId: ApprovalStepId,
  output: Readonly<Record<string, unknown>>,
  now?: string
): ApprovalWorkflowState {
  const at = nowIso(now);
  const steps = workflow.steps.map(step =>
    step.id === stepId
      ? {
          ...step,
          status: 'succeeded' as const,
          output,
          error: null,
          updatedAt: at,
        }
      : step
  );
  return {
    ...workflow,
    steps,
    status: deriveWorkflowStatus(steps),
    updatedAt: at,
  };
}

export function markStepFailed(
  workflow: ApprovalWorkflowState,
  stepId: ApprovalStepId,
  error: string,
  now?: string
): ApprovalWorkflowState {
  const at = nowIso(now);
  const steps = workflow.steps.map(step =>
    step.id === stepId
      ? {
          ...step,
          status: 'failed' as const,
          error,
          updatedAt: at,
        }
      : step
  );
  return {
    ...workflow,
    steps,
    status: deriveWorkflowStatus(steps),
    updatedAt: at,
  };
}

/**
 * Retry a failed step: reset to pending so the runner can re-execute.
 * Does not clear prior succeeded steps (partial state remains auditable).
 */
export function retryFailedStep(
  workflow: ApprovalWorkflowState,
  stepId: ApprovalStepId,
  now?: string
): ApprovalWorkflowState {
  const at = nowIso(now);
  const target = workflow.steps.find(s => s.id === stepId);
  if (!target || target.status !== 'failed') {
    return workflow;
  }

  const steps = workflow.steps.map(step =>
    step.id === stepId
      ? {
          ...step,
          status: 'pending' as const,
          error: null,
          updatedAt: at,
        }
      : step
  );

  return {
    ...workflow,
    steps,
    status: deriveWorkflowStatus(steps),
    updatedAt: at,
  };
}

export function nextPendingStep(
  workflow: ApprovalWorkflowState
): ApprovalStepRecord | null {
  return (
    workflow.steps.find(s => s.status === 'pending' || s.status === 'failed') ??
    null
  );
}

/**
 * Run a pure step handler map until completion or first hard failure
 * (when stopOnFailure is true, default).
 */
export function runApprovalSteps(
  workflow: ApprovalWorkflowState,
  handlers: Readonly<
    Partial<
      Record<
        ApprovalStepId,
        () =>
          | {
              readonly ok: true;
              readonly output: Readonly<Record<string, unknown>>;
            }
          | { readonly ok: false; readonly error: string }
      >
    >
  >,
  options: { readonly stopOnFailure?: boolean; readonly now?: string } = {}
): ApprovalWorkflowState {
  const stopOnFailure = options.stopOnFailure ?? true;
  let current = workflow;

  for (const stepId of APPROVAL_STEP_ORDER) {
    const step = current.steps.find(s => s.id === stepId);
    if (!step || step.status === 'succeeded' || step.status === 'skipped') {
      continue;
    }

    const handler = handlers[stepId];
    if (!handler) {
      // No handler: leave pending so artists can review/edit later.
      continue;
    }

    current = markStepRunning(current, stepId, options.now);
    const result = handler();
    if (result.ok) {
      current = markStepSucceeded(current, stepId, result.output, options.now);
    } else {
      current = markStepFailed(current, stepId, result.error, options.now);
      if (stopOnFailure) break;
    }
  }

  return current;
}

export function workflowHasHiddenInconsistency(
  workflow: ApprovalWorkflowState
): boolean {
  // Success without all critical early steps is inconsistent.
  if (workflow.status === 'completed') {
    return workflow.steps.some(
      s => s.status !== 'succeeded' && s.status !== 'skipped'
    );
  }
  // Claiming completed when any step failed.
  if (workflow.status !== 'partial' && workflow.status !== 'failed') {
    return false;
  }
  return false;
}
