import { z } from 'zod';
import {
  containsLearningSecret,
  LearningBindingSchema,
  type LearningMetadata,
  LearningMetadataSchema,
  LearningWorkSchema,
  sameLearningBinding,
} from './learning-metadata';
import { MeasuredOutcomeReceiptSchema } from './prediction-outcome';
import { parseDecisionPredictionReceipt } from './prediction-receipt';
import { verifyProviderAttemptReceipt } from './provider-attempt-receipt';
import { parseWorkResult } from './work-order';

export * from './learning-metadata';

const OwnerContextSchema = z.strictObject({
  binding: LearningBindingSchema,
  work: LearningWorkSchema,
});
export type LearningOwnerContext = z.infer<typeof OwnerContextSchema>;
export type LearningEvidenceReceipt = ReturnType<
  typeof parseLearningEvidenceReceipt
>;

/**
 * Additive reader: remove only the learning attachment, then use the original
 * canonical reader. Provider contentDigest continues to seal the original body.
 * No write, dispatch, lease, ledger or producer authorization is created here.
 */
export function parseLearningEvidenceReceipt(
  input: unknown,
  ownerContext?: LearningOwnerContext
) {
  const envelope = z.record(z.string(), z.unknown()).parse(input);
  const { learning: attached, ...body } = envelope;
  let source: {
    kind: LearningMetadata['source']['kind'];
    receiptId: string;
    receiptRevision: number;
  };
  let workId: string;
  let tenantId: string | undefined;
  let cohortId: string | null | undefined;
  let workRevision: string | null | undefined;
  let eligible = true;
  let receipt:
    | ReturnType<typeof parseWorkResult>
    | ReturnType<typeof verifyProviderAttemptReceipt>
    | ReturnType<typeof parseDecisionPredictionReceipt>
    | z.infer<typeof MeasuredOutcomeReceiptSchema>;
  switch (body.schema) {
    case 'jovie.work-result/v1': {
      const result = parseWorkResult(body);
      receipt = result;
      source = {
        kind: 'work-result',
        receiptId: result.orderId,
        receiptRevision: result.orderRevision,
      };
      workId = result.orderId;
      eligible =
        result.terminalState === 'succeeded' && result.outcome.status === 'met';
      break;
    }
    case 'jovie.provider-attempt-receipt/v1': {
      const result = verifyProviderAttemptReceipt(body);
      receipt = result;
      source = {
        kind: 'provider-attempt',
        receiptId: result.receiptId,
        receiptRevision: result.version,
      };
      workId = result.binding.parentWrunId;
      // This receipt records an original failure, even when continuation succeeds.
      eligible = false;
      break;
    }
    case 'jovie.prediction-outcome/prediction/v1': {
      const result = parseDecisionPredictionReceipt(body);
      receipt = result;
      source = {
        kind: 'prediction',
        receiptId: result.predictionId,
        receiptRevision: 1,
      };
      workId = result.predictionId;
      tenantId = result.identity.tenantId;
      cohortId = result.identity.experimentId;
      workRevision = (result.versions as { codeRevision: string | null })
        .codeRevision;
      // A pre-action prediction cannot prove a measured outcome.
      eligible = false;
      break;
    }
    case 'jovie.prediction-outcome/outcome/v1': {
      const result = MeasuredOutcomeReceiptSchema.parse(body);
      receipt = result;
      source = {
        kind: 'outcome',
        receiptId: result.outcomeId,
        receiptRevision: result.revision,
      };
      workId = result.predictionId;
      tenantId = result.identity.tenantId;
      eligible =
        result.maturity === 'mature' &&
        Object.values(result.stages).every(
          stage => stage.status === 'succeeded'
        );
      break;
    }
    default:
      throw new Error('unsupported canonical evidence receipt');
  }
  if (!Object.hasOwn(envelope, 'learning')) return { receipt, learning: null };
  const learning = LearningMetadataSchema.parse(attached);
  if (containsLearningSecret(body))
    throw new Error('canonical evidence contains secret material');
  if (!ownerContext)
    throw new Error('learning attachment requires trusted owner context');
  const context = OwnerContextSchema.parse(ownerContext);
  if (
    !sameLearningBinding(learning.binding, context.binding) ||
    learning.work.id !== context.work.id ||
    learning.work.revision !== context.work.revision ||
    learning.work.id !== workId ||
    (tenantId !== undefined && tenantId !== learning.binding.tenantId) ||
    (cohortId !== undefined && cohortId !== learning.binding.cohortId) ||
    (workRevision != null && workRevision !== learning.work.revision)
  )
    throw new Error('learning attachment is cross-bound');
  if (
    learning.source.kind !== source.kind ||
    learning.source.receiptId !== source.receiptId ||
    learning.source.receiptRevision !== source.receiptRevision
  )
    throw new Error(
      'learning source does not match canonical receipt revision'
    );
  if (learning.triage === 'healthy' && !eligible)
    throw new Error('canonical evidence cannot validate healthy learning');
  return { receipt, learning };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

const transitions: Record<
  LearningMetadata['decision']['state'],
  readonly LearningMetadata['decision']['state'][]
> = {
  candidate: [
    'candidate',
    'no-change',
    'quarantined',
    'reviewed',
    'superseded',
  ],
  compiled: ['compiled', 'consumed', 'quarantined', 'superseded'],
  consumed: ['consumed', 'quarantined', 'superseded'],
  'no-change': ['candidate', 'no-change', 'quarantined', 'superseded'],
  quarantined: ['candidate', 'quarantined', 'superseded'],
  reviewed: ['compiled', 'quarantined', 'reviewed', 'superseded'],
  superseded: ['superseded'],
};

/** Pure reconciliation over existing source history; callers retain persistence ownership. */
export function reconcileLearningEvidence(input: {
  readonly existing: readonly unknown[];
  readonly incoming: readonly unknown[];
  readonly ownerContext: LearningOwnerContext;
}) {
  const revisions = new Map<
    string,
    { receipt: unknown; learning: LearningMetadata }
  >();
  const changed = new Set<string>();
  for (const [index, value] of [
    ...input.existing,
    ...input.incoming,
  ].entries()) {
    const parsed = parseLearningEvidenceReceipt(value, input.ownerContext);
    if (!parsed.learning) continue;
    const row = { receipt: parsed.receipt, learning: parsed.learning };
    const key = `${row.learning.source.eventId}@${row.learning.revision}`;
    const prior = revisions.get(key);
    if (prior && canonical(prior) !== canonical(row))
      throw new Error('duplicate learning revision conflicts');
    if (!prior) {
      revisions.set(key, row);
      if (index >= input.existing.length)
        changed.add(row.learning.source.eventId);
    }
  }
  const rows = [...revisions.values()].sort(
    (left, right) =>
      left.learning.source.eventId.localeCompare(
        right.learning.source.eventId
      ) || left.learning.revision - right.learning.revision
  );
  const latest = new Map<string, LearningMetadata>();
  for (const { learning: row, receipt } of rows) {
    const previous = latest.get(row.source.eventId);
    if (
      row.revision > 1 &&
      (!previous || previous.revision !== row.supersedesRevision)
    )
      throw new Error('learning correction predecessor is unavailable');
    if (
      !previous &&
      ['reviewed', 'compiled', 'consumed'].includes(row.decision.state)
    )
      throw new Error(
        'learning promotion requires candidate and review history'
      );
    if (previous) {
      const preceding = revisions.get(
        `${row.source.eventId}@${previous.revision}`
      );
      if (
        row.source.receiptRevision === previous.source.receiptRevision &&
        canonical(receipt) !== canonical(preceding?.receipt)
      )
        throw new Error('duplicate canonical source revision conflicts');
      if (
        row.source.kind !== previous.source.kind ||
        row.source.receiptId !== previous.source.receiptId ||
        row.source.receiptRevision < previous.source.receiptRevision ||
        row.work.id !== previous.work.id ||
        row.work.revision !== previous.work.revision ||
        !sameLearningBinding(row.binding, previous.binding) ||
        canonical(row.intent) !== canonical(previous.intent) ||
        canonical(row.plan) !== canonical(previous.plan) ||
        row.decision.lessonId !== previous.decision.lessonId ||
        row.decision.owner !== previous.decision.owner
      )
        throw new Error(
          'learning correction changes immutable source or ownership binding'
        );
      if (!transitions[previous.decision.state].includes(row.decision.state))
        throw new Error('learning state transition is invalid');
    }
    latest.set(row.source.eventId, row);
  }
  return {
    revisions: rows,
    latest: [...latest.values()],
    affectedSourceEventIds: [...changed].sort(),
  };
}
