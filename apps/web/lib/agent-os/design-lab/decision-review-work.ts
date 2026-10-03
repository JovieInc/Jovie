import { marketingDecisionDigest } from '@/data/marketing';
import {
  buildDispatchRequest,
  expectedDispatchRequest,
  marketingReviewTaskDigest,
  marketingReviewWorkPlanDigest,
  type AdmitMarketingReviewWorkInput,
  type AdmitMarketingReviewWorkResult,
  type MarketingReviewDispatchDependencies,
  type MarketingReviewDispatchRejection,
  type MarketingReviewWorkPlan,
  type MarketingReviewWorkTask,
} from './review-work-contracts';

export * from './review-work-contracts';
export {
  planMarketingReviewWork,
  planMarketingReviewWorkFromImprovement,
} from './review-work-planner';

function rejected(
  reason: MarketingReviewDispatchRejection,
  idempotencyKey: string | null
): AdmitMarketingReviewWorkResult {
  return {
    admitted: false,
    dispatched: false,
    reason,
    idempotencyKey,
  };
}

/**
 * Recompute all prepared evidence before admission. Readonly TypeScript
 * fields do not protect a plan received from a queue, file, or caller, so the
 * canonical task and dispatch payload must agree with their stored digests.
 */
export function verifyMarketingReviewWorkPlan(
  plan: MarketingReviewWorkPlan
): boolean {
  try {
    if (plan.workDigest !== marketingReviewWorkPlanDigest(plan)) return false;
    if (!plan.task) return true;
    if (plan.status !== 'dispatchable' || plan.task.status !== 'dispatchable') {
      return false;
    }
    if (plan.task.taskDigest !== marketingReviewTaskDigest(plan.task)) {
      return false;
    }
    const expected = expectedDispatchRequest(plan.task);
    return (
      marketingDecisionDigest(plan.task.dispatchRequest) ===
      marketingDecisionDigest(expected)
    );
  } catch {
    return false;
  }
}

function affectedStageBudgetsAvailable(
  task: MarketingReviewWorkTask,
  budgets: AdmitMarketingReviewWorkInput['remainingStageBudgets']
): boolean {
  return task.stages.every(stage => {
    const remaining = budgets[stage];
    return Number.isInteger(remaining) && remaining >= 1;
  });
}

/**
 * Explicit admission bridge for the existing Hermes worker. Preparation is
 * side-effect free. The owner reservation is required and must be atomic and
 * durable; without it this function cannot dispatch a worker.
 */
export async function admitAndDispatchMarketingReviewWork(
  input: AdmitMarketingReviewWorkInput,
  dependencies: MarketingReviewDispatchDependencies = {}
): Promise<AdmitMarketingReviewWorkResult> {
  const task = input.plan.task;
  if (!task) {
    return rejected(
      input.plan.status === 'duplicate'
        ? 'duplicate'
        : input.plan.status === 'advisory-only'
          ? 'legacy-only'
          : 'registry-ineligible',
      null
    );
  }
  if (!verifyMarketingReviewWorkPlan(input.plan)) {
    return rejected('stale-evidence', task.idempotencyKey);
  }
  if (input.plan.status !== 'dispatchable') {
    return rejected('registry-ineligible', task.idempotencyKey);
  }
  const owner = input.owner.trim();
  if (!owner || task.owner !== owner) {
    return rejected('unauthorized-owner', task.idempotencyKey);
  }
  if (
    input.currentContextDigest !== task.contextDigest ||
    input.currentSourceRevision !== task.sourceRevision ||
    input.currentArtifactSha256 !== task.artifactSha256
  ) {
    return rejected('stale-evidence', task.idempotencyKey);
  }
  if (
    input.allowAutonomousDeployment === true ||
    task.autonomousDeployment !== false
  ) {
    return rejected('autonomous-deployment-forbidden', task.idempotencyKey);
  }
  if (
    !affectedStageBudgetsAvailable(task, input.remainingStageBudgets) ||
    !Number.isInteger(input.remainingTotalBudget) ||
    input.remainingTotalBudget < 1
  ) {
    return rejected('budget-exhausted', task.idempotencyKey);
  }
  if (!dependencies.reserveDispatch || !dependencies.dispatchHermesWorker) {
    return rejected('admission-unavailable', task.idempotencyKey);
  }

  let reservation;
  try {
    reservation = await dependencies.reserveDispatch({
      idempotencyKey: task.idempotencyKey,
      taskId: task.taskId,
      taskDigest: task.taskDigest,
      workDigest: input.plan.workDigest,
      owner,
    });
  } catch {
    return rejected('admission-unavailable', task.idempotencyKey);
  }
  if (reservation.status === 'duplicate') {
    return rejected('duplicate', task.idempotencyKey);
  }
  if (reservation.status === 'unavailable') {
    return rejected('admission-unavailable', task.idempotencyKey);
  }

  try {
    const dispatch = await dependencies.dispatchHermesWorker(
      task.dispatchRequest
    );
    return {
      admitted: true,
      dispatched: true,
      idempotencyKey: task.idempotencyKey,
      taskId: task.taskId,
      dispatch,
    };
  } catch {
    return rejected('worker-rejected', task.idempotencyKey);
  }
}

// Keep the canonical builder available to server-side callers that need to
// compare a persisted request without importing the admission implementation.
export { buildDispatchRequest };
