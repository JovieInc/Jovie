import { z } from 'zod';

export const LEARNING_METADATA_SCHEMA = 'jovie.evidence-learning/v1' as const;
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u);
const revision = z.number().int().positive();
const sha = z.string().regex(/^[a-f0-9]{40}$/u);
const digest = z.string().regex(/^[a-f0-9]{64}$/u);

/** References are locators, never commands, local files or credential carriers. */
export const LearningSourceRefSchema = z
  .string()
  .max(600)
  .refine(value => {
    if (!/^(?:https|artifact|record):\/\/[A-Za-z0-9._~:/-]+$/u.test(value))
      return false;
    const parts = value.split('://')[1].split('/');
    if (parts.some(part => part === '.' || part === '..')) return false;
    const host = parts[0];
    if (value.startsWith('https://')) {
      return (
        /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/u.test(host) &&
        !/^[0-9.]+$/u.test(host) &&
        !/\.(?:local|localhost|internal)$/iu.test(host)
      );
    }
    return /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(host);
  }, 'unsafe learning source reference');
const ref = LearningSourceRefSchema;

export const LearningBindingSchema = z.strictObject({
  tenantId: id,
  productId: id,
  cohortId: id.nullable(),
});
export type LearningBinding = z.infer<typeof LearningBindingSchema>;
export const LearningWorkSchema = z.strictObject({ id, revision: sha });
export const LearningSourceSchema = z.strictObject({
  eventId: id,
  kind: z.enum(['work-result', 'provider-attempt', 'prediction', 'outcome']),
  receiptId: id,
  receiptRevision: revision,
});

export const LearningMeasurementSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('known'),
    value: z.number().finite().nonnegative(),
    sourceRef: ref,
  }),
  z.strictObject({ status: z.literal('unknown'), reasonCode: id }),
  z.strictObject({ status: z.literal('unavailable'), reasonCode: id }),
]);
const measure = LearningMeasurementSchema;
export const LearningTelemetrySchema = z.strictObject({
  wallTimeMs: measure,
  activeComputeMs: measure,
  inferenceCostUsd: measure,
  toolCostUsd: measure,
  credits: measure,
  subsidiesUsd: measure,
  opportunityDelayMs: measure,
});
const supportingRevision = z.strictObject({
  source: LearningSourceSchema,
  work: LearningWorkSchema,
  binding: LearningBindingSchema,
  ref,
});
const resource = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('resolved'),
    id,
    kind: z.enum(['provider', 'model', 'account', 'tool', 'adapter']),
    resolvedRef: ref,
    version: id,
  }),
  z.strictObject({
    status: z.enum(['unknown', 'unavailable']),
    id,
    kind: z.enum(['provider', 'model', 'account', 'tool', 'adapter']),
    reasonCode: id,
  }),
]);
export const LearningDecisionSchema = z.strictObject({
  lessonId: id,
  state: z.enum([
    'candidate',
    'no-change',
    'quarantined',
    'reviewed',
    'compiled',
    'superseded',
    'consumed',
  ]),
  supportingRevisions: z.array(supportingRevision).min(1).max(64),
  applicability: z.strictObject({
    workClass: id,
    predicateRef: ref,
    binding: LearningBindingSchema,
  }),
  owner: id,
  expectedSaving: z.strictObject({ wallTimeMs: measure, netCostUsd: measure }),
  rollback: z
    .strictObject({
      artifactRef: ref,
      restoreRevision: sha,
    })
    .nullable(),
  revalidation: z.strictObject({
    trigger: z.enum([
      'source-correction',
      'regression',
      'predicate-change',
      'resource-change',
      'relevant-job',
      'threshold-crossing',
    ]),
    ref,
  }),
  review: z
    .strictObject({ reviewer: id, workRevision: sha, evidenceRef: ref })
    .nullable(),
  compiled: z
    .strictObject({ artifactRef: ref, beforeRevision: sha, afterRevision: sha })
    .nullable(),
  supersededBy: ref.nullable(),
  consumption: z
    .strictObject({
      consumerRef: ref,
      work: LearningWorkSchema,
      binding: LearningBindingSchema,
    })
    .nullable(),
});

export function sameLearningBinding(
  left: LearningBinding,
  right: LearningBinding
): boolean {
  return (
    left.tenantId === right.tenantId &&
    left.productId === right.productId &&
    left.cohortId === right.cohortId
  );
}

export function containsLearningSecret(value: unknown): boolean {
  return /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk|ghp|github_pat|lin_api)_[A-Za-z0-9_-]{12,}|\bBearer\s+\S+|(?:secret|token|password|apiKey)["']?\s*[=:]\s*["']?\S+)/iu.test(
    JSON.stringify(value)
  );
}

export const LearningMetadataSchema = z
  .strictObject({
    schema: z.literal(LEARNING_METADATA_SCHEMA),
    revision,
    supersedesRevision: revision.nullable(),
    source: LearningSourceSchema,
    work: LearningWorkSchema,
    binding: LearningBindingSchema,
    producer: z.discriminatedUnion('status', [
      z.strictObject({ status: z.literal('uncommissioned'), owner: id }),
      z.strictObject({
        status: z.literal('authorized'),
        owner: id,
        authorizationRef: ref,
      }),
    ]),
    intent: z.strictObject({ id, version: id }),
    plan: z.strictObject({ id, version: id }),
    inputs: z
      .array(
        z.strictObject({
          ref,
          digest,
          binding: LearningBindingSchema,
          freshness: z.enum(['fresh', 'stale', 'unknown']),
        })
      )
      .min(1)
      .max(64),
    attempts: z
      .array(
        z.strictObject({
          ordinal: revision,
          kind: z.enum([
            'inference',
            'tool',
            'error',
            'retry',
            'wait',
            'fallback',
            'output',
          ]),
          evidenceRef: ref,
          resourceIds: z.array(id).max(16),
          status: z.enum(['succeeded', 'failed', 'canceled', 'unknown']),
          failureCategory: id.nullable(),
        })
      )
      .min(1)
      .max(256),
    resources: z.array(resource).min(1).max(64),
    verification: z
      .array(
        z.strictObject({
          stage: z.enum([
            'source',
            'ci',
            'review',
            'build',
            'deploy',
            'runtime',
            'outcome',
          ]),
          workRevision: sha,
          status: z.enum(['passed', 'failed', 'unknown', 'unavailable']),
          evidenceRef: ref.nullable(),
        })
      )
      .min(1)
      .max(7),
    classification: z.strictObject({
      failureCategory: id.nullable(),
      methodFingerprint: digest.nullable(),
    }),
    redaction: z.strictObject({
      policyRef: ref,
      policyVersion: id,
      mode: z.literal('references-and-digests-only'),
    }),
    sourceRefs: z.array(ref).min(1).max(64),
    telemetry: LearningTelemetrySchema,
    triage: z.enum(['healthy', 'anomalous', 'unassessed']),
    decision: LearningDecisionSchema,
  })
  .superRefine((row, context) => {
    const fail = (message: string) =>
      context.addIssue({ code: 'custom', message });
    if (
      row.supersedesRevision !== (row.revision === 1 ? null : row.revision - 1)
    )
      fail('learning correction chain is invalid');
    // No raw prompts, errors, account credentials or executable predicates belong here.
    if (containsLearningSecret(row)) fail('learning contains secret material');
    const decision = row.decision;
    const bindings = [
      decision.applicability.binding,
      ...row.inputs.map(input => input.binding),
      ...decision.supportingRevisions.map(support => support.binding),
      ...(decision.consumption ? [decision.consumption.binding] : []),
    ];
    if (bindings.some(binding => !sameLearningBinding(binding, row.binding)))
      fail('learning tenant/product/cohort binding is incompatible');
    const supportKeys = row.decision.supportingRevisions.map(
      item =>
        `${item.source.kind}:${item.source.receiptId}@${item.source.receiptRevision}`
    );
    if (new Set(supportKeys).size !== supportKeys.length)
      fail('duplicate supporting source revision');
    const resourceIds = new Set(row.resources.map(item => item.id));
    if (resourceIds.size !== row.resources.length)
      fail('duplicate resolved resource');
    if (
      row.attempts.some(
        (attempt, index) =>
          attempt.ordinal !== index + 1 ||
          attempt.resourceIds.some(key => !resourceIds.has(key)) ||
          (attempt.status === 'failed' && !attempt.failureCategory)
      )
    )
      fail('attempt order, resource or failure evidence is invalid');
    if (
      new Set(row.verification.map(stage => stage.stage)).size !==
        row.verification.length ||
      row.verification.some(
        stage =>
          stage.workRevision !== row.work.revision ||
          (['passed', 'failed'].includes(stage.status) && !stage.evidenceRef)
      )
    )
      fail(
        'verification must bind distinct stages to the work revision and evidence'
      );
    if (
      !row.classification.failureCategory &&
      !row.classification.methodFingerprint
    )
      fail('failure category or method fingerprint is required');
    if (
      row.triage === 'healthy' &&
      (row.producer.status !== 'authorized' ||
        Object.values(row.telemetry).some(value => value.status !== 'known') ||
        row.inputs.some(input => input.freshness !== 'fresh') ||
        row.resources.some(item => item.status !== 'resolved') ||
        row.attempts.some(attempt => attempt.status !== 'succeeded') ||
        row.verification.some(stage => stage.status !== 'passed') ||
        !row.verification.some(stage => stage.stage === 'outcome') ||
        row.classification.failureCategory !== null ||
        !row.classification.methodFingerprint)
    )
      fail(
        'healthy learning requires complete telemetry and verified outcome evidence'
      );
    const promoted = ['reviewed', 'compiled', 'consumed'].includes(
      decision.state
    );
    if (
      promoted &&
      (row.producer.status !== 'authorized' ||
        !decision.review ||
        decision.review.reviewer === decision.owner ||
        decision.review.reviewer === row.producer.owner ||
        decision.review.workRevision !== row.work.revision)
    )
      fail(
        'reviewed learning requires authorized production and independent revision-bound review'
      );
    if (
      ['compiled', 'consumed'].includes(decision.state) &&
      (!decision.compiled ||
        !decision.rollback ||
        decision.compiled.beforeRevision === decision.compiled.afterRevision ||
        decision.rollback.restoreRevision !== decision.compiled.beforeRevision)
    )
      fail(
        'compiled learning requires a changed artifact and matching rollback'
      );
    if ((decision.state === 'superseded') !== (decision.supersededBy !== null))
      fail('superseded learning requires an explicit successor');
    if ((decision.state === 'consumed') !== (decision.consumption !== null))
      fail('consumed learning requires an exact consumer binding');
  });
export type LearningMetadata = z.infer<typeof LearningMetadataSchema>;
