/**
 * Explicit cost eligibility for real-model eval lanes (JOV-6234).
 *
 * Live-model calls are paid. They run only when an operator explicitly
 * authorizes the spend: the REAL_EVAL_COST_ELIGIBILITY token (typed
 * REAL_MODEL_EVAL_APPROVED) plus an explicit positive BUDGET_CAP_USD.
 * Scheduled and other automatic runs never set either, so they can never
 * make a paid call. There is no automatic metered fallback.
 */

import { parseBudgetCapUsd } from './budget';

/** Operator-typed authorization token for paid live-model eval runs. */
export const REAL_EVAL_COST_ELIGIBILITY_TOKEN = 'REAL_MODEL_EVAL_APPROVED';

export function isRealModelEvalCostEligible(
  env: Record<string, string | undefined> = process.env
): boolean {
  return (
    env.REAL_EVAL_COST_ELIGIBILITY === REAL_EVAL_COST_ELIGIBILITY_TOKEN &&
    parseBudgetCapUsd(env.BUDGET_CAP_USD) > 0
  );
}
