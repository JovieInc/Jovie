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
