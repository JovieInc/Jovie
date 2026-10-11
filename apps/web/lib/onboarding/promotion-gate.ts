/**
 * Promotion gate + versioned receipts for onboarding script lines (JOV-7148).
 *
 * Live onboarding copy can only change through a merged PR that carries a
 * `PROMOTION_RECEIPT_SCHEMA` entry in
 * `apps/web/data/onboarding-script-promotions/receipts.json`. That path is
 * wired into `ci-promptfoo-evals`, so the protected deterministic replay lane
 * must go green at the merge queue before the receipt lands. Evaluators,
 * fixtures and thresholds live under `apps/web/tests/eval/` — CODEOWNERS
 * keeps them outside the optimizer's reach.
 *
 * Gate evidence has two halves:
 * - `evalCheck`: the protected `ci-promptfoo-evals` result for the PR head.
 * - `cohort`: funnel evidence against the north star (JOV-7146), including
 *   the holdout arm defined in `line-source.ts`.
 *
 * A receipt is self-describing and reversible: every change carries the
 * prior `status`/`weight`, and `buildRollbackReceipt` derives the inverse
 * `ROLLBACK_RECEIPT_SCHEMA` entry a follow-up PR can land to undo it.
 */

export const PROTECTED_EVAL_CHECK = 'ci-promptfoo-evals' as const;
export const NORTH_STAR_METRIC = 'trialing_mrr_retained' as const;
export const PROMOTION_RECEIPT_SCHEMA =
  'jovie-onboarding-script-promotion/v1' as const;
export const ROLLBACK_RECEIPT_SCHEMA =
  'jovie-onboarding-script-rollback/v1' as const;

export interface PromotionEvalEvidence {
  readonly checkName: string;
  /** 'success' is the only conclusion that opens the gate. */
  readonly conclusion: string;
  readonly runId?: string;
  readonly headSha?: string;
}

export interface PromotionCohortEvidence {
  /** Must equal NORTH_STAR_METRIC — funnel truth from JOV-7146. */
  readonly metric: string;
  readonly impressions: number;
  readonly conversions: number;
  /** True when the stable holdout arm regressed — blocks promotion. */
  readonly holdoutRegressed: boolean;
}

export interface PromotionGateEvidence {
  readonly evalCheck?: PromotionEvalEvidence | null;
  readonly cohort?: PromotionCohortEvidence | null;
}

export interface PromotionGateResult {
  readonly ok: boolean;
  readonly reason: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function evaluatePromotionGate(
  evidence: PromotionGateEvidence | null | undefined
): PromotionGateResult {
  const evalCheck = isRecord(evidence?.evalCheck) ? evidence.evalCheck : null;
  if (!evalCheck || evalCheck.checkName !== PROTECTED_EVAL_CHECK) {
    return {
      ok: false,
      reason: `protected eval check ${PROTECTED_EVAL_CHECK} is missing`,
    };
  }
  if (evalCheck.conclusion !== 'success') {
    return {
      ok: false,
      reason: `protected eval check concluded ${String(evalCheck.conclusion)}`,
    };
  }
  const cohort = isRecord(evidence?.cohort) ? evidence.cohort : null;
  if (!cohort || cohort.metric !== NORTH_STAR_METRIC) {
    return { ok: false, reason: 'north-star cohort evidence is missing' };
  }
  if (
    typeof cohort.impressions !== 'number' ||
    typeof cohort.conversions !== 'number' ||
    cohort.impressions <= 0
  ) {
    return { ok: false, reason: 'cohort evidence lacks measured volume' };
  }
  if (cohort.holdoutRegressed === true) {
    return { ok: false, reason: 'holdout arm regressed' };
  }
  return { ok: true, reason: 'gate-open' };
}

export type PromotionAction = 'promote' | 'reweight' | 'retire' | 'restore';

export interface PromotionLineState {
  readonly status: 'active' | 'candidate' | 'retired';
  readonly weight: number;
}

export interface PromotionLineChange {
  readonly lineKey: string;
  readonly stepId: string;
  readonly action: PromotionAction;
  /** Post-change serving state. */
  readonly status: PromotionLineState['status'];
  readonly weight: number;
  /** State before the change — the rollback anchor. */
  readonly previous: PromotionLineState;
  readonly text?: string;
}

export interface PromotionReceipt {
  readonly schema: typeof PROMOTION_RECEIPT_SCHEMA;
  readonly receiptId: string;
  readonly issuedAt: string;
  readonly evidence: {
    readonly evalCheck: PromotionEvalEvidence;
    readonly cohort: PromotionCohortEvidence;
  };
  readonly changes: readonly PromotionLineChange[];
}

export interface RollbackReceipt {
  readonly schema: typeof ROLLBACK_RECEIPT_SCHEMA;
  readonly receiptId: string;
  readonly issuedAt: string;
  readonly rollsBack: string;
  readonly changes: readonly PromotionLineChange[];
}

function toLineChange(value: unknown): PromotionLineChange | null {
  if (!isRecord(value)) return null;
  const previous = isRecord(value.previous) ? value.previous : null;
  const status = value.status;
  const prevStatus = previous?.status;
  if (
    typeof value.lineKey !== 'string' ||
    typeof value.stepId !== 'string' ||
    !['promote', 'reweight', 'retire', 'restore'].includes(
      String(value.action)
    ) ||
    !['active', 'candidate', 'retired'].includes(String(status)) ||
    typeof value.weight !== 'number' ||
    !['active', 'candidate', 'retired'].includes(String(prevStatus)) ||
    typeof previous?.weight !== 'number'
  ) {
    return null;
  }
  return {
    lineKey: value.lineKey,
    stepId: value.stepId,
    action: value.action as PromotionAction,
    status: status as PromotionLineState['status'],
    weight: value.weight,
    previous: {
      status: prevStatus as PromotionLineState['status'],
      weight: previous.weight,
    },
    ...(typeof value.text === 'string' ? { text: value.text } : {}),
  };
}

function toEvalEvidence(value: unknown): PromotionEvalEvidence | null {
  if (!isRecord(value)) return null;
  if (
    value.checkName !== PROTECTED_EVAL_CHECK ||
    value.conclusion !== 'success'
  ) {
    return null;
  }
  return {
    checkName: PROTECTED_EVAL_CHECK,
    conclusion: 'success',
    ...(typeof value.runId === 'string' ? { runId: value.runId } : {}),
    ...(typeof value.headSha === 'string' ? { headSha: value.headSha } : {}),
  };
}

function toCohortEvidence(value: unknown): PromotionCohortEvidence | null {
  if (!isRecord(value)) return null;
  if (
    value.metric !== NORTH_STAR_METRIC ||
    typeof value.impressions !== 'number' ||
    typeof value.conversions !== 'number'
  ) {
    return null;
  }
  return {
    metric: NORTH_STAR_METRIC,
    impressions: value.impressions,
    conversions: value.conversions,
    holdoutRegressed: value.holdoutRegressed === true,
  };
}

/** Strict parse — malformed or gated-out receipts never apply. */
export function parsePromotionReceipt(value: unknown): PromotionReceipt | null {
  if (!isRecord(value) || value.schema !== PROMOTION_RECEIPT_SCHEMA) {
    return null;
  }
  if (typeof value.receiptId !== 'string' || value.receiptId.length === 0) {
    return null;
  }
  const evidence = isRecord(value.evidence) ? value.evidence : null;
  const evalCheck = toEvalEvidence(evidence?.evalCheck);
  const cohort = toCohortEvidence(evidence?.cohort);
  if (!evalCheck || !cohort) return null;
  if (!Array.isArray(value.changes) || value.changes.length === 0) {
    return null;
  }
  const changes = value.changes.map(toLineChange);
  if (changes.some(change => change === null)) return null;
  return {
    schema: PROMOTION_RECEIPT_SCHEMA,
    receiptId: value.receiptId,
    issuedAt: typeof value.issuedAt === 'string' ? value.issuedAt : '',
    evidence: { evalCheck, cohort },
    changes: changes as PromotionLineChange[],
  };
}

export function parseRollbackReceipt(value: unknown): RollbackReceipt | null {
  if (!isRecord(value) || value.schema !== ROLLBACK_RECEIPT_SCHEMA) {
    return null;
  }
  if (
    typeof value.receiptId !== 'string' ||
    typeof value.rollsBack !== 'string' ||
    !Array.isArray(value.changes) ||
    value.changes.length === 0
  ) {
    return null;
  }
  const changes = value.changes.map(toLineChange);
  if (changes.some(change => change === null)) return null;
  return {
    schema: ROLLBACK_RECEIPT_SCHEMA,
    receiptId: value.receiptId,
    issuedAt: typeof value.issuedAt === 'string' ? value.issuedAt : '',
    rollsBack: value.rollsBack,
    changes: changes as PromotionLineChange[],
  };
}

export function buildPromotionReceipt(input: {
  readonly receiptId: string;
  readonly evidence: PromotionGateEvidence;
  readonly changes: readonly PromotionLineChange[];
  readonly issuedAt?: string;
}): PromotionReceipt | null {
  const gate = evaluatePromotionGate(input.evidence);
  if (!gate.ok || input.changes.length === 0) return null;
  const evalCheck = toEvalEvidence(input.evidence?.evalCheck);
  const cohort = toCohortEvidence(input.evidence?.cohort);
  if (!evalCheck || !cohort) return null;
  return {
    schema: PROMOTION_RECEIPT_SCHEMA,
    receiptId: input.receiptId,
    issuedAt: input.issuedAt ?? new Date().toISOString(),
    evidence: { evalCheck, cohort },
    changes: input.changes,
  };
}

/** Inverse receipt: each change restores its recorded previous state. */
export function buildRollbackReceipt(
  receipt: PromotionReceipt,
  input: { readonly receiptId: string; readonly issuedAt?: string }
): RollbackReceipt {
  return {
    schema: ROLLBACK_RECEIPT_SCHEMA,
    receiptId: input.receiptId,
    issuedAt: input.issuedAt ?? new Date().toISOString(),
    rollsBack: receipt.receiptId,
    changes: receipt.changes.map(change => ({
      lineKey: change.lineKey,
      stepId: change.stepId,
      action: 'restore',
      status: change.previous.status,
      weight: change.previous.weight,
      previous: { status: change.status, weight: change.weight },
    })),
  };
}
