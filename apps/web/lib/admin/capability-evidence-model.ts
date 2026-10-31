/** Pure evidence display model shared by server reads and browser stories. */

export const CAPABILITY_EVIDENCE_STAGES = [
  'unknown',
  'failure',
  'merged-only',
  'deployed-only',
  'configured-unobserved',
  'stale-observation',
  'stale-client',
  'partial-rollout',
  'healthy',
] as const;

export type CapabilityEvidenceStage =
  (typeof CAPABILITY_EVIDENCE_STAGES)[number];

export const CAPABILITY_STAGE_LABEL: Record<CapabilityEvidenceStage, string> = {
  unknown: 'Unknown',
  failure: 'Observation failure',
  'merged-only': 'Merged only',
  'deployed-only': 'Deployed, unobserved',
  'configured-unobserved': 'Configured, unobserved',
  'stale-observation': 'Stale observation',
  'stale-client': 'Stale client',
  'partial-rollout': 'Partial rollout',
  healthy: 'Healthy',
};

export interface CapabilityObservation {
  /** Whether an authoritative source answered at all. */
  readonly measured: boolean;
  readonly count: number | null;
  /** ISO date of the newest observed event day, when the source reported one. */
  readonly latestAt: string | null;
  readonly stale: boolean;
  readonly windowDays: number;
  /** The population the count actually covers — never widened implicitly. */
  readonly population: string;
  readonly error: string | null;
}

export interface CapabilityCertification {
  readonly state: string;
  readonly readiness: string;
  readonly decisionEvidenceDigest: string;
  readonly sourcePath: string;
}

export interface CapabilityDeployment {
  readonly commitSha: string | null;
  readonly version: string | null;
  readonly environment: string | null;
  readonly deploymentId: string | null;
}

export interface CapabilityRollout {
  /** Raw flag/gate text from the canonical registry ('None' → ungated). */
  readonly gate: string | null;
  /** Configured rollout percent when the capability is gated; null = ungated. */
  readonly configuredPercent: number | null;
}

export interface CapabilityEvidenceRecord {
  /** Stable ID from docs/FEATURE_REGISTRY.md ("public-profile-pages"). */
  readonly capabilityId: string;
  /** Canonical subject ID inside the certification packet. */
  readonly subjectId: string;
  readonly title: string;
  readonly goldenPath: string;
  readonly certification: CapabilityCertification | null;
  readonly deployment: CapabilityDeployment;
  readonly rollout: CapabilityRollout;
  /** Installed/running client build — not instrumented, always null today. */
  readonly clientSha: string | null;
  readonly exposure: CapabilityObservation;
  readonly outcome: CapabilityObservation;
  readonly generatedAt: string;
}

/**
 * Derives the evidenced lifecycle stage. Merged, certified, deployed, exposed
 * and observed are distinct states — a stage is only claimed when its own
 * evidence exists, and any read failure fails the whole record closed.
 */
export function deriveCapabilityStage(
  record: Pick<
    CapabilityEvidenceRecord,
    | 'certification'
    | 'deployment'
    | 'rollout'
    | 'clientSha'
    | 'exposure'
    | 'outcome'
  >
): CapabilityEvidenceStage {
  if (record.exposure.error || record.outcome.error) return 'failure';
  if (!record.certification) return 'unknown';
  if (!record.deployment.commitSha) return 'merged-only';
  if (
    record.clientSha &&
    record.deployment.commitSha &&
    record.clientSha !== record.deployment.commitSha
  ) {
    return 'stale-client';
  }
  if (!record.exposure.measured) {
    return record.rollout.configuredPercent !== null || record.rollout.gate
      ? 'configured-unobserved'
      : 'deployed-only';
  }
  if (record.exposure.stale || record.outcome.stale) return 'stale-observation';
  if (
    record.rollout.configuredPercent !== null &&
    record.rollout.configuredPercent < 100
  ) {
    return 'partial-rollout';
  }
  return record.outcome.measured ? 'healthy' : 'configured-unobserved';
}

/** The delivery lifecycle every capability moves through, in order. */
export const CAPABILITY_LIFECYCLE = [
  'desired',
  'built',
  'certified',
  'deployed',
  'exposed',
  'observed',
  'healthy',
] as const;

export type CapabilityLifecycleId = (typeof CAPABILITY_LIFECYCLE)[number];

export type CapabilityLifecycleState =
  | 'done'
  | 'current'
  | 'failed'
  | 'pending'
  | 'unknown';

/** Structurally a `StatusPipelineStage` with a string value. */
export interface CapabilityLifecycleStage {
  readonly id: CapabilityLifecycleId;
  readonly label: string;
  readonly state: CapabilityLifecycleState;
  readonly value: string;
  readonly evidence: string;
}

const LIFECYCLE_LABEL: Record<CapabilityLifecycleId, string> = {
  desired: 'Desired',
  built: 'Built',
  certified: 'Certified',
  deployed: 'Deployed',
  exposed: 'Exposed',
  observed: 'Observed',
  healthy: 'Healthy',
};

const CERTIFIED_STATES = new Set(['shipped', 'monitored', 'founder_locked']);

function observationStage(
  observation: CapabilityObservation
): Pick<CapabilityLifecycleStage, 'state' | 'value' | 'evidence'> {
  const evidence = `${observation.population}, ${observation.windowDays}-day window`;
  if (observation.error) {
    return { state: 'failed', value: 'Source error', evidence };
  }
  if (!observation.measured) {
    return { state: 'unknown', value: 'Not instrumented', evidence };
  }
  const count = (observation.count ?? 0).toLocaleString('en-US');
  const value = `${count} in ${observation.windowDays}d`;
  if (observation.stale) {
    return {
      state: 'current',
      value: `${value} · stale`,
      evidence: `${evidence}; newest event ${observation.latestAt ?? 'unknown'}`,
    };
  }
  return {
    state: (observation.count ?? 0) > 0 ? 'done' : 'pending',
    value,
    evidence,
  };
}

/**
 * Each lifecycle stage's state and real reading for one capability. A stage
 * is `done` only when its own evidence exists; a missing source is `unknown`,
 * and the first stage not yet reached is `current`.
 */
export function capabilityLifecycleStages(
  record: CapabilityEvidenceRecord
): readonly CapabilityLifecycleStage[] {
  const { certification, deployment } = record;
  const registry = certification?.sourcePath ?? 'docs/FEATURE_REGISTRY.md';
  const stage = deriveCapabilityStage(record);
  const raw: Record<
    CapabilityLifecycleId,
    Pick<CapabilityLifecycleStage, 'state' | 'value' | 'evidence'>
  > = {
    desired: certification
      ? { state: 'done', value: 'Registered', evidence: registry }
      : { state: 'unknown', value: 'Registry unread', evidence: registry },
    built: certification
      ? { state: 'done', value: 'Merged', evidence: registry }
      : { state: 'unknown', value: 'Registry unread', evidence: registry },
    certified: !certification
      ? { state: 'unknown', value: 'Registry unread', evidence: registry }
      : {
          state: CERTIFIED_STATES.has(certification.state) ? 'done' : 'pending',
          value: certification.state.replaceAll('_', ' '),
          evidence: `Certification ${certification.readiness}, evidence ${certification.decisionEvidenceDigest.slice(0, 12)}`,
        },
    deployed: deployment.commitSha
      ? {
          state: 'done',
          value: deployment.version
            ? `${deployment.version} ${deployment.commitSha.slice(0, 7)}`
            : deployment.commitSha.slice(0, 7),
          evidence: `Deployed build${deployment.environment ? ` (${deployment.environment})` : ''}`,
        }
      : {
          state: 'unknown',
          value: 'No build info',
          evidence: 'Deployed build',
        },
    exposed: observationStage(record.exposure),
    observed: observationStage(record.outcome),
    healthy:
      stage === 'healthy'
        ? { state: 'done', value: 'Healthy', evidence: 'All stages evidenced' }
        : {
            state: stage === 'failure' ? 'failed' : 'pending',
            value: CAPABILITY_STAGE_LABEL[stage],
            evidence: 'Derived from the stages before it',
          },
  };
  const firstOpen = CAPABILITY_LIFECYCLE.find(
    id => raw[id].state === 'pending'
  );
  return CAPABILITY_LIFECYCLE.map(id => ({
    id,
    label: LIFECYCLE_LABEL[id],
    ...raw[id],
    state: id === firstOpen ? 'current' : raw[id].state,
  }));
}
