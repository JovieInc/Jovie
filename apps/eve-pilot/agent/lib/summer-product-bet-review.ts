import { z } from 'zod';
import {
  type BetProjection,
  type ProductBetContract,
  type ProductBetEvent,
  productBetEventSchema,
  projectProductBet,
} from './summer-product-bet-lifecycle';

export const ACTIVATION_WRITEBACK_SCHEMA =
  'jovie.activation-decision-writeback/v1' as const;
export const PRODUCT_BET_DECISION_SCHEMA =
  'jovie.summer.product-bet-decision/v1' as const;
export const PRODUCT_BET_DECISION_RECEIPT_SCHEMA =
  'jovie.summer.product-bet-decision-receipt/v1' as const;

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u);
const timestamp = z.string().datetime({ offset: true });

/**
 * Consumption side of JOV-6473: a real JOV-6468 activation-pilot writeback is
 * translated into lifecycle events, projected, and consumed by a subsequent
 * continue/scale/change/stop/gather-evidence decision. Fixture-sourced
 * writebacks can prove the machinery but can never claim live business
 * validation or authorize a scale decision.
 */

const armMeasurement = z
  .object({
    assigned: z.number().int().nonnegative(),
    exposed: z.number().int().nonnegative(),
    conversions: z.number().int().nonnegative(),
    ittRate: z.number(),
    exposedOnlyRate: z.number(),
  })
  .strict();

/** Mirror of the web-side DecisionWriteback (lib/activation/pilot-controller). */
export const activationPilotWritebackSchema = z
  .object({
    contract: z.literal(ACTIVATION_WRITEBACK_SCHEMA),
    experimentId: z.string().trim().min(1).max(200),
    decision: z.enum([
      'promote',
      'retain',
      'hold',
      'reject',
      'rollback',
      'inconclusive',
    ]),
    reason: z.string().trim().min(1).max(1000),
    policyVersion: z.string().trim().min(1).max(200),
    specDigest: z.string().trim().min(1).max(200),
    evidence: z
      .object({
        arms: z
          .object({
            incumbent: armMeasurement,
            challenger: armMeasurement,
            holdout: armMeasurement,
          })
          .strict(),
        ittEffect: z.number().nullable(),
        ittConfidence95: z.tuple([z.number(), z.number()]).nullable(),
        srmChi2: z.number().nullable(),
        guardrails: z
          .array(
            z
              .object({
                id: z.string().trim().min(1).max(200),
                breached: z.boolean(),
                observed: z.number().nullable(),
              })
              .strict()
          )
          .max(32),
      })
      .strict(),
    decidedAtIso: timestamp,
  })
  .strict();

export type ActivationPilotWriteback = z.infer<
  typeof activationPilotWritebackSchema
>;

/**
 * Translate one measured writeback into lifecycle events. `runtimeProofRef`
 * is required: a writeback implies delivered, but the projection still
 * records the exact-runtime proof separately from any customer outcome.
 * `telemetryRef` anchors missing-telemetry writebacks to the failed
 * instrumentation instead of fabricating an outcome.
 */
export function eventsFromActivationWriteback(
  writeback: ActivationPilotWriteback,
  options: {
    readonly betId: string;
    readonly runtimeProofRef: string;
    readonly telemetryRef?: string;
    /**
     * Metric name the writeback measures; when it equals the contract's
     * declared prediction metric the projection judges observed-vs-expected.
     */
    readonly businessMetric?: string;
  }
): ProductBetEvent[] {
  const occurredAt = writeback.decidedAtIso;
  const base = {
    schema: 'jovie.summer.product-bet-event/v1' as const,
    betId: options.betId,
  };
  const events: ProductBetEvent[] = [
    {
      ...base,
      eventId: `${options.betId}-delivered`,
      kind: 'delivered',
      runtimeProofRef: options.runtimeProofRef,
      occurredAt,
    },
  ];
  if (writeback.reason.startsWith('missing-telemetry')) {
    events.push({
      ...base,
      eventId: `${options.betId}-telemetry`,
      kind: 'telemetry-failure',
      instrumentationRef:
        options.telemetryRef ?? `experiment:${writeback.experimentId}`,
      occurredAt,
    });
    return events;
  }
  for (const arm of ['incumbent', 'challenger', 'holdout'] as const) {
    const m = writeback.evidence.arms[arm];
    if (m.assigned === 0) continue;
    events.push({
      ...base,
      eventId: `${options.betId}-measure-${arm}`,
      kind: 'cohort-measurement',
      arm,
      assigned: m.assigned,
      usefulResults: m.conversions,
      sourceRef: `writeback:${writeback.experimentId}@${writeback.specDigest}`,
      occurredAt,
    });
  }
  if (writeback.evidence.ittEffect !== null) {
    events.push({
      ...base,
      eventId: `${options.betId}-business`,
      kind: 'business-outcome',
      metric: options.businessMetric ?? 'primary-itt-effect',
      observedValue: writeback.evidence.ittEffect,
      evidenceRef: `writeback:${writeback.experimentId}@${writeback.specDigest}`,
      // 'hold'/'pending-maturity' writebacks keep attribution open; all
      // other decisions are emitted only once the window has matured.
      attributionWindowClosed: !writeback.reason.startsWith('pending-maturity'),
      occurredAt,
    });
  }
  for (const g of writeback.evidence.guardrails) {
    if (!g.breached) continue;
    events.push({
      ...base,
      eventId: `${options.betId}-guardrail-${g.id}`,
      kind: 'guardrail-trip',
      guardrail: g.id,
      detailRef: `writeback:${writeback.experimentId}@${writeback.specDigest}`,
      occurredAt,
    });
  }
  return events.map(e => productBetEventSchema.parse(e));
}

export const betDecisionSchema = z
  .object({
    schema: z.literal(PRODUCT_BET_DECISION_SCHEMA),
    betId: id,
    decision: z.enum([
      'continue',
      'scale',
      'change',
      'stop',
      'gather-evidence',
    ]),
    rationale: z.string().trim().min(1).max(1000),
    decidedAt: timestamp,
    decidedBy: id,
    /** Evidence class of the writeback the decision consumes. */
    evidenceClass: z.enum(['live', 'fixture']),
  })
  .strict();

export type BetDecision = z.infer<typeof betDecisionSchema>;

export type BetDecisionReceipt = {
  readonly schema: typeof PRODUCT_BET_DECISION_RECEIPT_SCHEMA;
  readonly betId: string;
  readonly decision: BetDecision['decision'];
  readonly consumedEvaluation: BetProjection['evaluation'];
  /** 'terminal' once the projection reached a measured judgement. */
  readonly outcomeState: 'terminal' | 'pending';
  readonly route: BetProjection['route'];
  /** Scale/expansion decisions are only valid on live measured evidence. */
  readonly liveBusinessValidation: boolean;
  readonly destructiveActionAuthorized: false;
  readonly staleApproval: boolean;
  readonly decidedAt: string;
};

const DECISION_ALLOWED: Record<
  BetProjection['evaluation'],
  readonly BetDecision['decision'][]
> = {
  pending: ['gather-evidence'],
  'awaiting-maturity': ['gather-evidence'],
  supported: ['continue', 'scale', 'gather-evidence'],
  contradicted: ['change', 'stop', 'gather-evidence'],
  inconclusive: ['continue', 'change', 'stop', 'gather-evidence'],
  'unmeasurable-instrumentation-failed': ['gather-evidence', 'stop'],
};

/**
 * Record a subsequent management decision that consumes the current
 * projection. The decision must be consistent with the evaluation (a scale
 * decision cannot ride an inconclusive or fixture result), must not run on a
 * stale approval, and never authorizes destructive or policy-exceeding
 * action — a 'stop' decision produces the stop *route* for the authorized
 * control path, not an uncontrolled shutdown.
 */
export function recordBetDecision(
  contract: ProductBetContract,
  events: readonly ProductBetEvent[],
  decision: BetDecision
):
  | { readonly accepted: true; readonly receipt: BetDecisionReceipt }
  | { readonly accepted: false; readonly reasons: readonly string[] } {
  const parsed = betDecisionSchema.safeParse(decision);
  if (!parsed.success) {
    return {
      accepted: false,
      reasons: parsed.error.issues.map(
        issue => `${issue.path.join('.')}: ${issue.message}`
      ),
    };
  }
  if (parsed.data.betId !== contract.betId) {
    return { accepted: false, reasons: ['decision-bet-mismatch'] };
  }
  const projection = projectProductBet(contract, events);
  const reasons: string[] = [];
  if (!DECISION_ALLOWED[projection.evaluation].includes(parsed.data.decision)) {
    reasons.push(`decision-inconsistent-with-${projection.evaluation}`);
  }
  if (
    parsed.data.decision === 'scale' &&
    parsed.data.evidenceClass !== 'live'
  ) {
    reasons.push('scale-requires-live-evidence');
  }
  if (projection.staleApproval) {
    reasons.push('stale-approval');
  }
  if (reasons.length) return { accepted: false, reasons };
  return {
    accepted: true,
    receipt: {
      schema: PRODUCT_BET_DECISION_RECEIPT_SCHEMA,
      betId: contract.betId,
      decision: parsed.data.decision,
      consumedEvaluation: projection.evaluation,
      outcomeState:
        projection.evaluation === 'supported' ||
        projection.evaluation === 'contradicted' ||
        projection.evaluation === 'inconclusive' ||
        projection.evaluation === 'unmeasurable-instrumentation-failed'
          ? 'terminal'
          : 'pending',
      route: projection.route,
      liveBusinessValidation:
        parsed.data.evidenceClass === 'live' &&
        (projection.evaluation === 'supported' ||
          projection.evaluation === 'contradicted'),
      destructiveActionAuthorized: false,
      staleApproval: projection.staleApproval,
      decidedAt: parsed.data.decidedAt,
    },
  };
}

export type BetDecisionCardView = {
  readonly kind: 'decision';
  readonly betId: string;
  readonly recommendation: string;
  readonly strongestEvidence: string | null;
  readonly bestAlternative: string | null;
  readonly prediction: {
    readonly metric: string;
    readonly expectedValue: number | null;
    readonly predictedAt: string;
  };
  readonly uncertainty: string;
  readonly requiredAuthority: ProductBetContract['authority'];
  readonly outcomeState:
    | 'delivered'
    | 'customer-outcome'
    | 'business-outcome'
    | 'pending';
  readonly evaluation: BetProjection['evaluation'];
  readonly nextReconsiderationTrigger: string | null;
};

/**
 * Shape the projection for the existing Ovie decision card: recommendation,
 * strongest evidence, best alternative, prediction, uncertainty/downside,
 * required authority, outcome state and next reconsideration trigger.
 */
export function betDecisionCardView(
  contract: ProductBetContract,
  projection: BetProjection
): BetDecisionCardView {
  const supporting = contract.evidence.find(e => e.supports);
  const outcomeState: BetDecisionCardView['outcomeState'] =
    projection.businessOutcomeObserved
      ? 'business-outcome'
      : projection.customerOutcomeReached
        ? 'customer-outcome'
        : projection.delivered
          ? 'delivered'
          : 'pending';
  return {
    kind: 'decision',
    betId: contract.betId,
    recommendation:
      projection.route === 'none' ? 'await-outcome' : projection.route,
    strongestEvidence: supporting?.summary ?? null,
    bestAlternative: contract.alternatives[0]?.summary ?? null,
    prediction: {
      metric: contract.prediction.metric,
      expectedValue: contract.prediction.expectedValue,
      predictedAt: contract.prediction.predictedAt,
    },
    uncertainty: contract.uncertainty,
    requiredAuthority: contract.authority,
    outcomeState,
    evaluation: projection.evaluation,
    nextReconsiderationTrigger: projection.reconsiderationTrigger,
  };
}
