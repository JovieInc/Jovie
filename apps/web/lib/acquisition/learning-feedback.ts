/** Private preparation on the existing certification record; never exposure authority. */
import { containsLearningSecret } from '@jovie/agent-transport-contracts/learning-evidence';
import { z } from 'zod';
import type { CertificationReviewPacket } from '@/lib/agent-os/certification';
import type { AcquisitionCertificationCandidate } from './certification-store';
import {
  LEARNING_RESOURCES,
  LearningBudgetSchema,
  LearningEventSchema,
  learningRef,
} from './learning-contract';
import {
  learningDigest,
  planAcquisitionLearningEvent,
} from './learning-policy';

const id = z.string().trim().min(1).max(160);
export const ACQUISITION_FEEDBACK_LIMIT = 32;
export const LearningFeedbackContextSchema = z.strictObject({
  tenantId: id,
  productId: id,
  cohortId: id,
  offerVersion: id,
  capability: id,
  version: id,
  budget: LearningBudgetSchema,
});
export type LearningFeedbackContext = z.infer<
  typeof LearningFeedbackContextSchema
>;

export const AcquisitionLearningFeedbackSchema = z
  .strictObject({
    candidateRevision: id,
    cohortId: id,
    offerVersion: id,
    source: z.strictObject({
      ref: learningRef,
      revision: id,
      occurredAt: z.iso.datetime(),
      receivedAt: z.iso.datetime(),
      kind: z.enum([
        'creator-feedback',
        'fleet-critique',
        'external-advice',
        'customer-zero',
      ]),
    }),
    reason: z.string().trim().min(1).max(600),
    uncertainty: z.array(id).max(16),
    result: z.enum(['negative', 'inconclusive', 'observed']),
    event: LearningEventSchema.omit({ evidenceDigest: true }),
    customerZero: z
      .strictObject({
        successCriteriaRef: learningRef,
        resultRef: learningRef,
        fulfillment: z.enum(['human', 'automated', 'mixed']),
        privacy: z.literal('founder-private'),
        status: z.enum(['met', 'not-met', 'unknown']),
      })
      .optional(),
  })
  .superRefine((row, ctx) => {
    if (containsLearningSecret(row))
      ctx.addIssue({
        code: 'custom',
        message: 'Private feedback contains secret material.',
      });
    if ((row.source.kind === 'customer-zero') !== Boolean(row.customerZero))
      ctx.addIssue({
        code: 'custom',
        message:
          'Customer-zero evidence requires private criteria and fulfillment receipts.',
      });
  });
export type AcquisitionLearningFeedback = z.infer<
  typeof AcquisitionLearningFeedbackSchema
>;
export interface AcquisitionLearningFeedbackReceipt {
  readonly feedback: AcquisitionLearningFeedback;
  readonly eventKey: string;
  readonly plan: ReturnType<typeof planAcquisitionLearningEvent>;
  readonly preparedAt: string;
  readonly sourceSha: string;
  readonly executionAuthority: 'none';
}

/** The domain resolves the immutable source; request bodies cannot supply advice or authority. */
export interface AcquisitionLearningFeedbackPorts {
  resolve(sourceRef: string): Promise<unknown>;
  /** Read current scope/cancellation on every CAS attempt, while candidate custody is held. */
  context(
    candidate: AcquisitionCertificationCandidate
  ): LearningFeedbackContext;
}

function eventFor(feedback: AcquisitionLearningFeedback) {
  const advice = ['fleet-critique', 'external-advice'].includes(
    feedback.source.kind
  );
  return LearningEventSchema.parse({
    ...feedback.event,
    // Advice is preserved, but cannot classify a verified defect or landed fix.
    ...(advice
      ? { type: 'review_correction', failureClass: null, fixedVersion: null }
      : {}),
    evidenceDigest: learningDigest(feedback),
  });
}

function feedbackPlan(
  feedback: AcquisitionLearningFeedback,
  history: readonly AcquisitionLearningFeedbackReceipt[],
  budget: LearningFeedbackContext['budget']
) {
  const event = eventFor(feedback);
  return planAcquisitionLearningEvent({
    event,
    seenEventKeys: history.map(row => row.eventKey),
    existingFixKeys: history.flatMap(row =>
      row.plan.action === 'route' ? [row.plan.fixKey] : []
    ),
    affectedCandidates: [{ ...event }],
    budget,
    nextCost: Object.fromEntries(LEARNING_RESOURCES.map(key => [key, 0])),
  });
}

export function parseLearningFeedbackHistory(
  value: unknown
): AcquisitionLearningFeedbackReceipt[] {
  if (value === undefined) return [];
  const rows = z
    .array(
      z.strictObject({
        feedback: AcquisitionLearningFeedbackSchema,
        eventKey: z.string().regex(/^[a-f0-9]{64}$/),
        plan: z.record(z.string(), z.unknown()),
        preparedAt: z.iso.datetime(),
        sourceSha: z.string().regex(/^[a-f0-9]{40}$/),
        executionAuthority: z.literal('none'),
      })
    )
    .max(ACQUISITION_FEEDBACK_LIMIT)
    .parse(value);
  const identities = new Set<string>();
  const history: AcquisitionLearningFeedbackReceipt[] = [];
  const zero = Object.fromEntries(LEARNING_RESOURCES.map(key => [key, 0]));
  const budget = LearningBudgetSchema.parse({
    cancelled: false,
    case: { limit: zero, used: zero },
    experiment: { limit: zero, used: zero },
  });
  for (const row of rows) {
    const identity = learningDigest([
      row.feedback.source.ref,
      row.feedback.source.revision,
    ]);
    const plan = feedbackPlan(row.feedback, history, budget);
    if (
      identities.has(identity) ||
      row.eventKey !== plan.eventKey ||
      learningDigest(row.plan) !== learningDigest(plan)
    )
      throw new Error('Invalid persisted acquisition feedback identity.');
    identities.add(identity);
    history.push({ ...row, plan });
  }
  return history;
}

/** Pure CAS update: feedback, dedup identity and prepared route commit together. */
export function prepareLearningFeedback(input: {
  candidate: AcquisitionCertificationCandidate;
  context: LearningFeedbackContext;
  sourceRef: string;
  feedback: unknown;
  history: readonly AcquisitionLearningFeedbackReceipt[];
  now: string;
}) {
  const feedback = AcquisitionLearningFeedbackSchema.parse(input.feedback);
  const context = LearningFeedbackContextSchema.parse(input.context);
  const sourceSha = z
    .string()
    .regex(/^[a-f0-9]{40}$/)
    .parse(input.candidate.packet.source?.sha);
  const now = Date.parse(input.now);
  const observed = Date.parse(input.candidate.observedAt);
  const expires = Date.parse(input.candidate.expiresAt);
  if (
    !Number.isFinite(now) ||
    !Number.isFinite(observed) ||
    !Number.isFinite(expires) ||
    observed > now ||
    expires <= observed ||
    Date.parse(feedback.source.occurredAt) >
      Date.parse(feedback.source.receivedAt) ||
    Date.parse(feedback.source.receivedAt) > now ||
    expires <= now
  )
    throw new Error('Stale or invalid feedback timestamps.');
  const event = eventFor(feedback);
  if (
    feedback.source.ref !== input.sourceRef ||
    feedback.candidateRevision !== input.candidate.revision ||
    feedback.cohortId !== context.cohortId ||
    feedback.offerVersion !== context.offerVersion ||
    event.candidateId !== input.candidate.leadId ||
    !(['tenantId', 'productId', 'capability', 'version'] as const).every(
      key => event[key] === context[key]
    ) ||
    !event.evidenceRefs.includes(feedback.source.ref)
  )
    throw new Error(
      'Feedback escaped its canonical candidate, cohort or version.'
    );
  const plan = feedbackPlan(feedback, input.history, context.budget);
  if (plan.action === 'stop')
    throw new Error(`Feedback preparation stopped: ${plan.blockers.join(',')}`);
  const previous = input.history.find(
    row =>
      row.feedback.source.ref === feedback.source.ref &&
      row.feedback.source.revision === feedback.source.revision
  );
  if (previous) {
    if (learningDigest(previous.feedback) !== learningDigest(feedback))
      throw new Error('Conflicting immutable feedback revision.');
    return { history: input.history, receipt: previous };
  }
  if (input.history.length >= ACQUISITION_FEEDBACK_LIMIT)
    throw new Error('Private feedback ceiling reached.');
  const receipt: AcquisitionLearningFeedbackReceipt = {
    feedback,
    eventKey: plan.eventKey,
    plan,
    preparedAt: input.now,
    sourceSha,
    executionAuthority: 'none',
  };
  return { history: [...input.history, receipt], receipt };
}

/** Provenance only: advice cannot pass machine tests or veto fresh certification.
 * The history digest invalidates old approvals; existing proof and authority still govern actions.
 */
export function attachLearningFeedback(
  packet: CertificationReviewPacket,
  history: readonly AcquisitionLearningFeedbackReceipt[]
): CertificationReviewPacket {
  if (
    [...packet.canonicalReferences, ...packet.invariantEvaluation].some(row =>
      row.id.startsWith('acquisition-feedback:')
    )
  )
    throw new Error('Reserved acquisition feedback evidence identity.');
  return {
    ...packet,
    canonicalReferences: [
      ...packet.canonicalReferences,
      ...history.map(row => ({
        id: `acquisition-feedback:${row.eventKey}`,
        tier: 'canonical_references' as const,
        status: 'passed' as const,
        // This certifies reading the immutable record, not its advice or original artifact.
        // Original evaluator SHA remains in the sealed row and the visible summary.
        sourceSha: packet.source?.sha ?? null,
        ref: row.feedback.source.ref,
        digest: learningDigest(row),
        summary: `Record provenance only; advice and efficacy unverified. ${row.feedback.source.kind}; ${row.feedback.result}; ${row.feedback.reason}; uncertainty: ${row.feedback.uncertainty.join(', ') || 'not assessed'}; source ${row.feedback.source.revision} at ${row.feedback.source.occurredAt}; received ${row.feedback.source.receivedAt}; original SHA ${row.sourceSha}; candidate ${row.feedback.candidateRevision}; offer ${row.feedback.offerVersion}; capability ${row.feedback.event.capability}@${row.feedback.event.version}; prepare-only ${row.plan.action}; incumbent retained; execution authority none`,
      })),
    ],
  };
}
