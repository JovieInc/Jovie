import { describe, expect, it } from 'vitest';
import {
  ACTIVATION_PILOT_SPEC,
  buildAssignment,
  type ExposureRecord,
  evaluatePilot,
  type OutcomeRecord,
  predictActivationRisk,
} from './pilot-controller';
import { PILOT_FIXTURES } from './pilot-fixtures';
import {
  bindPilotMeasuredOutcome,
  buildPilotOutcomeReceipt,
  buildPilotPredictionReceipt,
} from './pilot-receipts';

const SPEC = ACTIVATION_PILOT_SPEC;
const ASSIGNED = '2026-09-20T00:00:00.000Z';
const CONSENT = {
  ref: 'consent:u-1',
  validUntilIso: '2027-01-01T00:00:00.000Z',
};

function decisionTime(unitId: string) {
  const prediction = predictActivationRisk({
    unitId,
    horizonHours: SPEC.primaryOutcome.horizonHours,
    features: {
      cohortBaselineRate: 0.3,
      stepsCompleted: 1,
      stepsTotal: 4,
      hasConnectedSource: 0,
      priorSessions: 1,
    },
  });
  if ('error' in prediction) throw new Error(prediction.error);
  const assignment = buildAssignment(SPEC, unitId, 1, ASSIGNED);
  const receipt = buildPilotPredictionReceipt({
    spec: SPEC,
    prediction,
    assignment,
    tenantId: 'tenant-1',
    predictedAtIso: ASSIGNED,
    snapshotCapturedAtIso: '2026-09-19T23:00:00.000Z',
    baseline: 0.3,
    consent: CONSENT,
  });
  return { prediction, assignment, receipt };
}

const exposureFor = (
  unitId: string,
  arm: ExposureRecord['arm']
): ExposureRecord => ({
  experimentId: SPEC.experimentId,
  unitId,
  arm,
  surfaceVersion: SPEC.surface.version,
  exposedAtIso: '2026-09-20T01:00:00.000Z',
});

const activated = (unitId: string): OutcomeRecord => ({
  unitId,
  event: 'activated',
  occurredAtIso: '2026-09-21T00:00:00.000Z',
});

describe('canonical receipt binding (JOV-6468 → JOV-6466 joins)', () => {
  it('binds a real exposure + matured outcome to the decision-time prediction', () => {
    const { assignment, receipt } = decisionTime('user-1');
    const writeback = evaluatePilot(PILOT_FIXTURES.positive(SPEC));
    const outcome = buildPilotOutcomeReceipt({
      spec: SPEC,
      prediction: receipt,
      exposure: exposureFor(assignment.unitId, assignment.arm),
      outcome: activated(assignment.unitId),
      writeback,
      observedAtIso: '2026-10-05T00:00:00.000Z',
      recordedAtIso: '2026-10-05T01:00:00.000Z',
    });
    expect(outcome.maturity).toBe('mature');
    expect(outcome.disposition.kind).toBe('promote');
    const bound = bindPilotMeasuredOutcome(receipt, outcome);
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    expect(bound.loop.owner).toBe('activation-owner');
    expect(bound.loop.sourceFreshness).toBe('fresh');
    expect(bound.loop.stages.engineering.status).toBe('succeeded');
    expect(bound.loop.stages.customer.status).toBe('succeeded');
    // Paid/retained outcomes stay pending until observed and attributable.
    expect(bound.loop.stages.business.status).toBe('pending');
    expect(bound.loop.stages.business.value).toBeNull();
  });

  it('binds a regressive decision without mislabeling it as uplift', () => {
    const { assignment, receipt } = decisionTime('user-2');
    const writeback = evaluatePilot(PILOT_FIXTURES.regressive(SPEC));
    const outcome = buildPilotOutcomeReceipt({
      spec: SPEC,
      prediction: receipt,
      exposure: exposureFor(assignment.unitId, assignment.arm),
      outcome: null,
      writeback,
      observedAtIso: '2026-10-05T00:00:00.000Z',
      recordedAtIso: '2026-10-05T01:00:00.000Z',
    });
    expect(outcome.disposition.kind).toBe('reject');
    const bound = bindPilotMeasuredOutcome(receipt, outcome);
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    expect(bound.loop.stages.customer.status).toBe('failed');
  });

  it('keeps pre-horizon outcomes immature and forbids promotion', () => {
    const { assignment, receipt } = decisionTime('user-3');
    const promote = evaluatePilot(PILOT_FIXTURES.positive(SPEC));
    expect(() =>
      buildPilotOutcomeReceipt({
        spec: SPEC,
        prediction: receipt,
        exposure: exposureFor(assignment.unitId, assignment.arm),
        outcome: activated(assignment.unitId),
        writeback: promote,
        observedAtIso: '2026-09-21T00:00:00.000Z',
        recordedAtIso: '2026-09-21T01:00:00.000Z',
      })
    ).toThrow(/immature outcome cannot promote/);
    const hold = evaluatePilot(PILOT_FIXTURES.delayedOutcome(SPEC));
    const immature = buildPilotOutcomeReceipt({
      spec: SPEC,
      prediction: receipt,
      exposure: exposureFor(assignment.unitId, assignment.arm),
      outcome: activated(assignment.unitId),
      writeback: hold,
      observedAtIso: '2026-09-21T00:00:00.000Z',
      recordedAtIso: '2026-09-21T01:00:00.000Z',
    });
    expect(immature.maturity).toBe('immature');
    expect(immature.stages.customer.value).toBeNull();
  });

  it('fails closed when an experiment outcome has no exposure', () => {
    const { receipt } = decisionTime('user-4');
    const writeback = evaluatePilot(PILOT_FIXTURES.missingTelemetry(SPEC));
    const outcome = buildPilotOutcomeReceipt({
      spec: SPEC,
      prediction: receipt,
      exposure: null,
      outcome: activated(receipt.identity.entityId),
      writeback,
      observedAtIso: '2026-10-05T00:00:00.000Z',
      recordedAtIso: '2026-10-05T01:00:00.000Z',
    });
    const bound = bindPilotMeasuredOutcome(receipt, outcome);
    expect(bound.ok).toBe(false);
    if (bound.ok) return;
    expect(bound.reason).toContain('experiment outcome requires an exposure');
  });

  it('rejects cross-boundary and expired-consent receipts', () => {
    const { assignment, receipt } = decisionTime('user-5');
    const writeback = evaluatePilot(PILOT_FIXTURES.positive(SPEC));
    const outcome = buildPilotOutcomeReceipt({
      spec: SPEC,
      prediction: receipt,
      exposure: exposureFor(assignment.unitId, assignment.arm),
      outcome: activated(assignment.unitId),
      writeback,
      observedAtIso: '2026-10-05T00:00:00.000Z',
      recordedAtIso: '2026-10-05T01:00:00.000Z',
    });
    const tampered = structuredClone(outcome);
    tampered.identity.tenantId = 'other-tenant';
    const bound = bindPilotMeasuredOutcome(receipt, tampered);
    expect(bound.ok).toBe(false);
    if (!bound.ok) expect(bound.reason).toContain('cross-bound');

    const prediction = predictActivationRisk({
      unitId: 'user-6',
      horizonHours: 72,
      features: { cohortBaselineRate: 0.3 },
    });
    if ('error' in prediction) throw new Error('unreachable');
    expect(() =>
      buildPilotPredictionReceipt({
        spec: SPEC,
        prediction,
        assignment: buildAssignment(SPEC, 'user-6', 1, ASSIGNED),
        tenantId: 'tenant-1',
        predictedAtIso: ASSIGNED,
        snapshotCapturedAtIso: '2026-09-19T23:00:00.000Z',
        baseline: 0.3,
        consent: {
          ref: 'consent:u-6',
          validUntilIso: '2026-09-01T00:00:00.000Z',
        },
      })
    ).toThrow(/consent is missing or expired/);
  });
});
