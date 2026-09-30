import { describe, expect, it } from 'vitest';
import {
  ACTIVATION_PILOT_SPEC,
  ACTIVATION_PILOT_TRACKING_KEY,
  type ActivationExperimentSpec,
  applyRollback,
  assignArm,
  buildAssignment,
  evaluatePilot,
  lockedFieldViolations,
  nextServingPolicy,
  predictActivationRisk,
  specDigest,
} from './pilot-controller';
import { buildPilotFixture, PILOT_FIXTURES } from './pilot-fixtures';

const SPEC = ACTIVATION_PILOT_SPEC;
const DIGEST = specDigest(SPEC);

describe('activation pilot commission (JOV-6468)', () => {
  it('freezes the spec under the tracking key with bounded variants', () => {
    expect(SPEC.trackingKey).toBe(ACTIVATION_PILOT_TRACKING_KEY);
    expect(SPEC.variants.map(v => v.id)).toEqual([
      'incumbent',
      'challenger',
      'holdout',
    ]);
    const alloc = SPEC.allocation;
    const total = alloc.incumbent + alloc.challenger + alloc.holdout;
    expect(total).toBeCloseTo(1);
    expect(alloc.holdout).toBeGreaterThan(0);
    expect(SPEC.downstreamOutcomes).toContain('paid_converted');
  });

  it('detects unauthorized locked-field edits after freeze', () => {
    const tampered: ActivationExperimentSpec = {
      ...SPEC,
      primaryOutcome: { ...SPEC.primaryOutcome, minMeaningfulEffect: 0.01 },
    };
    expect(lockedFieldViolations(SPEC, tampered)).toEqual(['primaryOutcome']);
    expect(lockedFieldViolations(SPEC, SPEC)).toEqual([]);
    const wb = evaluatePilot({
      ...buildPilotFixture({ spec: tampered }),
      approvedSpecDigest: DIGEST,
    });
    expect(wb.decision).toBe('hold');
    expect(wb.reason).toContain('spec-tampered');
  });
});

describe('decision-time prediction', () => {
  it('returns a transparent baseline prediction with a declared horizon', () => {
    const prediction = predictActivationRisk({
      unitId: 'u1',
      horizonHours: SPEC.primaryOutcome.horizonHours,
      features: {
        cohortBaselineRate: 0.3,
        stepsCompleted: 2,
        stepsTotal: 4,
        hasConnectedSource: 1,
        priorSessions: 2,
      },
    });
    expect('error' in prediction).toBe(false);
    if ('error' in prediction) return;
    expect(prediction.activationProbability).toBeGreaterThan(0.3);
    expect(prediction.horizonHours).toBe(72);
  });

  it('rejects prohibited inputs (sensitive inference, cross-platform ids)', () => {
    const result = predictActivationRisk({
      unitId: 'u1',
      horizonHours: 72,
      features: { cohortBaselineRate: 0.3, 'cross-platform-identity': 1 },
    });
    expect('error' in result && result.error).toContain(
      'unlawful-prediction-input'
    );
  });
});

describe('sticky assignment', () => {
  it('is stable across rerender/restart and preserves a holdout', () => {
    const a = assignArm(SPEC, 'user-42', 1);
    const b = assignArm(SPEC, 'user-42', 1);
    expect(a).toEqual(b);
    const record = buildAssignment(SPEC, 'user-42', 1, '2026-09-20T00:00:00Z');
    expect(record.generation).toBe(1);
    expect(record.selectionProbability).toBe(SPEC.allocation[record.arm]);
    const arms = new Set(
      Array.from({ length: 200 }, (_, i) => assignArm(SPEC, `u-${i}`, 1).arm)
    );
    expect(arms.has('holdout')).toBe(true);
  });
});

describe('evaluation', () => {
  it('promotes on a positive fixture and writes back consumable evidence', () => {
    const wb = evaluatePilot(PILOT_FIXTURES.positive(SPEC));
    expect(wb.decision).toBe('promote');
    expect(wb.policyVersion).toBe(SPEC.policyVersion);
    expect(wb.evidence.ittEffect).toBeGreaterThan(
      SPEC.primaryOutcome.minMeaningfulEffect
    );
    const next = nextServingPolicy(SPEC, wb, '2026-10-11T00:00:00.000Z');
    const nextAlloc = next.allocation;
    expect(next.sourceDecision).toBe('promote');
    expect(nextAlloc.challenger).toBeGreaterThan(0);
    expect(nextAlloc.holdout).toBeGreaterThan(0);
  });

  it('rejects a regressive challenger and retains the incumbent', () => {
    const wb = evaluatePilot(PILOT_FIXTURES.regressive(SPEC));
    expect(wb.decision).toBe('reject');
    const next = nextServingPolicy(SPEC, wb, '2026-10-11T00:00:00.000Z');
    const nextAlloc = next.allocation;
    expect(nextAlloc.challenger).toBe(0);
    expect(nextAlloc.incumbent).toBeGreaterThan(0);
  });

  it('returns inconclusive on low sample with the incumbent retained', () => {
    const wb = evaluatePilot(PILOT_FIXTURES.inconclusive(SPEC));
    expect(wb.decision).toBe('inconclusive');
    expect(wb.reason).toContain('low-sample');
  });

  it('returns inconclusive when exposure telemetry is missing', () => {
    const wb = evaluatePilot(PILOT_FIXTURES.missingTelemetry(SPEC));
    expect(wb.decision).toBe('inconclusive');
    expect(wb.reason).toContain('missing-telemetry');
  });

  it('holds while the observation period is still open (delayed outcomes)', () => {
    const wb = evaluatePilot(PILOT_FIXTURES.delayedOutcome(SPEC));
    expect(wb.decision).toBe('hold');
    expect(wb.reason).toContain('pending-maturity');
  });

  it('dedupes duplicate conversion events per unit', () => {
    const fixture = buildPilotFixture({
      spec: SPEC,
      extraOutcomes: [
        {
          unitId: 'fixture-incumbent-0',
          event: 'activated',
          occurredAtIso: '2026-09-22T00:00:00.000Z',
        },
      ],
    });
    const wb = evaluatePilot(fixture);
    expect(wb.evidence.arms.incumbent.conversions).toBe(120);
  });

  it('flags sample-ratio mismatch as inconclusive', () => {
    const fixture = buildPilotFixture({ spec: SPEC });
    let flipped = 0;
    const skewed = fixture.assignments.map(a =>
      a.arm === 'challenger' && flipped++ < 200
        ? { ...a, arm: 'incumbent' as const }
        : a
    );
    const wb = evaluatePilot({ ...fixture, assignments: skewed });
    expect(wb.decision).toBe('inconclusive');
    expect(wb.reason).toContain('sample-ratio-mismatch');
  });

  it('excludes units that withdrew consent', () => {
    const wb = evaluatePilot(
      buildPilotFixture({
        spec: SPEC,
        consentWithdrawn: ['fixture-challenger-0'],
      })
    );
    expect(wb.evidence.arms.challenger.assigned).toBe(399);
  });

  it('rolls back on guardrail breach and the writeback authorizes restore', () => {
    const wb = evaluatePilot(
      buildPilotFixture({
        spec: SPEC,
        guardrailObservations: {
          error_rate: 0.5,
          latency: 400,
          complaint: 0,
          entitlement: 1,
        },
      })
    );
    expect(wb.decision).toBe('rollback');
    const restore = applyRollback(SPEC, wb);
    expect(restore.ok).toBe(true);
    if (restore.ok) {
      expect(restore.restored).toBe('incumbent');
      expect(restore.preserves).toContain('assignments');
    }
    const next = nextServingPolicy(SPEC, wb, '2026-10-11T00:00:00.000Z');
    const nextAlloc = next.allocation;
    expect(nextAlloc).toEqual({ incumbent: 1, challenger: 0, holdout: 0 });
  });

  it('refuses a rollback that no decision authorized', () => {
    const wb = evaluatePilot(PILOT_FIXTURES.positive(SPEC));
    const restore = applyRollback(SPEC, wb);
    expect(restore.ok).toBe(false);
    if (!restore.ok) expect(restore.reason).toContain('failed-rollback');
  });

  it('ignores a stale writeback and keeps incumbent + holdout', () => {
    const wb = evaluatePilot(PILOT_FIXTURES.positive(SPEC));
    const next = nextServingPolicy(SPEC, wb, '2027-01-01T00:00:00.000Z');
    const nextAlloc = next.allocation;
    expect(next.sourceDecision).toBe('initial');
    expect(nextAlloc.challenger).toBe(0);
    expect(nextAlloc.holdout).toBeGreaterThan(0);
  });

  it('keeps ITT distinct from exposed-only diagnostics', () => {
    const fixture = buildPilotFixture({ spec: SPEC });
    const partial = fixture.exposures.filter((_, i) => i % 2 === 0);
    const wb = evaluatePilot({ ...fixture, exposures: partial });
    expect(wb.decision).toBe('promote');
    expect(wb.evidence.arms.challenger.assigned).toBe(400);
    expect(wb.evidence.arms.challenger.exposed).toBe(200);
  });
});
