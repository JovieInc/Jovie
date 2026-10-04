import { z } from 'zod';

export const PRODUCT_BET_CONTRACT_SCHEMA =
  'jovie.summer.product-bet-contract/v1' as const;
export const PRODUCT_BET_EVENT_SCHEMA =
  'jovie.summer.product-bet-event/v1' as const;
export const PRODUCT_BET_PROJECTION_SCHEMA =
  'jovie.summer.product-bet-projection/v1' as const;

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u);
const timestamp = z.string().datetime({ offset: true });
const ref = z.string().min(1).max(2048);

const evidence = z
  .object({
    id,
    sourceRef: ref,
    supports: z.boolean(),
    summary: z.string().trim().min(1).max(500),
  })
  .strict();

const viability = z.enum(['positive', 'negative', 'unknown']);

/**
 * Bounded falsifiable product/allocation decision contract (JOV-6473).
 * Extends JOV-5949 PortfolioPosition/PortfolioDecisionReceipt and
 * JOV-5944 DecisionJob management semantics. JOV-6466 owns the shared
 * prediction/exposure/outcome bindings and schema tables; this module only
 * projects admission and lifecycle state.
 */
export const productBetContractSchema = z
  .object({
    schema: z.literal(PRODUCT_BET_CONTRACT_SCHEMA),
    betId: id,
    /** Effective strategy reference (JOV-6471) and customer/job/problem (JOV-6472). */
    strategyRef: ref,
    customerJobRef: ref,
    hypothesis: z.string().trim().min(1).max(1000),
    baseline: z.string().trim().min(1).max(1000),
    desiredOutcome: z.string().trim().min(1).max(1000),
    evidence: z.array(evidence).max(64),
    alternatives: z
      .array(
        z
          .object({
            id,
            summary: z.string().trim().min(1).max(500),
            expectedValue: z.number().nullable(),
            sourceRef: ref,
          })
          .strict()
      )
      .max(16),
    uncertainty: z.string().trim().min(1).max(1000),
    /** Pre-action prediction; timestamp must precede the admitted decision. */
    prediction: z.object({
      predictedAt: timestamp,
      metric: z.string().trim().min(1).max(200),
      expectedValue: z.number().nullable(),
      sourceRef: ref,
    }),
    cheapestTest: z.string().trim().min(1).max(500),
    owner: id,
    cohort: z
      .object({
        id,
        scope: z.string().trim().min(1).max(500),
        revision: z.string().min(1).max(128),
        minUsefulSize: z.number().int().positive(),
      })
      .strict(),
    /** ISO-8601 time at or after which outcomes are mature enough to judge. */
    observationHorizon: timestamp,
    authority: z.enum(['founder', 'admin', 'automation']),
    limits: z
      .object({
        exposureUnits: z.number().nonnegative().nullable(),
        effortMinutes: z.number().nonnegative().nullable(),
        spendCents: z.number().nonnegative().nullable(),
        founderMinutes: z.number().nonnegative().nullable(),
      })
      .strict(),
    guardrails: z.array(z.string().trim().min(1).max(500)).min(1).max(32),
    reversible: z.boolean(),
    stopRule: z.string().trim().min(1).max(500),
    continueRule: z.string().trim().min(1).max(500),
    scaleRule: z.string().trim().min(1).max(500),
    assessment: z
      .object({
        customerValue: viability,
        usability: viability,
        feasibility: viability,
        businessViability: viability,
      })
      .strict(),
    /** Material inputs that remain unknown; never silently filled. */
    unknowns: z.array(z.string().trim().min(1).max(300)).max(32),
    /** True only for historical imports; they cannot drive admission authority. */
    retrospective: z.boolean(),
    decidedAt: timestamp,
    decidedBy: id,
    /** Approvals go stale; decisions past this instant need re-authorization. */
    approvalValidUntil: timestamp,
  })
  .strict();

export type ProductBetContract = z.infer<typeof productBetContractSchema>;

const eventBase = {
  schema: z.literal(PRODUCT_BET_EVENT_SCHEMA),
  eventId: id,
  betId: id,
  occurredAt: timestamp,
};

export const productBetEventSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...eventBase,
      kind: z.literal('delivered'),
      /** Exact-runtime proof ref; code-complete alone is not customer outcome. */
      runtimeProofRef: ref,
    })
    .strict(),
  z
    .object({
      ...eventBase,
      kind: z.literal('customer-outcome'),
      cohortMemberId: id,
      usefulResult: z.boolean(),
      resultRef: ref,
    })
    .strict(),
  z
    .object({
      ...eventBase,
      kind: z.literal('business-outcome'),
      metric: z.string().trim().min(1).max(200),
      observedValue: z.number(),
      evidenceRef: ref,
      /** Outcomes may arrive late (delayed payment/retention). */
      attributionWindowClosed: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...eventBase,
      kind: z.literal('cohort-measurement'),
      /**
       * Aggregate arm-level measurement from an experiment writeback
       * (JOV-6468): real sources report counts, not member identities.
       * usefulResults must not exceed assigned.
       */
      arm: z.string().trim().min(1).max(64),
      assigned: z.number().int().nonnegative(),
      usefulResults: z.number().int().nonnegative(),
      sourceRef: ref,
    })
    .strict()
    .refine(m => m.usefulResults <= m.assigned, {
      message: 'useful-results-cannot-exceed-assigned',
    }),
  z
    .object({
      ...eventBase,
      kind: z.literal('telemetry-failure'),
      instrumentationRef: ref,
    })
    .strict(),
  z
    .object({
      ...eventBase,
      kind: z.literal('guardrail-trip'),
      guardrail: z.string().trim().min(1).max(500),
      detailRef: ref,
    })
    .strict(),
  z
    .object({
      ...eventBase,
      kind: z.literal('observation-restarted'),
      newHorizon: timestamp,
      reasonRef: ref,
    })
    .strict(),
]);

export type ProductBetEvent = z.infer<typeof productBetEventSchema>;

export type BetEvaluation =
  | 'pending'
  | 'awaiting-maturity'
  | 'supported'
  | 'contradicted'
  | 'inconclusive'
  | 'unmeasurable-instrumentation-failed';

export type BetRoute =
  | 'none'
  | 'repair'
  | 'customer-problem-offer-review'
  | 'evidence-collection'
  | 'continue'
  | 'scale'
  | 'stop'
  | 'hold-incumbent';

export type BetProjection = {
  readonly schema: typeof PRODUCT_BET_PROJECTION_SCHEMA;
  readonly betId: string;
  readonly delivered: {
    readonly at: string;
    readonly runtimeProofRef: string;
  } | null;
  readonly customerOutcomeReached: boolean;
  readonly usefulResultCount: number;
  readonly observedCohortSize: number;
  readonly businessOutcomeObserved: boolean;
  readonly evaluation: BetEvaluation;
  readonly route: BetRoute;
  /** Stop rules never authorize destructive or policy-exceeding actions. */
  readonly destructiveActionAuthorized: false;
  readonly reconsiderationTrigger: string | null;
  readonly guardrailTripped: boolean;
  readonly staleApproval: boolean;
  readonly lastEventAt: string | null;
};

export type AdmissionResult =
  | { readonly admitted: true; readonly contract: ProductBetContract }
  | {
      readonly admitted: false;
      readonly reasons: readonly string[];
    };

export type Capacity = {
  readonly activeBets: number;
  readonly wipLimit: number;
  readonly remainingSpendCents: number | null;
  readonly remainingFounderMinutes: number | null;
};

/**
 * Admit a candidate bet. The model cannot manufacture an approval, a
 * prediction timestamp, or an expected ROI: prediction must be recorded
 * strictly before `decidedAt`, approval must still be valid, and every
 * expected value must carry a source reference. Retrospective imports are
 * labeled and never gain admission authority they did not have.
 */
export function admitProductBet(
  input: unknown,
  capacity: Capacity
): AdmissionResult {
  const parsed = productBetContractSchema.safeParse(input);
  if (!parsed.success) {
    return {
      admitted: false,
      reasons: parsed.error.issues.map(
        issue => `${issue.path.join('.')}: ${issue.message}`
      ),
    };
  }
  const contract = parsed.data;
  const reasons: string[] = [];
  if (
    Date.parse(contract.prediction.predictedAt) >=
    Date.parse(contract.decidedAt)
  ) {
    reasons.push('prediction-must-precede-decision');
  }
  if (
    Date.parse(contract.approvalValidUntil) <= Date.parse(contract.decidedAt)
  ) {
    reasons.push('stale-approval');
  }
  for (const alternative of contract.alternatives) {
    if (alternative.expectedValue !== null && !alternative.sourceRef) {
      reasons.push(`alternative-${alternative.id}-missing-source`);
    }
  }
  if (
    !contract.retrospective &&
    contract.authority === 'automation' &&
    !contract.reversible
  ) {
    reasons.push('irreversible-requires-human-authority');
  }
  if (capacity.activeBets >= capacity.wipLimit) {
    reasons.push('wip-limit-exceeded');
  }
  if (
    contract.limits.spendCents !== null &&
    capacity.remainingSpendCents !== null &&
    contract.limits.spendCents > capacity.remainingSpendCents
  ) {
    reasons.push('spend-budget-exceeded');
  }
  if (
    contract.limits.founderMinutes !== null &&
    capacity.remainingFounderMinutes !== null &&
    contract.limits.founderMinutes > capacity.remainingFounderMinutes
  ) {
    reasons.push('founder-time-budget-exceeded');
  }
  return reasons.length
    ? { admitted: false, reasons }
    : { admitted: true, contract };
}

/**
 * Project the lifecycle from a contract plus already-recorded events.
 * Duplicate and out-of-order events are idempotent: events are deduplicated
 * by eventId and ordered by occurredAt. There is no recurring reranking
 * cron; projection runs at the declared horizon or a material event.
 */
export function projectProductBet(
  contract: ProductBetContract,
  events: readonly ProductBetEvent[]
): BetProjection {
  const seen = new Set<string>();
  const ordered = events
    .filter(event => event.betId === contract.betId)
    .filter(event =>
      seen.has(event.eventId) ? false : seen.add(event.eventId)
    )
    .slice()
    .sort(
      (a, b) =>
        Date.parse(a.occurredAt) - Date.parse(b.occurredAt) ||
        a.eventId.localeCompare(b.eventId)
    );

  let delivered: BetProjection['delivered'] = null;
  const usefulMembers = new Set<string>();
  const observedMembers = new Set<string>();
  let measuredAssigned = 0;
  let measuredUseful = 0;
  let businessOutcomeObserved = false;
  let businessMetric: string | null = null;
  let businessValue: number | null = null;
  let attributionOpen = false;
  let telemetryFailed = false;
  let guardrailTripped = false;
  let horizon = Date.parse(contract.observationHorizon);
  let lastEventAt: string | null = null;

  for (const event of ordered) {
    lastEventAt = event.occurredAt;
    switch (event.kind) {
      case 'delivered':
        delivered ??= {
          at: event.occurredAt,
          runtimeProofRef: event.runtimeProofRef,
        };
        break;
      case 'customer-outcome':
        observedMembers.add(event.cohortMemberId);
        if (event.usefulResult) usefulMembers.add(event.cohortMemberId);
        break;
      case 'cohort-measurement':
        measuredAssigned += event.assigned;
        measuredUseful += event.usefulResults;
        break;
      case 'business-outcome':
        businessOutcomeObserved = true;
        if (event.metric === contract.prediction.metric) {
          businessMetric = event.metric;
          businessValue = event.observedValue;
        }
        if (!event.attributionWindowClosed) attributionOpen = true;
        break;
      case 'telemetry-failure':
        telemetryFailed = true;
        break;
      case 'guardrail-trip':
        guardrailTripped = true;
        break;
      case 'observation-restarted':
        horizon = Date.parse(event.newHorizon);
        businessOutcomeObserved = false;
        businessMetric = null;
        businessValue = null;
        attributionOpen = false;
        telemetryFailed = false;
        observedMembers.clear();
        usefulMembers.clear();
        measuredAssigned = 0;
        measuredUseful = 0;
        break;
    }
  }

  const now = lastEventAt
    ? Date.parse(lastEventAt)
    : Date.parse(contract.decidedAt);
  const staleApproval = now > Date.parse(contract.approvalValidUntil);
  const horizonReached = now >= horizon;
  const observedTotal = observedMembers.size + measuredAssigned;
  const usefulTotal = usefulMembers.size + measuredUseful;
  const cohortTooSmall = observedTotal < contract.cohort.minUsefulSize;

  const hasObservation = observedTotal > 0 || businessOutcomeObserved;

  let evaluation: BetEvaluation;
  if (delivered && !hasObservation && !telemetryFailed && !guardrailTripped) {
    // Code-complete is not a customer outcome: stays pending until the
    // horizon, where nonresponse becomes inconclusive rather than failure.
    evaluation = horizonReached ? 'inconclusive' : 'pending';
  } else if (guardrailTripped) {
    evaluation = 'contradicted';
  } else if (telemetryFailed && horizonReached) {
    evaluation = 'unmeasurable-instrumentation-failed';
  } else if (!horizonReached) {
    evaluation = 'awaiting-maturity';
  } else if (cohortTooSmall && !businessOutcomeObserved) {
    evaluation = 'inconclusive';
  } else if (attributionOpen) {
    evaluation = 'awaiting-maturity';
  } else if (businessOutcomeObserved && observedTotal > 0) {
    // When the observed metric is the declared prediction metric, judge
    // against the pre-action expected value; otherwise fall back to the
    // cohort useful-result majority.
    evaluation =
      businessMetric === contract.prediction.metric &&
      contract.prediction.expectedValue !== null &&
      businessValue !== null
        ? businessValue >= contract.prediction.expectedValue
          ? 'supported'
          : 'contradicted'
        : usefulTotal * 2 >= observedTotal
          ? 'supported'
          : 'contradicted';
  } else if (businessOutcomeObserved) {
    // Lucky outcome with poor evidence: cannot attribute causally.
    evaluation = 'inconclusive';
  } else {
    evaluation = 'inconclusive';
  }
  if (!delivered) evaluation = 'pending';

  let route: BetRoute = 'none';
  if (delivered && guardrailTripped) route = 'repair';
  else if (
    delivered &&
    observedTotal > 0 &&
    usefulTotal === 0 &&
    !cohortTooSmall
  )
    route = 'customer-problem-offer-review';
  else if (evaluation === 'unmeasurable-instrumentation-failed')
    route = 'repair';
  else if (evaluation === 'inconclusive' && businessOutcomeObserved)
    route = 'evidence-collection';
  else if (evaluation === 'inconclusive') route = 'hold-incumbent';
  else if (evaluation === 'awaiting-maturity') route = 'evidence-collection';
  else if (evaluation === 'supported') route = 'continue';

  return {
    schema: PRODUCT_BET_PROJECTION_SCHEMA,
    betId: contract.betId,
    delivered,
    customerOutcomeReached: observedTotal > 0,
    usefulResultCount: usefulTotal,
    observedCohortSize: observedTotal,
    businessOutcomeObserved,
    evaluation,
    route,
    destructiveActionAuthorized: false,
    reconsiderationTrigger:
      evaluation === 'awaiting-maturity'
        ? `horizon:${new Date(horizon).toISOString()}`
        : evaluation === 'inconclusive'
          ? 'evidence-arrival'
          : null,
    guardrailTripped,
    staleApproval,
    lastEventAt,
  };
}
