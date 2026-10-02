/**
 * Bounded activation pilot controller (JOV-6468).
 *
 * Commissions ONE activation experiment under tracking key
 * `SELF-IMPROVEMENT-2026-09-19/activation-pilot`: prediction → approved
 * variant → exposure → useful first-value outcome → evaluated decision →
 * next selection. It extends the JOV-1879 acquisition-learning policy and
 * JOV-5243 outcome measurement on top of the JOV-6466
 * decision/exposure/outcome joins — it is not a separate optimizer.
 *
 * Everything here is pure and deterministic so assignments survive
 * rerender/restart and evaluation is replayable. Live customer exposure is
 * NOT authorized by this module: it only defines the frozen spec, the
 * assignment/evaluation/writeback machinery, and the fixtures that prove
 * positive, regressive, inconclusive, missing-telemetry and delayed-outcome
 * decisions. Real promotion still requires a sufficient authorized cohort
 * plus the certified controls that already govern exposure.
 */

import { stableSerialize } from '@/lib/stable-serialize';

export const ACTIVATION_PILOT_TRACKING_KEY =
  'SELF-IMPROVEMENT-2026-09-19/activation-pilot' as const;
export const ACTIVATION_PILOT_POLICY_VERSION = 'activation-pilot/v1' as const;
export const ACTIVATION_PILOT_EXPERIMENT_ID =
  'activation-first-value-pilot' as const;
export const ACTIVATION_PILOT_CONTRACT =
  'jovie.activation-experiment/v1' as const;
export const ACTIVATION_WRITEBACK_CONTRACT =
  'jovie.activation-decision-writeback/v1' as const;

export type PilotArm = 'incumbent' | 'challenger' | 'holdout';

export interface ActivationVariant {
  readonly id: PilotArm;
  readonly description: string;
}

export interface ActivationGuardrail {
  readonly id: string;
  readonly metric: string;
  readonly direction: 'max' | 'min';
  readonly threshold: number;
}

/**
 * Frozen before exposure. Editing any LOCKED_SPEC_FIELD after freeze is an
 * unauthorized locked-field edit — see `lockedFieldViolations`.
 */
export interface ActivationExperimentSpec {
  readonly contract: typeof ACTIVATION_PILOT_CONTRACT;
  readonly experimentId: string;
  readonly trackingKey: typeof ACTIVATION_PILOT_TRACKING_KEY;
  readonly policyVersion: string;
  readonly surface: { readonly id: string; readonly version: string };
  /** The observed first-value bottleneck this pilot attacks. */
  readonly bottleneck: string;
  /** One declared, already-supported cohort — never a global assumption. */
  readonly cohort: {
    readonly id: string;
    readonly description: string;
    readonly fixtureRef: string;
  };
  readonly assignmentUnit: 'user' | 'account';
  readonly eligibility: readonly string[];
  readonly primaryOutcome: {
    readonly event: string;
    readonly horizonHours: number;
    /** Minimum meaningful absolute effect on the primary rate. */
    readonly minMeaningfulEffect: number;
  };
  /**
   * Paid conversion / retained value are measured separately and stay
   * pending until observed and attributable — never reported as uplift.
   */
  readonly downstreamOutcomes: readonly string[];
  readonly variants: readonly ActivationVariant[];
  readonly allocation: Record<PilotArm, number>;
  readonly observationWindowDays: number;
  readonly minSamplePerArm: number;
  readonly guardrails: readonly ActivationGuardrail[];
  readonly rollback: {
    readonly restores: PilotArm;
    readonly via: string;
    readonly preserves: readonly string[];
  };
  readonly approvals: readonly string[];
  readonly frozenAtIso: string;
}

/**
 * The single commissioned pilot. Surface: the existing premade-profile
 * claim → first-value ("activated") path. Incumbent = current claim flow;
 * challenger = one approved, reversible help/timing variant on that flow.
 */
export const ACTIVATION_PILOT_SPEC: ActivationExperimentSpec = {
  contract: ACTIVATION_PILOT_CONTRACT,
  experimentId: ACTIVATION_PILOT_EXPERIMENT_ID,
  trackingKey: ACTIVATION_PILOT_TRACKING_KEY,
  policyVersion: ACTIVATION_PILOT_POLICY_VERSION,
  surface: { id: 'premade-profile-claim', version: 'claim-flow/v2026-09' },
  bottleneck:
    'Claimed premade profiles that never reach first value (activation) within 72h.',
  cohort: {
    id: 'premade-artist-profile/v1',
    description:
      'Claimed premade-profile cohort from the existing acquisition kernel; declared fixture cohort, not a global product assumption.',
    fixtureRef: 'lib/activation/pilot-fixtures.ts',
  },
  assignmentUnit: 'user',
  eligibility: [
    'state:claimed',
    'consent:first-party-analytics',
    'not:staff-or-fixture-seed',
  ],
  primaryOutcome: {
    event: 'activated',
    horizonHours: 72,
    minMeaningfulEffect: 0.05,
  },
  downstreamOutcomes: ['paid_converted', 'retained_30d'],
  variants: [
    { id: 'incumbent', description: 'Current claim → activate flow.' },
    {
      id: 'challenger',
      description:
        'Approved reversible variant: delayed contextual help nudge on the claim flow.',
    },
    {
      id: 'holdout',
      description: 'Stable control arm; never receives the challenger.',
    },
  ],
  allocation: { incumbent: 0.45, challenger: 0.45, holdout: 0.1 },
  observationWindowDays: 14,
  minSamplePerArm: 50,
  guardrails: [
    {
      id: 'error_rate',
      metric: 'flow_error_rate',
      direction: 'max',
      threshold: 0.02,
    },
    {
      id: 'latency',
      metric: 'surface_p95_latency_ms',
      direction: 'max',
      threshold: 800,
    },
    {
      id: 'complaint',
      metric: 'complaint_or_optout_rate',
      direction: 'max',
      threshold: 0.001,
    },
    {
      id: 'entitlement',
      metric: 'entitlement_integrity',
      direction: 'min',
      threshold: 1,
    },
  ],
  rollback: {
    restores: 'incumbent',
    via: 'server-side variant weight → incumbent',
    preserves: ['assignments', 'exposures', 'outcomes', 'writebacks'],
  },
  approvals: ['activation-owner', 'certified-controls'],
  frozenAtIso: '2026-09-19T00:00:00.000Z',
};

export const LOCKED_SPEC_FIELDS = [
  'assignmentUnit',
  'eligibility',
  'primaryOutcome',
  'allocation',
  'observationWindowDays',
  'minSamplePerArm',
  'guardrails',
  'surface',
] as const;

/** FNV-1a digest — same approach as the acquisition kernel (no node:crypto). */
function fnv1a(value: unknown): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(stableSerialize(value))) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}

export function specDigest(spec: ActivationExperimentSpec): string {
  return fnv1a(spec);
}

/**
 * Locked-field audit. Returns the names of frozen fields that differ
 * between the approved spec and the candidate — an empty list means no
 * unauthorized locked-field edit.
 */
export function lockedFieldViolations(
  approved: ActivationExperimentSpec,
  candidate: ActivationExperimentSpec
): string[] {
  return LOCKED_SPEC_FIELDS.filter(
    field =>
      stableSerialize(approved[field]) !== stableSerialize(candidate[field])
  );
}

// ---------------------------------------------------------------------------
// Decision-time activation-risk prediction (transparent baseline)
// ---------------------------------------------------------------------------

export const PREDICTION_MODEL_ID = 'activation-risk-baseline/v1' as const;

/** Lawful first-party, consented inputs only. */
export const ELIGIBLE_PREDICTION_INPUTS = [
  'cohortBaselineRate',
  'stepsCompleted',
  'stepsTotal',
  'hasConnectedSource',
  'priorSessions',
] as const;

/** Prohibited: sensitive inference and cross-platform identity stitching. */
export const PROHIBITED_PREDICTION_INPUTS = [
  'sensitive-attribute-inference',
  'cross-platform-identity',
  'third-party-behavioral-profile',
] as const;

export interface ActivationPrediction {
  readonly modelId: typeof PREDICTION_MODEL_ID;
  readonly unitId: string;
  /** Predicted probability of first value within the declared horizon. */
  readonly activationProbability: number;
  readonly horizonHours: number;
  readonly inputsUsed: readonly string[];
}

export function predictActivationRisk(input: {
  readonly unitId: string;
  readonly features: Record<string, number>;
  readonly horizonHours: number;
}): ActivationPrediction | { readonly error: string } {
  const keys = Object.keys(input.features);
  const unlawful = keys.filter(
    key =>
      !(ELIGIBLE_PREDICTION_INPUTS as readonly string[]).includes(key) ||
      (PROHIBITED_PREDICTION_INPUTS as readonly string[]).includes(key)
  );
  if (unlawful.length > 0) {
    return { error: `unlawful-prediction-input:${unlawful.join(',')}` };
  }
  const f = input.features;
  const baseline = f.cohortBaselineRate ?? 0;
  const stepsTotal = f.stepsTotal ?? 0;
  const completion = stepsTotal > 0 ? (f.stepsCompleted ?? 0) / stepsTotal : 0;
  const connected = (f.hasConnectedSource ?? 0) > 0 ? 1 : 0;
  const sessions = Math.min(f.priorSessions ?? 0, 5) / 5;
  const probability = Math.min(
    0.99,
    Math.max(
      0.01,
      baseline + 0.3 * completion + 0.1 * connected + 0.05 * sessions
    )
  );
  return {
    modelId: PREDICTION_MODEL_ID,
    unitId: input.unitId,
    activationProbability: probability,
    horizonHours: input.horizonHours,
    inputsUsed: keys,
  };
}

// ---------------------------------------------------------------------------
// Sticky assignment + separate exposure
// ---------------------------------------------------------------------------

function unitHash(experimentId: string, generation: number, unitId: string) {
  const digest = fnv1a(`${experimentId}:${generation}:${unitId}`);
  return (
    Number(BigInt(`0x${digest.slice('fnv1a64:'.length)}`) % 1_000_000n) /
    1_000_000
  );
}

/**
 * Sticky randomized assignment: a pure function of
 * (experimentId, generation, unitId), so it cannot drift on rerender or
 * restart. Changing `generation` is the only way to re-randomize, and it is
 * persisted on the record.
 */
export function assignArm(
  spec: ActivationExperimentSpec,
  unitId: string,
  generation: number
): { readonly arm: PilotArm; readonly selectionProbability: number } {
  const roll = unitHash(spec.experimentId, generation, unitId);
  const { incumbent, challenger } = spec.allocation;
  const arm: PilotArm =
    roll < incumbent
      ? 'incumbent'
      : roll < incumbent + challenger
        ? 'challenger'
        : 'holdout';
  return { arm, selectionProbability: spec.allocation[arm] };
}

export interface AssignmentRecord {
  readonly experimentId: string;
  readonly unitId: string;
  readonly arm: PilotArm;
  readonly generation: number;
  readonly selectionProbability: number;
  readonly assignedAtIso: string;
}

export function buildAssignment(
  spec: ActivationExperimentSpec,
  unitId: string,
  generation: number,
  assignedAtIso: string
): AssignmentRecord {
  const { arm, selectionProbability } = assignArm(spec, unitId, generation);
  return {
    experimentId: spec.experimentId,
    unitId,
    arm,
    generation,
    selectionProbability,
    assignedAtIso,
  };
}

/** Logged separately from assignment — assignment ≠ exposure. */
export interface ExposureRecord {
  readonly experimentId: string;
  readonly unitId: string;
  readonly arm: PilotArm;
  readonly surfaceVersion: string;
  readonly exposedAtIso: string;
}

export interface OutcomeRecord {
  readonly unitId: string;
  readonly event: string;
  readonly occurredAtIso: string;
}

// ---------------------------------------------------------------------------
// Evaluation — intervention effect assessed independently from prediction
// ---------------------------------------------------------------------------

export type PilotDecision =
  | 'promote'
  | 'retain'
  | 'hold'
  | 'reject'
  | 'rollback'
  | 'inconclusive';

export interface ArmMeasurement {
  readonly assigned: number;
  readonly exposed: number;
  /** Deduped conversions counted under intention-to-treat. */
  readonly conversions: number;
  readonly ittRate: number;
  readonly exposedOnlyRate: number;
}

export interface GuardrailResult {
  readonly id: string;
  readonly breached: boolean;
  readonly observed: number | null;
}

export interface DecisionWriteback {
  readonly contract: typeof ACTIVATION_WRITEBACK_CONTRACT;
  readonly experimentId: string;
  readonly decision: PilotDecision;
  readonly reason: string;
  readonly policyVersion: string;
  readonly specDigest: string;
  readonly evidence: {
    readonly arms: Record<PilotArm, ArmMeasurement>;
    readonly ittEffect: number | null;
    readonly ittConfidence95: readonly [number, number] | null;
    readonly srmChi2: number | null;
    readonly guardrails: readonly GuardrailResult[];
  };
  readonly decidedAtIso: string;
}

export interface EvaluationInput {
  readonly spec: ActivationExperimentSpec;
  /** Digest captured at freeze; mismatch means unauthorized locked-field edit. */
  readonly approvedSpecDigest: string;
  readonly assignments: readonly AssignmentRecord[];
  readonly exposures: readonly ExposureRecord[];
  readonly outcomes: readonly OutcomeRecord[];
  /** Units whose consent was withdrawn — excluded from all measurement. */
  readonly consentWithdrawn?: readonly string[];
  readonly guardrailObservations?: Record<string, number>;
  readonly nowIso: string;
}

const MS_PER_DAY = 86_400_000;
/** Chi-square critical value, df=2, p<0.01 — sample-ratio mismatch gate. */
const SRM_CRITICAL = 9.21;

const PILOT_ARMS: readonly PilotArm[] = ['incumbent', 'challenger', 'holdout'];

function measure(
  spec: ActivationExperimentSpec,
  assignments: readonly AssignmentRecord[],
  exposures: readonly ExposureRecord[],
  outcomes: readonly OutcomeRecord[],
  withdrawn: ReadonlySet<string>
): { arms: Record<PilotArm, ArmMeasurement>; srmChi2: number | null } {
  const assignedUnits = new Map<string, PilotArm>();
  for (const a of assignments) {
    if (!withdrawn.has(a.unitId) && !assignedUnits.has(a.unitId)) {
      assignedUnits.set(a.unitId, a.arm);
    }
  }
  const exposedUnits = new Map<string, PilotArm>();
  for (const e of exposures) {
    const arm = assignedUnits.get(e.unitId);
    if (arm != null && e.arm === arm) exposedUnits.set(e.unitId, arm);
  }
  // Dedupe conversions per unit — a duplicate conversion event counts once.
  const convertedUnits = new Set<string>();
  for (const o of outcomes) {
    if (o.event !== spec.primaryOutcome.event) continue;
    if (assignedUnits.has(o.unitId)) convertedUnits.add(o.unitId);
  }

  const arms = {} as Record<PilotArm, ArmMeasurement>;
  for (const arm of PILOT_ARMS) {
    const assigned = [...assignedUnits.values()].filter(a => a === arm).length;
    const exposed = [...exposedUnits.values()].filter(a => a === arm).length;
    const conversions = [...convertedUnits].filter(
      u => assignedUnits.get(u) === arm
    ).length;
    const exposedConversions = [...convertedUnits].filter(
      u => exposedUnits.get(u) === arm
    ).length;
    arms[arm] = {
      assigned,
      exposed,
      conversions,
      ittRate: assigned > 0 ? conversions / assigned : 0,
      exposedOnlyRate: exposed > 0 ? exposedConversions / exposed : 0,
    };
  }

  let srmChi2: number | null = null;
  const total = PILOT_ARMS.reduce((n, arm) => n + arms[arm].assigned, 0);
  if (total > 0) {
    srmChi2 = PILOT_ARMS.reduce((chi2, arm) => {
      const expected = total * spec.allocation[arm];
      return expected > 0
        ? chi2 + (arms[arm].assigned - expected) ** 2 / expected
        : chi2;
    }, 0);
  }
  return { arms, srmChi2 };
}

function writeback(
  spec: ActivationExperimentSpec,
  decision: PilotDecision,
  reason: string,
  evidence: DecisionWriteback['evidence'],
  nowIso: string
): DecisionWriteback {
  return {
    contract: ACTIVATION_WRITEBACK_CONTRACT,
    experimentId: spec.experimentId,
    decision,
    reason,
    policyVersion: spec.policyVersion,
    specDigest: specDigest(spec),
    evidence,
    decidedAtIso: nowIso,
  };
}

/**
 * Prespecified fixed-horizon evaluation. No peeking: callers evaluate once
 * the observation window has matured; immature data yields HOLD/INCONCLUSIVE
 * with the incumbent retained. ITT is the decision basis; exposed-only is a
 * reported diagnostic only.
 */
export function evaluatePilot(input: EvaluationInput): DecisionWriteback {
  const { spec, nowIso } = input;
  const withdrawn = new Set(input.consentWithdrawn ?? []);
  const { arms, srmChi2 } = measure(
    spec,
    input.assignments,
    input.exposures,
    input.outcomes,
    withdrawn
  );

  const guardrails: GuardrailResult[] = spec.guardrails.map(g => {
    const observed = input.guardrailObservations?.[g.id] ?? null;
    const breached =
      observed == null
        ? false
        : g.direction === 'max'
          ? observed > g.threshold
          : observed < g.threshold;
    return { id: g.id, breached, observed };
  });
  const emptyEvidence: DecisionWriteback['evidence'] = {
    arms,
    ittEffect: null,
    ittConfidence95: null,
    srmChi2,
    guardrails,
  };

  if (specDigest(spec) !== input.approvedSpecDigest) {
    return writeback(
      spec,
      'hold',
      'spec-tampered: locked fields changed after freeze',
      emptyEvidence,
      nowIso
    );
  }
  if (input.exposures.length === 0) {
    return writeback(
      spec,
      'inconclusive',
      'missing-telemetry: no exposure logged',
      emptyEvidence,
      nowIso
    );
  }
  if (srmChi2 != null && srmChi2 > SRM_CRITICAL) {
    return writeback(
      spec,
      'inconclusive',
      'sample-ratio-mismatch: assignment does not match declared allocation',
      emptyEvidence,
      nowIso
    );
  }
  const breached = guardrails.filter(g => g.breached);
  if (breached.length > 0) {
    return writeback(
      spec,
      'rollback',
      `guardrail-breach:${breached.map(g => g.id).join(',')}`,
      emptyEvidence,
      nowIso
    );
  }

  const firstAssignment = input.assignments
    .map(a => Date.parse(a.assignedAtIso))
    .reduce((min, t) => Math.min(min, t), Number.POSITIVE_INFINITY);
  const windowEnds = firstAssignment + spec.observationWindowDays * MS_PER_DAY;
  if (!Number.isFinite(firstAssignment) || Date.parse(nowIso) < windowEnds) {
    return writeback(
      spec,
      'hold',
      'pending-maturity: observation window has not matured',
      emptyEvidence,
      nowIso
    );
  }

  const incumbent = arms.incumbent;
  const challenger = arms.challenger;
  if (
    incumbent.assigned < spec.minSamplePerArm ||
    challenger.assigned < spec.minSamplePerArm
  ) {
    return writeback(
      spec,
      'inconclusive',
      'low-sample: below minimum per-arm sample',
      emptyEvidence,
      nowIso
    );
  }

  const effect = challenger.ittRate - incumbent.ittRate;
  const pooled =
    incumbent.assigned + challenger.assigned > 0
      ? (incumbent.conversions + challenger.conversions) /
        (incumbent.assigned + challenger.assigned)
      : 0;
  const se = Math.sqrt(
    pooled * (1 - pooled) * (1 / incumbent.assigned + 1 / challenger.assigned)
  );
  const ci: readonly [number, number] = [
    effect - 1.96 * se,
    effect + 1.96 * se,
  ];
  const evidence: DecisionWriteback['evidence'] = {
    ...emptyEvidence,
    ittEffect: effect,
    ittConfidence95: ci,
  };

  if (ci[0] > 0 && effect >= spec.primaryOutcome.minMeaningfulEffect) {
    return writeback(
      spec,
      'promote',
      'positive: ITT effect meets the frozen minimum meaningful effect',
      evidence,
      nowIso
    );
  }
  if (ci[1] < 0) {
    return writeback(
      spec,
      'reject',
      'regressive: ITT confidence interval is entirely negative',
      evidence,
      nowIso
    );
  }
  if (Math.abs(effect) < spec.primaryOutcome.minMeaningfulEffect && se > 0) {
    return writeback(
      spec,
      'retain',
      'no-meaningful-effect: incumbent retained',
      evidence,
      nowIso
    );
  }
  return writeback(
    spec,
    'inconclusive',
    'underpowered: confidence interval crosses the meaningful effect bound',
    evidence,
    nowIso
  );
}

// ---------------------------------------------------------------------------
// Writeback consumption — the next eligible decision consumes it
// ---------------------------------------------------------------------------

export const WRITEBACK_MAX_AGE_DAYS = 30;

export interface ServingPolicy {
  readonly experimentId: string;
  readonly allocation: Record<PilotArm, number>;
  readonly sourceDecision: PilotDecision | 'initial';
  readonly writebackDigest: string | null;
}

/**
 * Resolve the serving allocation for the next eligible decision. Preserves
 * an approved exploration/control policy: promotion keeps the holdout,
 * retention keeps incumbent+holdout, rollback restores the incumbent alone.
 * A stale writeback is ignored (incumbent + holdout).
 */
export function nextServingPolicy(
  spec: ActivationExperimentSpec,
  wb: DecisionWriteback | null,
  nowIso: string
): ServingPolicy {
  const digest = wb ? fnv1a(wb) : null;
  if (!wb || wb.experimentId !== spec.experimentId) {
    return {
      experimentId: spec.experimentId,
      allocation: spec.allocation,
      sourceDecision: 'initial',
      writebackDigest: digest,
    };
  }
  const ageDays =
    (Date.parse(nowIso) - Date.parse(wb.decidedAtIso)) / MS_PER_DAY;
  if (ageDays > WRITEBACK_MAX_AGE_DAYS) {
    return {
      experimentId: spec.experimentId,
      allocation: { incumbent: 0.9, challenger: 0, holdout: 0.1 },
      sourceDecision: 'initial',
      writebackDigest: digest,
    };
  }
  switch (wb.decision) {
    case 'promote':
      return {
        experimentId: spec.experimentId,
        allocation: { incumbent: 0, challenger: 0.9, holdout: 0.1 },
        sourceDecision: 'promote',
        writebackDigest: digest,
      };
    case 'rollback':
      return {
        experimentId: spec.experimentId,
        allocation: { incumbent: 1, challenger: 0, holdout: 0 },
        sourceDecision: 'rollback',
        writebackDigest: digest,
      };
    case 'reject':
    case 'retain':
      return {
        experimentId: spec.experimentId,
        allocation: { incumbent: 0.9, challenger: 0, holdout: 0.1 },
        sourceDecision: wb.decision,
        writebackDigest: digest,
      };
    default:
      return {
        experimentId: spec.experimentId,
        allocation: spec.allocation,
        sourceDecision: wb.decision,
        writebackDigest: digest,
      };
  }
}

/**
 * Apply a rollback writeback: restores the incumbent via server-side
 * controls while preserving assignment/exposure/outcome/audit history. A
 * non-rollback writeback cannot trigger a restore — failed rollback leaves
 * the incumbent in place and reports the error.
 */
export function applyRollback(
  spec: ActivationExperimentSpec,
  wb: DecisionWriteback
):
  | {
      readonly ok: true;
      readonly restored: PilotArm;
      readonly preserves: readonly string[];
    }
  | { readonly ok: false; readonly reason: string } {
  if (wb.decision !== 'rollback') {
    return {
      ok: false,
      reason: `failed-rollback: decision ${wb.decision} does not authorize restore`,
    };
  }
  return {
    ok: true,
    restored: spec.rollback.restores,
    preserves: spec.rollback.preserves,
  };
}
