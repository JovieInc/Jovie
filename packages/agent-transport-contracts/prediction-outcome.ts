import { z } from 'zod';

export const PREDICTION_RECEIPT_SCHEMA =
  'jovie.prediction-outcome/prediction/v1' as const;

const id = z.string().trim().min(1).max(200);
const ref = z.string().trim().min(1).max(600);
const nullableRef = ref.nullable();
const timestamp = z.iso.datetime({ offset: true });
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const sha = z.string().regex(/^[a-f0-9]{40}$/u);
const unknownNumber = z.number().finite().nullable();
const scope = z.strictObject({ tenantId: id, scopeId: id, entityId: id });
// biome-ignore format: this finite contract enum is clearer on one line.
const stageStatuses = ['pending', 'succeeded', 'failed', 'cancelled', 'rejected', 'regressive', 'inconclusive', 'unmeasurable'] as const;
const stage = z.strictObject({
  status: z.enum(stageStatuses),
  value: unknownNumber,
  observedAt: timestamp.nullable(),
});

function containsSecret(value: unknown): boolean {
  // biome-ignore format: keep the bounded secret detector auditable as one expression.
  return /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk|ghp|lin_api)_[A-Za-z0-9_-]{12,}|["']?(?:secret|token|password|apiKey)["']?\s*[=:]\s*["']?\S+)/iu.test(JSON.stringify(value));
}

export const DecisionPredictionReceiptSchema = z
  .strictObject({
    schema: z.literal(PREDICTION_RECEIPT_SCHEMA),
    predictionId: id,
    identity: z.strictObject({
      decisionId: id,
      taskRunId: id.nullable(),
      experimentId: id.nullable(),
      variantId: id.nullable(),
      ...scope.shape,
    }),
    links: z.strictObject({
      issueRef: nullableRef,
      commitRef: nullableRef,
      deploymentRef: nullableRef,
      certificationRef: nullableRef,
    }),
    decisionAt: timestamp,
    predictedAt: timestamp,
    temporalClass: z.enum(['prospective', 'retrospective']),
    input: z.strictObject({
      snapshotRef: ref,
      snapshotDigest: digest,
      capturedAt: timestamp,
      freshness: z.enum(['fresh', 'stale', 'unknown']),
      provenanceRefs: z.array(ref).min(1),
    }),
    target: z.strictObject({
      stage: z.enum(['engineering', 'customer', 'business']),
      name: id,
      units: id,
      horizonEndsAt: timestamp,
      baseline: unknownNumber,
    }),
    action: z.strictObject({
      eligibleActionsRef: ref,
      selectedAction: id,
      // biome-ignore format: keep the guarded contract compact.
      selectionMethod: z.enum(['deterministic', 'randomized', 'historical-unknown']),
      selectionProbability: z.number().positive().max(1).nullable(),
    }),
    prediction: z.strictObject({
      expected: z.union([z.string().trim().min(1), unknownNumber]),
      lower: unknownNumber,
      upper: unknownNumber,
      confidence: z.enum(['unknown', 'low', 'medium', 'high']),
    }),
    versions: z.strictObject({
      model: nullableRef,
      provider: nullableRef,
      prompt: nullableRef,
      policy: nullableRef,
      codeRevision: sha.nullable(),
      executionTupleRef: nullableRef,
    }),
    disclosure: z.strictObject({
      providerData: z.enum(['authorized', 'withheld']),
      consent: z.enum(['valid', 'not-required']),
      consentRef: nullableRef,
      consentValidUntil: timestamp.nullable(),
    }),
    management: z.strictObject({
      strategyVersionRef: nullableRef,
      opportunityRef: nullableRef,
      alternativesRef: ref,
      hypothesis: id,
      authorityRef: ref,
      outcomeOwner: id,
      reviewAt: timestamp,
    }),
  })
  .superRefine((receipt, context) => {
    const captured = Date.parse(receipt.input.capturedAt);
    const predicted = Date.parse(receipt.predictedAt);
    const decided = Date.parse(receipt.decisionAt);
    const randomized = receipt.action.selectionMethod === 'randomized';
    const checks = [
      [
        receipt.temporalClass === 'prospective' &&
          (captured > predicted || predicted > decided),
        'prospective timing is invalid',
      ],
      [
        randomized !== (receipt.action.selectionProbability !== null),
        'selection probability is invalid',
      ],
      [
        receipt.disclosure.providerData === 'withheld' &&
          (receipt.versions.provider !== null ||
            receipt.versions.model !== null),
        'provider disclosure is unauthorized',
      ],
      [
        (receipt.disclosure.providerData === 'authorized' &&
          receipt.disclosure.consent !== 'valid') ||
          (receipt.disclosure.consent === 'valid' &&
            (!receipt.disclosure.consentRef ||
              !receipt.disclosure.consentValidUntil ||
              Date.parse(receipt.disclosure.consentValidUntil) < decided)),
        'consent is missing or expired',
      ],
      [
        (receipt.versions.codeRevision === null) !==
          (receipt.links.commitRef === null) ||
          (receipt.versions.codeRevision !== null &&
            receipt.versions.codeRevision !== receipt.links.commitRef),
        'exact revision requires evidence',
      ],
      [containsSecret(receipt), 'receipt contains secret material'],
    ] as const;
    for (const [invalid, message] of checks) {
      if (invalid) context.addIssue({ code: 'custom', message });
    }
  });

export const MeasuredOutcomeReceiptSchema = z
  .strictObject({
    schema: z.literal('jovie.prediction-outcome/outcome/v1'),
    outcomeId: id,
    predictionId: id,
    revision: z.number().int().positive(),
    supersedesRevision: z.number().int().positive().nullable(),
    identity: scope,
    exposureRef: nullableRef,
    attemptRefs: z.array(ref),
    retries: z.number().int().nonnegative(),
    reworkCount: z.number().int().nonnegative(),
    observedAt: timestamp,
    recordedAt: timestamp,
    // biome-ignore format: keep the guarded contract compact.
    maturity: z.enum(['missing', 'immature', 'mature', 'unattributable', 'unmeasurable']),
    stages: z.strictObject({
      engineering: stage,
      customer: stage,
      business: stage,
    }),
    fullyLoadedCost: z.strictObject({
      usd: unknownNumber,
      attributionRef: nullableRef,
    }),
    guardrailRefs: z.array(ref),
    runtimeVerificationRef: nullableRef,
    humanCorrectionRefs: z.array(ref),
    // biome-ignore format: compact leaf schema.
    certification: z.strictObject({ ref, certifierId: id, actorId: id }).nullable(),
    disposition: z.strictObject({
      kind: z.enum(['retain', 'promote', 'hold', 'reject', 'rollback']),
      ref,
    }),
  })
  .superRefine((receipt, context) => {
    const certification = receipt.certification;
    const checks = [
      [
        (receipt.revision === 1 && receipt.supersedesRevision !== null) ||
          (receipt.revision > 1 &&
            receipt.supersedesRevision !== receipt.revision - 1),
        'outcome correction chain is invalid',
      ],
      [
        receipt.maturity !== 'mature' &&
          ['promote', 'retain'].includes(receipt.disposition.kind),
        'immature outcome cannot promote',
      ],
      [
        Date.parse(receipt.observedAt) > Date.parse(receipt.recordedAt),
        'outcome observation is future-dated',
      ],
      [
        Boolean(
          certification && certification.certifierId === certification.actorId
        ),
        'actor cannot self-certify',
      ],
      [
        receipt.maturity !== 'mature' &&
          Object.values(receipt.stages).some(stage => stage.value !== null),
        'non-mature outcome values must remain unknown',
      ],
      [
        receipt.fullyLoadedCost.usd !== null &&
          receipt.fullyLoadedCost.attributionRef === null,
        'attributed cost requires evidence',
      ],
      [containsSecret(receipt), 'receipt contains secret material'],
    ] as const;
    for (const [invalid, message] of checks) {
      if (invalid) context.addIssue({ code: 'custom', message });
    }
  });

// biome-ignore format: compact exported schema type.
export type DecisionPredictionReceipt = z.infer<typeof DecisionPredictionReceiptSchema>;
// biome-ignore format: compact exported schema type.
export type MeasuredOutcomeReceipt = z.infer<typeof MeasuredOutcomeReceiptSchema>;

export function bindMeasuredOutcome(
  predictionInput: unknown,
  outcomeInput: unknown
): { prediction: DecisionPredictionReceipt; outcome: MeasuredOutcomeReceipt } {
  const prediction = DecisionPredictionReceiptSchema.parse(predictionInput);
  const outcome = MeasuredOutcomeReceiptSchema.parse(outcomeInput);
  const identity = prediction.identity;
  if (
    outcome.predictionId !== prediction.predictionId ||
    outcome.identity.tenantId !== identity.tenantId ||
    outcome.identity.scopeId !== identity.scopeId ||
    outcome.identity.entityId !== identity.entityId
  ) {
    throw new Error('outcome is cross-bound');
  }
  if (Date.parse(outcome.observedAt) < Date.parse(prediction.decisionAt)) {
    throw new Error('outcome leaks a future label into the decision');
  }
  if (prediction.identity.experimentId && !outcome.exposureRef) {
    throw new Error('experiment outcome requires an exposure');
  }
  if (
    outcome.maturity === 'mature' &&
    Date.parse(outcome.observedAt) < Date.parse(prediction.target.horizonEndsAt)
  ) {
    throw new Error('outcome is not mature at the observation horizon');
  }
  return { prediction, outcome };
}

export function predictionTelemetryDisposition(input: {
  readonly required: boolean;
  readonly persisted: boolean;
  readonly incidentRef: string | null;
}) {
  if (!input.persisted && !input.incidentRef) {
    throw new Error(
      'prediction telemetry failure requires an incident receipt'
    );
  }
  return {
    execution: input.persisted || !input.required ? 'allow' : 'hold',
    optimization: input.persisted ? 'eligible' : 'hold',
  } as const;
}

export function reconcileMeasuredOutcomes(input: {
  readonly predictions: readonly unknown[];
  readonly existing: readonly unknown[];
  readonly incoming: readonly unknown[];
}) {
  const predictions = input.predictions.map(value =>
    DecisionPredictionReceiptSchema.parse(value)
  );
  const byPrediction = new Map(predictions.map(row => [row.predictionId, row]));
  const byRevision = new Map<string, MeasuredOutcomeReceipt>();
  const affected = new Set<string>();
  const values = [...input.existing, ...input.incoming];
  for (const [index, value] of values.entries()) {
    const row = MeasuredOutcomeReceiptSchema.parse(value);
    const prediction = byPrediction.get(row.predictionId);
    if (!prediction) throw new Error('outcome prediction is unavailable');
    bindMeasuredOutcome(prediction, row);
    const key = `${row.outcomeId}:${row.revision}`;
    const prior = byRevision.get(key);
    if (prior && JSON.stringify(prior) !== JSON.stringify(row)) {
      throw new Error('duplicate outcome revision conflicts');
    }
    if (!prior) {
      byRevision.set(key, row);
      if (index >= input.existing.length) affected.add(row.predictionId);
    }
  }
  const outcomes = [...byRevision.values()].sort(
    (left, right) =>
      left.outcomeId.localeCompare(right.outcomeId) ||
      left.revision - right.revision
  );
  const latest = new Map<string, MeasuredOutcomeReceipt>();
  const outcomeIds = new Map<string, string>();
  for (const row of outcomes) {
    const outcomeId = outcomeIds.get(row.predictionId);
    if (outcomeId && outcomeId !== row.outcomeId)
      throw new Error('duplicate outcome stream');
    if (
      row.revision > 1 &&
      !byRevision.has(`${row.outcomeId}:${row.revision - 1}`)
    ) {
      throw new Error('outcome correction predecessor is unavailable');
    }
    outcomeIds.set(row.predictionId, row.outcomeId);
    latest.set(row.predictionId, row);
  }
  const prospective = predictions.filter(
    row => row.temporalClass === 'prospective'
  );
  const mature = prospective.filter(
    row => latest.get(row.predictionId)?.maturity === 'mature'
  );
  return {
    outcomes,
    affectedPredictionIds: [...affected].sort(),
    coverage: {
      eligibleDecisions: prospective.length,
      matureOutcomes: mature.length,
      missingOutcomes: prospective.filter(row => !latest.has(row.predictionId))
        .length,
      heldFromPromotion: prospective.filter(
        row => latest.get(row.predictionId)?.maturity !== 'mature'
      ).length,
      sourceFreshness: prospective.map(row => row.input.freshness),
      decisionToOutcomeLatencyMs: mature.map(
        row =>
          Date.parse(latest.get(row.predictionId)!.observedAt) -
          Date.parse(row.decisionAt)
      ),
    },
  };
}
