import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type DogfoodMissionObservation,
  type OutcomeDogfoodMission,
} from '@/lib/agent-os/dogfood-mission';
import {
  buildDogfoodReceipt,
  dogfoodReceiptFromOutcomeMission,
  dogfoodReceiptFromPlaywrightReport,
  evaluateDogfoodReliability,
  validateDogfoodReceipt,
} from '@/lib/agent-os/dogfood-receipt';
import { CANONICAL_SURFACES } from '@/lib/canonical-surfaces';

const mission: OutcomeDogfoodMission = CANONICAL_SURFACES.find(
  surface => surface.id === 'public-profile'
)!.outcomeMission;
const binding = { commitSha: 'a'.repeat(40), deploymentId: 'dpl_mission' };
const context = {
  ...binding,
  subjectId: 'public-profile',
  product: 'jov' as const,
  actor: 'dogfood-agent',
  environment: 'production',
  flagCohort: 'dogfood',
  missionId: mission.id,
};
const timing = {
  startedAt: '2026-10-15T10:00:00Z',
  completedAt: '2026-10-15T10:01:00Z',
};
function observation(
  overrides: Partial<DogfoodMissionObservation> = {}
): DogfoodMissionObservation {
  return {
    purpose: 'capability',
    method: 'goal_driven',
    missionRevision: 1,
    goalCompletion: 'completed',
    correctness: 'correct',
    resultingState:
      'The artist matches the catalog and notification consent persists on a fresh read.',
    checks: mission.outcome.successCriteria.map(criterion => ({
      criterion,
      status: 'passed',
      evidenceRefs: ['artifact:state-readback'],
    })),
    friction: { assessment: 'acceptable', details: [] },
    recovery: { retries: 0, details: [] },
    durationMs: 60_000,
    resources: {
      status: 'measured',
      costUsd: 0.02,
      usage: [{ unit: 'tokens', quantity: 1500 }],
    },
    ...overrides,
  };
}
function run(
  overrides: Partial<DogfoodMissionObservation> = {},
  definition = mission
) {
  return dogfoodReceiptFromOutcomeMission(definition, {
    ...context,
    ...timing,
    kind: 'ui_agent',
    driver: 'playwright',
    missionObservation: observation(overrides),
  });
}
function reliability(receipt: ReturnType<typeof run>, definition = mission) {
  return evaluateDogfoodReliability([receipt, receipt, receipt], binding, [
    definition,
  ]);
}

describe('outcome missions', () => {
  it('covers every canonical surface and material assurance journey with a customer goal', () => {
    const matrix = JSON.parse(
      readFileSync(
        resolve(
          process.cwd(),
          '../../scripts/invariants/assurance-matrix.json'
        ),
        'utf8'
      )
    );
    const journeys = matrix.scope.requiredObjects.filter(
      (object: { kind: string }) => object.kind === 'user-journey'
    );
    expect(journeys).toHaveLength(7);
    const definitions: OutcomeDogfoodMission[] = [
      ...CANONICAL_SURFACES.map(surface => surface.outcomeMission),
      ...journeys.map(
        (journey: { outcomeMission: OutcomeDogfoodMission }) =>
          journey.outcomeMission
      ),
    ];
    expect(new Set(definitions.map(definition => definition.id)).size).toBe(
      definitions.length
    );
    for (const definition of definitions) {
      expect(definition.outcome.persona.length).toBeGreaterThan(2);
      expect(definition.outcome.goal.length).toBeGreaterThan(40);
      expect(definition.outcome.successCriteria.length).toBeGreaterThanOrEqual(
        3
      );
      expect(definition.outcome.frictionBudget.maxDurationMs).toBeGreaterThan(
        0
      );
      expect(JSON.stringify(definition)).not.toMatch(
        /data-testid|getByRole|click\(|locator\(/
      );
    }
  });

  it('sends goal-driven proof through the existing exact-deploy reliability evaluator', () => {
    const receipt = run();
    expect(receipt.schema).toBe('jovie.dogfood-receipt/v1');
    expect(receipt.evidenceRefs).toContain('artifact:state-readback');
    expect(receipt.missionObservation?.resources.status).toBe('measured');
    expect(reliability(receipt).machineCertifiable).toBe(true);
    expect(
      evaluateDogfoodReliability(
        [receipt, receipt, receipt],
        { ...binding, commitSha: 'b'.repeat(40) },
        [mission]
      ).machineCertifiable
    ).toBe(false);
  });

  it('cannot certify a customer goal with three green selector scripts', () => {
    const receipt = dogfoodReceiptFromPlaywrightReport(context, {
      stats: { expected: 4, duration: 60_000, startTime: timing.startedAt },
    });
    expect(receipt.outcome).toBe('passed');
    expect(reliability(receipt).machineCertifiable).toBe(false);
    expect(
      reliability(buildDogfoodReceipt({ ...receipt, missionObservation: null }))
        .machineCertifiable
    ).toBe(false);
  });

  it('keeps newer regression runs out of the capability reliability window', () => {
    const capable = run();
    const scripted = dogfoodReceiptFromPlaywrightReport(context, {
      stats: {
        expected: 4,
        duration: 60_000,
        startTime: '2026-10-15T11:00:00Z',
      },
    });
    expect(
      evaluateDogfoodReliability(
        [capable, capable, capable, scripted, scripted, scripted],
        binding,
        [mission]
      ).machineCertifiable
    ).toBe(true);
  });

  it('reports completed with unacceptable friction and refuses certification', () => {
    const receipt = run({
      friction: {
        assessment: 'unacceptable',
        details: ['The fan had to restart subscription three times.'],
      },
    });
    expect(receipt.missionObservation?.goalCompletion).toBe('completed');
    expect(receipt.blocker).toContain('friction unacceptable');
    expect(receipt.outcome).toBe('failed');
    expect(reliability(receipt).machineCertifiable).toBe(false);
  });

  it.each([
    { correctness: 'incorrect' as const },
    { correctness: 'unverified' as const },
    { goalCompletion: 'partial' as const },
    { method: 'scripted' as const },
    { purpose: 'regression' as const },
    { missionRevision: 2 },
    {
      checks: [
        {
          criterion: 'unrelated click',
          status: 'passed' as const,
          evidenceRefs: ['artifact:click'],
        },
      ],
    },
    {
      recovery: {
        retries: 2,
        details: ['Restarted after timeout, then retried save.'],
      },
    },
    {
      resources: {
        status: 'unavailable' as const,
        reason: 'Provider usage receipt missing.',
      },
    },
  ])('rejects insufficient outcome proof: %j', overrides => {
    expect(reliability(run(overrides)).machineCertifiable).toBe(false);
  });

  it('applies declared latency and cost budgets even when the agent accepts the friction', () => {
    for (const frictionBudget of [
      { maxDurationMs: 30_000, maxRetries: 1 },
      { maxDurationMs: 180_000, maxRetries: 1, maxCostUsd: 0.01 },
    ]) {
      const definition = {
        ...mission,
        outcome: { ...mission.outcome, frictionBudget },
      };
      expect(
        reliability(run({}, definition), definition).machineCertifiable
      ).toBe(false);
    }
  });

  it('rechecks mission requirements even when a producer labels the receipt passed', () => {
    for (const overrides of [
      { missionRevision: 2 },
      { recovery: { retries: 2, details: ['Restarted twice.'] } },
      {
        checks: [
          {
            criterion: 'unrelated result',
            status: 'passed' as const,
            evidenceRefs: ['artifact:result'],
          },
        ],
      },
    ]) {
      const receipt = { ...run(overrides), outcome: 'passed' as const };
      expect(reliability(receipt).machineCertifiable).toBe(false);
    }
  });

  it('retains retries and recovery while allowing a bounded recovery', () => {
    const receipt = run({
      recovery: {
        retries: 1,
        details: [
          'Recovered from a transient timeout without duplicate subscription.',
        ],
      },
    });
    expect(receipt.missionObservation?.recovery.retries).toBe(1);
    expect(reliability(receipt).machineCertifiable).toBe(true);
  });

  it('rejects missing resulting state, evidence, recovery details and inconsistent timing', () => {
    const receipt = run();
    for (const change of [
      { resultingState: '' },
      { friction: { assessment: 'unacceptable', details: [] } },
      { checks: [] },
      {
        checks: [{ criterion: 'identity', status: 'passed', evidenceRefs: [] }],
      },
      { recovery: { retries: 1, details: [] } },
      { durationMs: -1 },
      { durationMs: 100 },
    ]) {
      expect(
        validateDogfoodReceipt({
          ...receipt,
          missionObservation: { ...receipt.missionObservation, ...change },
        }).length
      ).toBeGreaterThan(0);
    }
    expect(
      validateDogfoodReceipt({ ...receipt, evidenceRefs: [] }).length
    ).toBeGreaterThan(0);
    expect(
      validateDogfoodReceipt({
        ...run({ correctness: 'incorrect' }),
        outcome: 'passed',
      }).length
    ).toBeGreaterThan(0);
  });
});
