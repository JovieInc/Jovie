/**
 * Controlled fixtures for the activation pilot (JOV-6468).
 *
 * These prove the controller produces positive, regressive, inconclusive,
 * missing-telemetry and delayed-outcome decisions. Fixtures are declared
 * cohorts only — a fixture result is never evidence for real statistical
 * promotion, which requires a sufficient authorized cohort.
 */

import type {
  ActivationExperimentSpec,
  AssignmentRecord,
  EvaluationInput,
  ExposureRecord,
  OutcomeRecord,
  PilotArm,
} from './pilot-controller';
import { specDigest } from './pilot-controller';

const ARMS: readonly PilotArm[] = ['incumbent', 'challenger', 'holdout'];

export interface PilotFixtureOptions {
  readonly spec: ActivationExperimentSpec;
  readonly perArm?: number;
  /** Conversion rate per arm on the primary outcome. */
  readonly rates?: Record<PilotArm, number>;
  readonly assignedAtIso?: string;
  readonly nowIso?: string;
  readonly withExposures?: boolean;
  /** Units (ids) whose consent was withdrawn before measurement. */
  readonly consentWithdrawn?: readonly string[];
  readonly guardrailObservations?: Record<string, number>;
  /** Extra outcome rows (e.g. duplicate conversion events). */
  readonly extraOutcomes?: readonly OutcomeRecord[];
}

const HEALTHY_GUARDRAILS: Record<string, number> = {
  error_rate: 0.005,
  latency: 400,
  complaint: 0,
  entitlement: 1,
};

export function buildPilotFixture(
  options: PilotFixtureOptions
): EvaluationInput {
  const {
    spec,
    perArm = 400,
    rates = { incumbent: 0.3, challenger: 0.42, holdout: 0.3 },
    assignedAtIso = '2026-09-20T00:00:00.000Z',
    nowIso = '2026-10-10T00:00:00.000Z',
    withExposures = true,
    consentWithdrawn = [],
    guardrailObservations = HEALTHY_GUARDRAILS,
    extraOutcomes = [],
  } = options;

  const assignments: AssignmentRecord[] = [];
  const exposures: ExposureRecord[] = [];
  const outcomes: OutcomeRecord[] = [...extraOutcomes];

  for (const arm of ARMS) {
    // Arm sizes follow the declared allocation so the sample-ratio gate passes.
    const count = Math.round(
      (perArm * spec.allocation[arm]) / spec.allocation.incumbent
    );
    const conversions = Math.round(count * rates[arm]);
    for (let i = 0; i < count; i++) {
      const unitId = `fixture-${arm}-${i}`;
      assignments.push({
        experimentId: spec.experimentId,
        unitId,
        arm,
        generation: 1,
        selectionProbability: spec.allocation[arm],
        assignedAtIso,
      });
      if (withExposures) {
        exposures.push({
          experimentId: spec.experimentId,
          unitId,
          arm,
          surfaceVersion: spec.surface.version,
          exposedAtIso: '2026-09-20T01:00:00.000Z',
        });
      }
      if (i < conversions) {
        outcomes.push({
          unitId,
          event: spec.primaryOutcome.event,
          occurredAtIso: '2026-09-21T00:00:00.000Z',
        });
      }
    }
  }

  return {
    spec,
    approvedSpecDigest: specDigest(spec),
    assignments,
    exposures,
    outcomes,
    consentWithdrawn,
    guardrailObservations,
    nowIso,
  };
}

/** Named scenarios matching the acceptance fixtures. */
export const PILOT_FIXTURES = {
  positive: (spec: ActivationExperimentSpec): EvaluationInput =>
    buildPilotFixture({ spec }),
  regressive: (spec: ActivationExperimentSpec): EvaluationInput =>
    buildPilotFixture({
      spec,
      rates: { incumbent: 0.4, challenger: 0.2, holdout: 0.4 },
    }),
  inconclusive: (spec: ActivationExperimentSpec): EvaluationInput =>
    buildPilotFixture({
      spec,
      perArm: 20,
      rates: { incumbent: 0.3, challenger: 0.35, holdout: 0.3 },
    }),
  missingTelemetry: (spec: ActivationExperimentSpec): EvaluationInput =>
    buildPilotFixture({ spec, withExposures: false }),
  delayedOutcome: (spec: ActivationExperimentSpec): EvaluationInput =>
    buildPilotFixture({
      spec,
      nowIso: '2026-09-25T00:00:00.000Z',
    }),
} as const;
