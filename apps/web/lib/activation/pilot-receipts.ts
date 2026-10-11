/**
 * Canonical receipt adapter for the activation pilot (JOV-6468).
 *
 * Binds the pilot controller's decision-time prediction, sticky assignment,
 * exposure, matured outcome and evaluated writeback to the JOV-6466
 * `jovie.prediction-outcome/*` contracts. This is what lets one authorized
 * exposure + matured outcome enter the shared decision history instead of
 * living in pilot-only types — and what lets the management loop report
 * distinct engineering / customer / business states with source freshness
 * and observation maturity.
 *
 * The adapter validates every receipt through the canonical schemas, so
 * cross-boundary joins, missing exposures, immature promotions, expired
 * consent and self-certification fail closed rather than being written.
 */

import { createHash } from 'node:crypto';
import {
  bindMeasuredOutcome,
  type DecisionPredictionReceipt,
  DecisionPredictionReceiptSchema,
  type MeasuredOutcomeReceipt,
  MeasuredOutcomeReceiptSchema,
} from '@jovie/agent-transport-contracts';
import { stableSerialize } from '@/lib/stable-serialize';
import {
  type ActivationExperimentSpec,
  type ActivationPrediction,
  type AssignmentRecord,
  type DecisionWriteback,
  type ExposureRecord,
  type OutcomeRecord,
  type PilotDecision,
  PREDICTION_MODEL_ID,
  specDigest,
} from './pilot-controller';

export const PILOT_RECEIPT_OWNER = 'activation-owner' as const;
const MS_PER_HOUR = 3_600_000;

export interface PilotReceiptLinks {
  /** 40-hex git commit; when set it must also be the code revision. */
  readonly commitRef?: string | null;
  readonly deploymentRef?: string | null;
  readonly certificationRef?: string | null;
  readonly productBetContractRef?: string | null;
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableSerialize(value)).digest('hex');
}

function isoPlus(iso: string, ms: number): string {
  return new Date(Date.parse(iso) + ms).toISOString();
}

/**
 * Decision-time prediction receipt. `consent` is required: the pilot only
 * admits `consent:first-party-analytics` units, and the canonical schema
 * rejects a `valid` consent without a ref valid past the decision time.
 */
export function buildPilotPredictionReceipt(input: {
  readonly spec: ActivationExperimentSpec;
  readonly prediction: ActivationPrediction;
  readonly assignment: AssignmentRecord;
  readonly tenantId: string;
  readonly predictedAtIso: string;
  readonly snapshotCapturedAtIso: string;
  readonly baseline: number | null;
  readonly consent: { readonly ref: string; readonly validUntilIso: string };
  readonly links?: PilotReceiptLinks;
}): DecisionPredictionReceipt {
  const { spec, prediction, assignment } = input;
  return DecisionPredictionReceiptSchema.parse({
    schema: 'jovie.prediction-outcome/prediction/v1',
    predictionId: `pred-${spec.experimentId}-${assignment.unitId}-g${assignment.generation}`,
    identity: {
      decisionId: `dec-${spec.experimentId}-${assignment.unitId}-g${assignment.generation}`,
      taskRunId: null,
      experimentId: spec.experimentId,
      variantId: assignment.arm,
      tenantId: input.tenantId,
      scopeId: spec.cohort.id,
      entityId: assignment.unitId,
    },
    links: {
      issueRef: 'linear:JOV-6468',
      commitRef: input.links?.commitRef ?? null,
      deploymentRef: input.links?.deploymentRef ?? null,
      certificationRef: input.links?.certificationRef ?? null,
    },
    decisionAt: assignment.assignedAtIso,
    predictedAt: input.predictedAtIso,
    temporalClass: 'prospective',
    input: {
      snapshotRef: `activation-pilot/features/${assignment.unitId}`,
      snapshotDigest: sha256({
        modelId: prediction.modelId,
        inputsUsed: prediction.inputsUsed,
      }),
      capturedAt: input.snapshotCapturedAtIso,
      freshness: 'fresh',
      provenanceRefs: [`activation-cohort/${spec.cohort.id}`],
    },
    target: {
      stage: 'customer',
      name: spec.primaryOutcome.event,
      units: 'binary',
      horizonEndsAt: isoPlus(
        assignment.assignedAtIso,
        prediction.horizonHours * MS_PER_HOUR
      ),
      baseline: input.baseline,
    },
    action: {
      eligibleActionsRef: `activation-pilot/spec:${specDigest(spec)}`,
      selectedAction: assignment.arm,
      selectionMethod: 'randomized',
      selectionProbability: assignment.selectionProbability,
    },
    prediction: {
      expected: prediction.activationProbability,
      lower: null,
      upper: null,
      confidence: 'low',
    },
    versions: {
      model: null,
      provider: null,
      prompt: PREDICTION_MODEL_ID,
      policy: spec.policyVersion,
      codeRevision: input.links?.commitRef ?? null,
      executionTupleRef: null,
    },
    disclosure: {
      providerData: 'withheld',
      consent: 'valid',
      consentRef: input.consent.ref,
      consentValidUntil: input.consent.validUntilIso,
    },
    management: {
      productBetContractRef: input.links?.productBetContractRef ?? null,
    },
  });
}

const DISPOSITION: Record<
  PilotDecision,
  'retain' | 'promote' | 'hold' | 'reject' | 'rollback'
> = {
  promote: 'promote',
  retain: 'retain',
  hold: 'hold',
  inconclusive: 'hold',
  reject: 'reject',
  rollback: 'rollback',
};

function stage(
  status: 'pending' | 'succeeded' | 'failed' | 'inconclusive',
  value: number | null,
  observedAt: string | null
) {
  return { status, value, observedAt };
}

/**
 * Outcome receipt for one assigned unit. Maturity is derived from the
 * prediction horizon: a receipt observed before `horizonEndsAt` is
 * `immature` — the canonical schema then forbids promote/retain and forces
 * all stage values to null, so immature downstream outcomes stay pending
 * instead of being reported as uplift. `business` stays pending until a
 * paid/retained outcome is observed and attributable.
 */
export function buildPilotOutcomeReceipt(input: {
  readonly spec: ActivationExperimentSpec;
  readonly prediction: DecisionPredictionReceipt;
  readonly exposure: ExposureRecord | null;
  readonly outcome: OutcomeRecord | null;
  readonly writeback: DecisionWriteback;
  readonly observedAtIso: string;
  readonly recordedAtIso: string;
  readonly revision?: number;
  readonly supersedesRevision?: number | null;
  readonly certification?: {
    readonly ref: string;
    readonly certifierId: string;
    readonly actorId: string;
  } | null;
}): MeasuredOutcomeReceipt {
  const { spec, prediction, exposure, outcome, writeback } = input;
  const horizonEndsAt = Date.parse(prediction.target.horizonEndsAt);
  const mature =
    exposure != null && Date.parse(input.observedAtIso) >= horizonEndsAt;
  const maturity = !exposure ? 'missing' : mature ? 'mature' : 'immature';
  const exposureRef = exposure
    ? `activation-exposure/${spec.experimentId}/${exposure.unitId}`
    : null;
  return MeasuredOutcomeReceiptSchema.parse({
    schema: 'jovie.prediction-outcome/outcome/v1',
    outcomeId: `out-${spec.experimentId}-${prediction.identity.entityId}`,
    predictionId: prediction.predictionId,
    revision: input.revision ?? 1,
    supersedesRevision: input.supersedesRevision ?? null,
    identity: {
      tenantId: prediction.identity.tenantId,
      scopeId: prediction.identity.scopeId,
      entityId: prediction.identity.entityId,
    },
    exposureRef,
    attemptRefs: outcome
      ? [`activation-outcome/${outcome.unitId}#${outcome.event}`]
      : [],
    retries: 0,
    reworkCount: 0,
    observedAt: input.observedAtIso,
    recordedAt: input.recordedAtIso,
    maturity,
    stages: {
      engineering: exposure
        ? stage('succeeded', mature ? 1 : null, exposure.exposedAtIso)
        : stage('failed', null, input.observedAtIso),
      customer:
        mature && outcome
          ? stage('succeeded', 1, outcome.occurredAtIso)
          : mature
            ? stage('failed', 0, input.observedAtIso)
            : stage('pending', null, null),
      business: stage('pending', null, null),
    },
    fullyLoadedCost: { usd: null, attributionRef: null },
    guardrailRefs: writeback.evidence.guardrails.map(
      g => `guardrail:${g.id}:${g.breached ? 'breached' : 'ok'}`
    ),
    runtimeVerificationRef: exposureRef,
    humanCorrectionRefs: [],
    certification: input.certification ?? null,
    disposition: {
      kind: DISPOSITION[writeback.decision],
      ref: `activation-pilot/writeback/${writeback.decision}@${writeback.decidedAtIso}`,
    },
  });
}

/**
 * Bind a pilot prediction to its measured outcome through the canonical
 * join. Returns the bound receipts plus the management-facing stage view
 * (distinct engineering/customer/business states, owner, freshness,
 * observation maturity). Cross-boundary, missing-exposure, future-label
 * and immature-horizon violations fail closed with a reason.
 */
export function bindPilotMeasuredOutcome(
  prediction: unknown,
  outcome: unknown
):
  | {
      readonly ok: true;
      readonly prediction: DecisionPredictionReceipt;
      readonly outcome: MeasuredOutcomeReceipt;
      readonly loop: {
        readonly owner: typeof PILOT_RECEIPT_OWNER;
        readonly sourceFreshness: 'fresh' | 'stale' | 'unknown';
        readonly observationMaturity: MeasuredOutcomeReceipt['maturity'];
        readonly stages: MeasuredOutcomeReceipt['stages'];
      };
    }
  | { readonly ok: false; readonly reason: string } {
  try {
    const bound = bindMeasuredOutcome(prediction, outcome);
    return {
      ok: true,
      ...bound,
      loop: {
        owner: PILOT_RECEIPT_OWNER,
        sourceFreshness: bound.prediction.input.freshness,
        observationMaturity: bound.outcome.maturity,
        stages: bound.outcome.stages,
      },
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
