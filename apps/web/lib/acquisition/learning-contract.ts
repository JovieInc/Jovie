import { z } from 'zod';

// Opaque private-store pointers only: no messages, contacts, signed URLs or tokens.
export const learningRef = z
  .string()
  .max(240)
  .regex(/^record:\/\/[a-zA-Z0-9/_-]+$/);
const id = z.string().trim().min(1).max(160);
export const learningDigest = z.string().regex(/^[a-f0-9]{64}$/);
const sourceSha = z.string().regex(/^[a-f0-9]{40}$/);
const amount = z.number().finite().nonnegative();

export const LEARNING_RESOURCES = [
  'browserCalls',
  'humanReviewMinutes',
  'modelCalls',
  'repairCycles',
  'researchPages',
  'retries',
  'spendUsd',
  'variants',
] as const;
export const LearningResourcesSchema = z.strictObject({
  browserCalls: amount.int(),
  humanReviewMinutes: amount,
  modelCalls: amount.int(),
  repairCycles: amount.int(),
  researchPages: amount.int(),
  retries: amount.int(),
  spendUsd: amount,
  variants: amount.int(),
});
export const LearningBudgetSchema = z.strictObject({
  cancelled: z.boolean(),
  case: z.strictObject({
    limit: LearningResourcesSchema,
    used: LearningResourcesSchema,
  }),
  experiment: z.strictObject({
    limit: LearningResourcesSchema,
    used: LearningResourcesSchema,
  }),
});
export type LearningBudget = z.infer<typeof LearningBudgetSchema>;

export const LEARNING_FAILURES = [
  'broken_artifact',
  'claim_activation_failure',
  'delivery_failure',
  'insufficient_evidence',
  'missing_repeated_value',
  'poor_job_offer_fit',
  'unavailable_capability',
  'unsupported_copy',
  'unsupported_paid_inference',
  'wrong_ambiguous_identity',
] as const;
export type LearningFailure = (typeof LEARNING_FAILURES)[number];

export const LearningEventSchema = z.strictObject({
  tenantId: id,
  productId: id,
  candidateId: id,
  type: z.enum([
    'activation',
    'candidate_terminal',
    'capability_fix_landed',
    'claim',
    'material_source_changed',
    'nonresponse',
    'opt_out',
    'payment',
    'reply',
    'retained_value',
    'review_correction',
    'useful_outcome',
  ]),
  capability: id,
  version: id,
  evidenceDigest: learningDigest,
  evidenceRefs: z.array(learningRef).min(1).max(32),
  failureClass: z.enum(LEARNING_FAILURES).nullable(),
  fixedVersion: id.nullable(),
});
export type LearningEvent = z.infer<typeof LearningEventSchema>;

const versions = z.strictObject({
  audience: id,
  capability: id,
  copy: id,
  offer: id,
  price: id,
  source: id,
});
const manifest = z.strictObject({
  digest: learningDigest,
  caseIds: z.array(id).min(1).max(200),
});
export const ImprovementPlanSchema = z
  .strictObject({
    id,
    version: id,
    owner: id,
    sourceSha,
    kind: z.enum(['commercial_experiment', 'deterministic_repair']),
    hypothesis: id,
    customerProblemRef: learningRef,
    competingExplanations: z.array(id).min(2).max(8),
    boundedAction: id,
    managementDecisionRef: learningRef,
    cohort: id,
    incumbent: versions,
    challenger: versions,
    chosenVariable: versions.keyof(),
    comparisonDesignRef: learningRef,
    pilotSpecDigest: id,
    protectedMetrics: z.array(id).min(1).max(16),
    frozenAt: z.iso.datetime(),
    reviewBy: z.iso.datetime(),
    window: z.strictObject({ start: z.iso.datetime(), end: z.iso.datetime() }),
    stopCriteria: z.array(id).min(1).max(16),
    rollbackRef: learningRef,
    budget: z.strictObject({
      case: LearningResourcesSchema,
      experiment: LearningResourcesSchema,
    }),
    cases: z.strictObject({
      development: manifest,
      replay: manifest,
      heldout: manifest,
    }),
  })
  .superRefine((plan, ctx) => {
    const changed = Object.keys(plan.incumbent).filter(
      key =>
        plan.incumbent[key as keyof typeof plan.incumbent] !==
        plan.challenger[key as keyof typeof plan.challenger]
    );
    const allCases = Object.values(plan.cases).flatMap(set => set.caseIds);
    const errors = [
      changed.length !== 1 || changed[0] !== plan.chosenVariable
        ? 'exactly one declared variable may change'
        : null,
      plan.kind === 'deterministic_repair' &&
      plan.chosenVariable !== 'capability'
        ? 'commercial changes require human approval'
        : null,
      Date.parse(plan.frozenAt) > Date.parse(plan.window.start) ||
      Date.parse(plan.window.start) >= Date.parse(plan.window.end) ||
      Date.parse(plan.window.end) >= Date.parse(plan.reviewBy)
        ? 'freeze before a finite observation window'
        : null,
      new Set(allCases).size !== allCases.length
        ? 'comparison cases must be distinct and disjoint'
        : null,
    ];
    for (const message of errors) {
      if (message) ctx.addIssue({ code: 'custom', message });
    }
  });
export type ImprovementPlan = z.infer<typeof ImprovementPlanSchema>;

const count = z.number().int().nonnegative();
const outcomeCount = z
  .strictObject({ numerator: count, denominator: count })
  .refine(row => row.numerator <= row.denominator);
const comparison = z.strictObject({
  digest: learningDigest,
  status: z.enum(['passed', 'regressed', 'unknown']),
  receiptRef: learningRef,
});
// Consumes JOV-5243/6431 outputs; this is neither a metrics store nor a judge.
export const ImprovementEvidenceSchema = z.strictObject({
  sourceSha,
  mode: z.enum(['actual', 'shadow', 'replay']),
  comparisons: z.strictObject({
    development: comparison,
    replay: comparison,
    heldout: comparison,
  }),
  heldoutEvaluations: count,
  humanLabelRefs: z.array(learningRef).max(32),
  outcomeCalibrationRefs: z.array(learningRef).max(32),
  receiptRef: learningRef,
  observedAt: z.iso.datetime(),
  matureThrough: z.iso.datetime(),
  instrumentation: z.enum(['complete', 'missing', 'delayed']),
  attributable: z.boolean(),
  sourceCoverage: z.strictObject({ observed: count, expected: count }),
  operationalPass: outcomeCount,
  usefulResult: outcomeCount,
  realPayment: outcomeCount,
  retainedValue: outcomeCount,
  fullWorkflowCost: z.strictObject({
    usd: amount.nullable(),
    manualRescueMinutes: amount.nullable(),
    includesFailures: z.boolean(),
    includesManualRescue: z.boolean(),
  }),
  lagHours: amount.nullable(),
  negativeEvidenceRefs: z.array(learningRef).max(32),
  uncertainty: z.array(id).max(32),
});
export type ImprovementEvidence = z.infer<typeof ImprovementEvidenceSchema>;
