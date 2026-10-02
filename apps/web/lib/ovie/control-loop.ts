/**
 * Company control loop reconciliation (JOV-7302).
 *
 * Binds the existing owners into one deterministic loop: company objective →
 * candidate constraints → exactly one binding constraint → autonomous work
 * exhausted before founder attention → self-contained Ovie decision packet →
 * decision→action→outcome receipt → automatic transition to the next
 * evidence-backed constraint.
 *
 * This module is the reconciliation/ranking core only. It reuses the
 * JOV-5924 decision-value score (`scoreDecisionSignal`) rather than forking a
 * ranking formula, and it consumes the JOV-7080 self-contained decision
 * packet shape. It does not create a new analytics stack, inbox, or
 * certification registry — unmeasured scope enters the SAME candidate pool as
 * a coverage defect, per the JOV-5930/JOV-6928 shared-pool invariant.
 *
 * State is a plain JSON object so it survives restart/redelivery and
 * reconciles idempotently (receipts dedupe by id; ranking is pure).
 */

import {
  type DecisionSignalCandidate,
  type DecisionSignalTrust,
  scoreDecisionSignal,
} from '@/lib/hud/decision-signals';

export const CONTROL_LOOP_SCHEMA_VERSION = 1;

/**
 * Decision-relevant measurement truth. 'unmeasured' means required scope has
 * no instrumentation — it is never treated as healthy or absent; the missing
 * coverage itself ranks as blocking work.
 */
export type ConstraintMeasurementState =
  | 'measured'
  | 'stale'
  | 'unmeasured'
  | 'unknown';

export interface ConstraintMetric {
  readonly id: string;
  /** Canonical metric source (metrics layer, Stripe, registry, …). */
  readonly source: string;
  readonly baseline: string;
  /** Target or healthy range that releases the constraint. */
  readonly target: string;
  readonly denominator: string | null;
  readonly owner: string;
  readonly observedAtIso: string | null;
  readonly freshnessDeadlineIso: string | null;
}

/** JOV-7080: a founder ask must be fully self-contained. */
export interface FounderDecisionPacket {
  readonly decision: string;
  readonly whyNow: string;
  readonly blocked: string;
  readonly options: readonly {
    readonly id: string;
    readonly label: string;
    readonly tradeoff: string;
  }[];
  readonly evidence: readonly string[];
  readonly expectedMetricEffect: string;
  readonly confidence: number;
  readonly freshness: DecisionSignalTrust;
  /** Authorized default/rollback when the founder stays silent. */
  readonly defaultIfSilent: string | null;
  readonly artifactRef: string;
  readonly artifactRevision: string;
}

function hasDecisionText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Missing context must be repaired before the binding request reaches Tim. */
function isCompleteFounderDecisionPacket(
  packet: FounderDecisionPacket | null | undefined
): packet is FounderDecisionPacket {
  if (
    typeof packet !== 'object' ||
    packet === null ||
    ![
      packet.decision,
      packet.whyNow,
      packet.blocked,
      packet.expectedMetricEffect,
      packet.artifactRef,
      packet.artifactRevision,
    ].every(hasDecisionText) ||
    !Number.isFinite(packet.confidence) ||
    packet.confidence < 0 ||
    packet.confidence > 1 ||
    !['fresh', 'stale', 'unknown'].includes(packet.freshness) ||
    (packet.defaultIfSilent !== null &&
      !hasDecisionText(packet.defaultIfSilent)) ||
    !Array.isArray(packet.evidence) ||
    packet.evidence.length === 0 ||
    !packet.evidence.every(hasDecisionText) ||
    !Array.isArray(packet.options) ||
    packet.options.length === 0
  ) {
    return false;
  }

  const identities = new Set<string>();
  const labels = new Set<string>();
  return packet.options.every(option => {
    if (
      typeof option !== 'object' ||
      option === null ||
      ![option.id, option.label, option.tradeoff].every(hasDecisionText)
    ) {
      return false;
    }
    const identity = option.id.trim();
    const label = option.label.trim().toLowerCase();
    if (identities.has(identity) || labels.has(label)) return false;
    identities.add(identity);
    labels.add(label);
    return true;
  });
}

/**
 * A candidate binding constraint. Extends the JOV-5924 signal contract so the
 * same score ranks certification, shipping, funnel, and coverage defects in
 * one pool.
 */
export interface ControlLoopCandidate extends DecisionSignalCandidate {
  readonly objectiveId: string;
  readonly metric: ConstraintMetric;
  readonly measurementState: ConstraintMeasurementState;
  /** Condition under which this constraint stops being binding. */
  readonly stopsBeingBindingWhen: string;
  /** True when only a founder authority boundary (taste, spend, credentials, irreversible action) remains. */
  readonly requiresFounder: boolean;
  readonly decisionPacket?: FounderDecisionPacket | null;
  /** Evidence shows the constraint cleared since the last reconcile. */
  readonly cleared?: boolean;
}

export type ConstraintStatus =
  | 'binding'
  | 'secondary'
  | 'cleared'
  | 'coverage-defect';

export interface ConstraintRecord {
  readonly id: string;
  readonly title: string;
  readonly status: ConstraintStatus;
  readonly metric: ConstraintMetric;
  readonly measurementState: ConstraintMeasurementState;
  readonly rankedScore: number;
  readonly whyBinding: string;
  readonly stopsBeingBindingWhen: string;
  readonly owner: string;
  readonly requiresFounder: boolean;
  readonly coverageOf: string | null;
}

/** A cleared constraint stays as a guardrail — its measure keeps watching. */
export interface Guardrail {
  readonly constraintId: string;
  readonly metricId: string;
  readonly source: string;
  readonly clearedAtIso: string;
  readonly reliability: string;
}

export type ReceiptStage =
  | 'decision'
  | 'action'
  | 'execution'
  | 'certified'
  | 'outcome';

/** JOV-6466 join: decision → action/exposure → execution → observed outcome. */
export interface OutcomeReceipt {
  readonly id: string;
  readonly constraintId: string;
  /** Artifact ref of the founder packet that authorized this, if any. */
  readonly decisionPacketRef: string | null;
  readonly actionId: string;
  readonly executionState:
    | 'pending'
    | 'running'
    | 'delivered'
    | 'certified'
    | 'failed';
  /** Null until a real measurement exists — never a fabricated success. */
  readonly observedOutcome: {
    readonly metricId: string;
    readonly before: string;
    readonly after: string;
    readonly uncertainty: string;
  } | null;
  readonly recordedAtIso: string;
}

export interface ControlLoopState {
  readonly schemaVersion: typeof CONTROL_LOOP_SCHEMA_VERSION;
  readonly objectiveId: string;
  readonly objectiveTitle: string;
  readonly objectiveMetric: ConstraintMetric;
  readonly bindingConstraintId: string | null;
  readonly constraints: readonly ConstraintRecord[];
  readonly guardrails: readonly Guardrail[];
  readonly receipts: readonly OutcomeReceipt[];
  /** At most one — the irreducible founder decision on the binding constraint. */
  readonly founderDecision: FounderDecisionPacket | null;
  /** Constraints Summer can still move without Tim. */
  readonly pendingAutonomousConstraintIds: readonly string[];
  readonly reconciledAtIso: string;
}

export interface ControlLoopObjective {
  readonly id: string;
  readonly title: string;
  readonly metric: ConstraintMetric;
}

export interface ReconcileInput {
  readonly objective: ControlLoopObjective;
  readonly candidates: readonly ControlLoopCandidate[];
  readonly nowIso: string;
  readonly previous?: ControlLoopState | null;
}

function coverageCandidate(
  candidate: ControlLoopCandidate
): ControlLoopCandidate {
  return {
    ...candidate,
    id: `coverage.${candidate.id}`,
    title: `Unmeasured required scope: ${candidate.title}`,
    whyNow:
      'A decision-relevant quantity has no trustworthy measurement; the missing instrumentation is the blocking work.',
    nextAction: `Instrument ${candidate.metric.id} (${candidate.metric.source}) so ${candidate.id} can be measured.`,
    actionKind: 'certification',
    summerCanAct: true,
    requiresFounder: false,
    decisionPacket: null,
    measurementState: 'measured',
    freshness: 'fresh',
    causeKey: candidate.causeKey ?? candidate.id,
  };
}

function toRecord(
  candidate: ControlLoopCandidate,
  status: ConstraintStatus,
  rankedScore: number,
  coverageOf: string | null
): ConstraintRecord {
  return {
    id: candidate.id,
    title: candidate.title,
    status,
    metric: candidate.metric,
    measurementState: candidate.measurementState,
    rankedScore,
    whyBinding: candidate.whyNow,
    stopsBeingBindingWhen: candidate.stopsBeingBindingWhen,
    owner: candidate.owner,
    requiresFounder: candidate.requiresFounder,
    coverageOf,
  };
}

function mergeReceipts(
  previous: readonly OutcomeReceipt[],
  incoming: readonly OutcomeReceipt[]
): OutcomeReceipt[] {
  const seen = new Set(previous.map(receipt => receipt.id));
  const merged = [...previous];
  for (const receipt of incoming) {
    if (seen.has(receipt.id)) continue;
    seen.add(receipt.id);
    merged.push(receipt);
  }
  return merged;
}

/**
 * Reconcile the loop: reconcile the objective's candidate constraints into
 * exactly one binding constraint, retain cleared constraints as guardrails,
 * and surface the founder packet only when the binding constraint is a true
 * founder-authority boundary.
 */
export function reconcileControlLoop(input: ReconcileInput): ControlLoopState {
  const { objective, candidates, nowIso, previous } = input;
  const priorGuardrails = new Map(
    (previous?.guardrails ?? []).map(g => [g.constraintId, g])
  );
  const priorReceipts =
    previous?.objectiveId === objective.id ? previous.receipts : [];

  const records: ConstraintRecord[] = [];
  const guardrails: Guardrail[] = [...priorGuardrails.values()];
  const rankedPool: { candidate: ControlLoopCandidate; score: number }[] = [];

  for (const candidate of candidates) {
    if (candidate.objectiveId !== objective.id) continue;
    const prior = priorGuardrails.get(candidate.id);
    if (candidate.cleared || prior) {
      if (!prior) {
        guardrails.push({
          constraintId: candidate.id,
          metricId: candidate.metric.id,
          source: candidate.metric.source,
          clearedAtIso: nowIso,
          reliability: `${candidate.metric.id} stays observed via ${candidate.metric.source}; regression reopens the constraint.`,
        });
      }
      records.push(toRecord(candidate, 'cleared', 0, null));
      continue;
    }
    if (
      candidate.measurementState === 'unmeasured' ||
      candidate.measurementState === 'unknown'
    ) {
      const defect = coverageCandidate(candidate);
      const { score } = scoreDecisionSignal(defect);
      rankedPool.push({ candidate: defect, score });
      records.push(toRecord(candidate, 'coverage-defect', 0, candidate.id));
      continue;
    }
    const { score } = scoreDecisionSignal(candidate);
    rankedPool.push({ candidate, score });
  }

  rankedPool.sort((a, b) => {
    const aP0 = a.candidate.priorityOverride === 'p0';
    const bP0 = b.candidate.priorityOverride === 'p0';
    if (aP0 !== bP0) return aP0 ? -1 : 1;
    if (a.score !== b.score) return b.score - a.score;
    return b.candidate.urgency - a.candidate.urgency;
  });

  const binding = rankedPool[0] ?? null;
  for (const entry of rankedPool) {
    const status: ConstraintStatus =
      entry === binding ? 'binding' : 'secondary';
    const coverageOf = entry.candidate.id.startsWith('coverage.')
      ? entry.candidate.id.slice('coverage.'.length)
      : null;
    records.push(toRecord(entry.candidate, status, entry.score, coverageOf));
  }

  const pendingAutonomous = rankedPool
    .filter(
      entry => entry.candidate.summerCanAct && !entry.candidate.requiresFounder
    )
    .map(entry => entry.candidate.id);

  // Machine exhaustion before founder attention: a packet materializes only
  // when the binding constraint is a founder-authority boundary carrying a
  // complete JOV-7080 packet.
  const decisionPacket = binding?.candidate.decisionPacket;
  const founderDecision =
    binding?.candidate.requiresFounder === true &&
    isCompleteFounderDecisionPacket(decisionPacket)
      ? decisionPacket
      : null;

  return {
    schemaVersion: CONTROL_LOOP_SCHEMA_VERSION,
    objectiveId: objective.id,
    objectiveTitle: objective.title,
    objectiveMetric: objective.metric,
    bindingConstraintId: binding?.candidate.id ?? null,
    constraints: records,
    guardrails,
    receipts: priorReceipts,
    founderDecision,
    pendingAutonomousConstraintIds: pendingAutonomous,
    reconciledAtIso: nowIso,
  };
}

/**
 * Append outcome receipts idempotently. Delivery, certification, and business
 * outcome stay distinct — a receipt without observedOutcome remains pending,
 * never a false success.
 */
export function recordOutcomeReceipts(
  state: ControlLoopState,
  receipts: readonly OutcomeReceipt[]
): ControlLoopState {
  return { ...state, receipts: mergeReceipts(state.receipts, receipts) };
}

/** Furthest verified stage of a receipt's decision→outcome join. */
export function receiptStage(receipt: OutcomeReceipt): ReceiptStage {
  if (receipt.observedOutcome != null) return 'outcome';
  switch (receipt.executionState) {
    case 'certified':
      return 'certified';
    case 'delivered':
      return 'execution';
    case 'running':
    case 'failed':
      return 'action';
    default:
      return 'decision';
  }
}

/**
 * The answer Summer/Ovie must always have: current objective, the #1 binding
 * constraint, why it outranks, the metric being optimized, and its release
 * condition.
 */
export function describeBindingConstraint(state: ControlLoopState): {
  readonly objective: string;
  readonly constraintId: string | null;
  readonly title: string | null;
  readonly metricBeingOptimized: string | null;
  readonly whyOutranks: string | null;
  readonly stopsBeingBindingWhen: string | null;
} {
  const binding =
    state.constraints.find(record => record.status === 'binding') ?? null;
  return {
    objective: `${state.objectiveTitle} (${state.objectiveMetric.id}: baseline ${state.objectiveMetric.baseline} → target ${state.objectiveMetric.target})`,
    constraintId: binding?.id ?? null,
    title: binding?.title ?? null,
    metricBeingOptimized: binding?.metric.id ?? null,
    whyOutranks: binding?.whyBinding ?? null,
    stopsBeingBindingWhen: binding?.stopsBeingBindingWhen ?? null,
  };
}
