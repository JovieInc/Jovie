import { z } from 'zod';
import { ARTIST_VISIBILITY_OFFER_CONTRACT_ID } from '@/lib/billing/offer-truth';

export const COMMERCE_DECISION_PROJECTION_CONTRACT =
  'jovie.commerce-decision-projection/v1' as const;

export const COMMERCE_EVIDENCE_KINDS = [
  'selected-rail',
  'jov-6258-preflight',
  'handoff-correlation',
  'payment-journey',
  'reversal',
] as const;

const MAX_EVIDENCE_AGE_MS = 90 * 24 * 60 * 60_000;
const DEFAULT_EVIDENCE_AGE_MS = 24 * 60 * 60_000;
const SENSITIVE_OR_REUSABLE_ID =
  /^(?:(?:acct|ch|cs|cus|evt|in|ii|pi|pm|price|prod|req|rk|seti|si|sk|src|sub|tok|whsec)_(?:live|test)?|gh[pousr]_|github_pat_|xox[baprs]-|[0-9]+$|[0-9a-f]{8}-[0-9a-f-]{27,})/iu;
const safeToken = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9._:-]*$/u)
  .refine(
    value =>
      !SENSITIVE_OR_REUSABLE_ID.test(value) &&
      !(value.length > 30 && value.split('.').length === 3),
    'sensitive or reusable identifiers are not allowed'
  );
const evidenceStatus = z.enum(['green', 'red', 'unknown']);
const evidenceReceipt = z.object({
  status: evidenceStatus,
  observedAt: z.string().datetime({ offset: true }).nullable(),
  maxAgeMs: z.number().int().positive().max(MAX_EVIDENCE_AGE_MS),
});
const commerceInvalidation = z.object({
  offer: safeToken,
  channel: safeToken,
  rail: safeToken,
  priorDecision: safeToken,
  decisionRevision: safeToken,
  invalidatingEvidence: safeToken,
  sourceEventId: safeToken,
  matrixEvidenceDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  accountAccessReceiptDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  reasons: z.array(safeToken).min(1).max(16),
  nextReevaluationTrigger: z
    .string()
    .min(1)
    .max(500)
    .refine(
      value =>
        !/(?:@|\b(?:acct|ch|cs|cus|evt|in|ii|pi|pm|price|prod|req|rk|seti|si|sk|src|sub|tok|whsec)_[a-z0-9_-]+\b|\b(?:gh[pousr]_|github_pat_)[a-z0-9_-]+\b|\b[0-9]{12,19}\b)/iu.test(
          value
        )
    ),
  state: z.literal('blocked'),
  canary: z.literal('invalidated'),
});
const commerceDecision = z.object({
  offer: safeToken,
  channel: safeToken,
  rail: safeToken.nullable(),
  accessState: z.enum(['supported', 'partner-gated', 'unsupported', 'unknown']),
  merchantOfRecord: safeToken,
  evidence: z.object({
    selectedRail: evidenceReceipt,
    jov6258Preflight: evidenceReceipt,
    handoffCorrelation: evidenceReceipt,
    paymentJourney: evidenceReceipt,
    reversal: evidenceReceipt,
  }),
  decisionRevision: safeToken,
  canary: z.object({
    decisionRevision: safeToken.optional(),
    result: z.enum(['not-run', 'failed', 'passed']),
    observedAt: z.string().datetime({ offset: true }).nullable(),
    maxAgeMs: z.number().int().positive().max(MAX_EVIDENCE_AGE_MS),
  }),
  nextReevaluationTrigger: safeToken,
});

export const commerceDecisionSourceSchema = z
  .object({
    matrixRevision: safeToken,
    decisions: z.array(commerceDecision).min(1).max(32),
    /** Existing capability-reconciliation receipts, supplied by the matrix owner. */
    reconciliations: z
      .array(
        z.object({
          schema: z.literal('jovie.capability-backlog-reconciliation/v1'),
          status: z.enum(['ready', 'unchanged']),
          commerceInvalidations: z.array(commerceInvalidation).max(32),
        })
      )
      .max(64)
      .optional(),
  })
  .superRefine((source, context) => {
    const keys = source.decisions.map(
      decision => `${decision.offer}|${decision.channel}|${decision.rail}`
    );
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: 'custom',
        message: 'commerce decisions must have unique offer/channel/rail keys',
        path: ['decisions'],
      });
    }
  });

export type CommerceDecisionSource = z.infer<
  typeof commerceDecisionSourceSchema
>;
export type CommerceEvidenceKind = (typeof COMMERCE_EVIDENCE_KINDS)[number];
export type CommerceDecisionStatus =
  | 'blocked'
  | 'failed-canary'
  | 'partner-gated'
  | 'passed-canary'
  | 'stale'
  | 'supported';

export interface ProjectedCommerceEvidence {
  readonly kind: CommerceEvidenceKind;
  readonly status: z.infer<typeof evidenceStatus>;
  readonly observedAt: string | null;
  readonly freshnessBudgetMs: number;
}

export interface ProjectedCommerceDecision {
  readonly offer: string;
  readonly channel: string;
  readonly rail: string | null;
  readonly accessState: CommerceDecisionSource['decisions'][number]['accessState'];
  readonly merchantOfRecord: string;
  readonly evidence: readonly ProjectedCommerceEvidence[];
  readonly decisionRevision: string;
  readonly canary: {
    readonly readiness: 'blocked' | 'ready';
    readonly result: 'failed' | 'not-run' | 'passed' | 'stale';
    readonly observedAt: string | null;
    readonly freshnessBudgetMs: number;
  };
  readonly nextReevaluationTrigger: string;
  readonly status: CommerceDecisionStatus;
  readonly blockers: readonly string[];
  readonly eligible: boolean;
  readonly invalidations: readonly z.infer<typeof commerceInvalidation>[];
}

export interface CommerceDecisionProjection {
  readonly contract: typeof COMMERCE_DECISION_PROJECTION_CONTRACT;
  readonly matrixRevision: string;
  readonly evaluatedAt: string;
  readonly acquisitionOffer: typeof ARTIST_VISIBILITY_OFFER_CONTRACT_ID;
  readonly eligible: boolean;
  readonly matrix: readonly ProjectedCommerceDecision[];
}

type EvidenceReceipt = z.infer<typeof evidenceReceipt>;

function unknownReceipt(): EvidenceReceipt {
  return {
    status: 'unknown',
    observedAt: null,
    maxAgeMs: DEFAULT_EVIDENCE_AGE_MS,
  };
}

function unavailableSource(): CommerceDecisionSource {
  return {
    matrixRevision: 'unavailable',
    decisions: [
      {
        offer: ARTIST_VISIBILITY_OFFER_CONTRACT_ID,
        channel: 'agent-handoff',
        rail: 'ordinary-web-checkout',
        accessState: 'unknown',
        merchantOfRecord: 'jovie',
        evidence: {
          selectedRail: unknownReceipt(),
          jov6258Preflight: unknownReceipt(),
          handoffCorrelation: unknownReceipt(),
          paymentJourney: unknownReceipt(),
          reversal: unknownReceipt(),
        },
        decisionRevision: 'unavailable',
        canary: {
          result: 'not-run',
          observedAt: null,
          maxAgeMs: DEFAULT_EVIDENCE_AGE_MS,
        },
        nextReevaluationTrigger: 'commerce-evidence-updated',
      },
    ],
  };
}

function effectiveEvidence(
  receipt: EvidenceReceipt,
  nowMs: number
): ProjectedCommerceEvidence['status'] {
  if (receipt.status !== 'green') return receipt.status;
  if (!receipt.observedAt) return 'unknown';
  const observedAt = Date.parse(receipt.observedAt);
  if (!Number.isFinite(observedAt) || observedAt > nowMs + 5 * 60_000) {
    return 'unknown';
  }
  return nowMs - observedAt <= receipt.maxAgeMs ? 'green' : 'unknown';
}

function evidenceBlocker(
  kind: CommerceEvidenceKind,
  source: EvidenceReceipt,
  status: ProjectedCommerceEvidence['status']
): string | null {
  if (status === 'green') return null;
  const prefix = kind.replaceAll('-', '_');
  if (status === 'red') return `${prefix}_failed`;
  if (source.status === 'green') return `${prefix}_stale`;
  return `${prefix}_missing`;
}

function projectDecision(
  decision: CommerceDecisionSource['decisions'][number],
  nowMs: number,
  history: readonly z.infer<typeof commerceInvalidation>[]
): ProjectedCommerceDecision {
  const invalidations = history.filter(
    item => item.decisionRevision === decision.decisionRevision
  );
  const evidenceSources = [
    ['selected-rail', decision.evidence.selectedRail],
    ['jov-6258-preflight', decision.evidence.jov6258Preflight],
    ['handoff-correlation', decision.evidence.handoffCorrelation],
    ['payment-journey', decision.evidence.paymentJourney],
    ['reversal', decision.evidence.reversal],
  ] as const;
  const evidence = evidenceSources.map(([kind, receipt]) => ({
    kind,
    status: effectiveEvidence(receipt, nowMs),
    observedAt: receipt.observedAt,
    freshnessBudgetMs: receipt.maxAgeMs,
  }));
  if (invalidations.length > 0) {
    // The acquisition cone reads this evidence as well as the canary result.
    evidence[0].status = 'red';
  }
  const blockers = evidenceSources.flatMap(([kind, receipt], index) => {
    const blocker = evidenceBlocker(kind, receipt, evidence[index].status);
    return blocker ? [blocker] : [];
  });
  if (!decision.rail && !blockers.includes('selected_rail_missing')) {
    blockers.unshift('selected_rail_missing');
  }
  if (decision.accessState !== 'supported') {
    blockers.unshift(`access_${decision.accessState.replaceAll('-', '_')}`);
  }
  blockers.push(
    ...invalidations.flatMap(item =>
      item.reasons.map(reason => `commerce_${reason.replaceAll('-', '_')}`)
    )
  );
  const readiness = blockers.length === 0 ? 'ready' : 'blocked';
  const canaryObservedAt = decision.canary.observedAt
    ? Date.parse(decision.canary.observedAt)
    : Number.NaN;
  const canaryStale =
    decision.canary.result === 'passed' &&
    (!Number.isFinite(canaryObservedAt) ||
      canaryObservedAt > nowMs + 5 * 60_000 ||
      nowMs - canaryObservedAt > decision.canary.maxAgeMs ||
      (history.length > 0 &&
        decision.canary.decisionRevision !== decision.decisionRevision));
  const canaryResult =
    canaryStale || invalidations.length > 0 ? 'stale' : decision.canary.result;
  if (canaryResult === 'failed') blockers.push('canary_failed');
  else if (canaryResult === 'not-run') blockers.push('canary_not_run');
  else if (canaryResult === 'stale') blockers.push('canary_stale');

  const hasStaleEvidence = blockers.some(blocker => blocker.endsWith('_stale'));
  let status: CommerceDecisionStatus = 'blocked';
  if (invalidations.length > 0) status = 'blocked';
  else if (decision.accessState === 'partner-gated') status = 'partner-gated';
  else if (hasStaleEvidence) status = 'stale';
  else if (readiness === 'ready' && canaryResult === 'failed') {
    status = 'failed-canary';
  } else if (readiness === 'ready' && canaryResult === 'passed') {
    status = 'passed-canary';
  } else if (readiness === 'ready') status = 'supported';

  return {
    offer: decision.offer,
    channel: decision.channel,
    rail: decision.rail,
    accessState: decision.accessState,
    merchantOfRecord: decision.merchantOfRecord,
    evidence,
    decisionRevision: decision.decisionRevision,
    canary: {
      readiness,
      result: canaryResult,
      observedAt: decision.canary.observedAt,
      freshnessBudgetMs: decision.canary.maxAgeMs,
    },
    nextReevaluationTrigger:
      invalidations.at(-1)?.nextReevaluationTrigger ??
      decision.nextReevaluationTrigger,
    status,
    blockers: [...new Set(blockers)],
    eligible: status === 'passed-canary',
    invalidations,
  };
}

/**
 * Project only the allowlisted commerce contract. Unknown input fields are
 * intentionally discarded so provider credentials, payment data, PII and
 * reusable checkout/customer identifiers cannot cross the Summer boundary.
 */
export function projectCommerceDecisions(
  input: unknown,
  now: Date
): CommerceDecisionProjection {
  const parsed = commerceDecisionSourceSchema.safeParse(input);
  const source = parsed.success ? parsed.data : unavailableSource();
  const matrix = source.decisions.map(decision =>
    projectDecision(
      decision,
      now.getTime(),
      (source.reconciliations ?? [])
        .flatMap(receipt => receipt.commerceInvalidations)
        .filter(
          item =>
            item.offer === decision.offer &&
            item.channel === decision.channel &&
            item.rail === decision.rail
        )
    )
  );
  const acquisitionDecision = matrix.find(
    decision => decision.offer === ARTIST_VISIBILITY_OFFER_CONTRACT_ID
  );
  return {
    contract: COMMERCE_DECISION_PROJECTION_CONTRACT,
    matrixRevision: source.matrixRevision,
    evaluatedAt: now.toISOString(),
    acquisitionOffer: ARTIST_VISIBILITY_OFFER_CONTRACT_ID,
    eligible: acquisitionDecision?.eligible ?? false,
    matrix,
  };
}

export function unknownCommerceDecisionProjection(
  now: Date
): CommerceDecisionProjection {
  return projectCommerceDecisions(null, now);
}
