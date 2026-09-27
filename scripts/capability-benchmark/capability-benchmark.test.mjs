import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BENCHMARK_REGISTRY_SCHEMA,
  CAPACITY_RECEIPT_SCHEMA,
  classifyTriggerEvent,
  isDecisionStale,
  loadRegistry,
  MATERIAL_TRIGGER_CLASSES,
  REQUIRED_CODE_REVIEW_METRICS,
  registryDigest,
  requiresOviCertification,
  SOURCING_STATES,
  validateBenchmarkRegistry,
  validateCapacityReceipt,
  validateShadowReplayReceipt,
} from './capability-benchmark.mjs';

function baseRegistry() {
  return {
    schema: BENCHMARK_REGISTRY_SCHEMA,
    issue: 'JOV-2966',
    auditedAt: '2026-09-26T00:00:00Z',
    evidenceLifecycleIssue: 'JOV-5916',
    secondLedger: false,
    triggerPolicy: {
      clockSweep: false,
      materialEvents: [...MATERIAL_TRIGGER_CLASSES],
      lowValueAccumulation: { bySemanticSignature: true },
    },
    evidenceProducers: [{ id: 'idea-radar', canonicalLifecycle: 'JOV-5916' }],
    domains: [
      {
        id: 'code-review-verification',
        status: 'defined',
        capability: 'code review / implementation verification',
        userOutcome: 'bugs caught pre-merge',
        taskSuite: {
          id: 'suite',
          version: '1.0.0',
          ref: 'fixture://suite',
          groundTruth: 'independent rubric',
          adversarialCases: ['noisy-diff'],
        },
        metrics: [...REQUIRED_CODE_REVIEW_METRICS],
        candidates: [
          {
            id: 'internal',
            kind: 'internal',
            version: 'main',
            provenance: 'in-repo review stack',
          },
          {
            id: 'challenger',
            kind: 'open-source',
            version: 'v0.0.0',
            provenance: 'fixture repo',
            identityVerified: false,
          },
        ],
        decision: {
          id: 'd1',
          state: 'retain-internal-only',
          scope: 'capability-benchmark-run',
          expectedEconomics: 'status quo',
          dependencyRisk: 'none',
          reversibility: 'reversible',
          reEvaluateTrigger: 'first run completes',
          decidedAt: '2026-09-26T00:00:00Z',
          expiresAt: '2026-12-26T00:00:00Z',
        },
      },
    ],
    sourcingStates: [...SOURCING_STATES],
    capacity: { preemptible: true, revenuePathBlockers: ['JOV-5911'] },
  };
}

test('shipped registry validates', () => {
  const registry = loadRegistry();
  assert.equal(validateBenchmarkRegistry(registry), true);
  assert.equal(registry.issue, 'JOV-2966');
  assert.equal(registry.evidenceLifecycleIssue, 'JOV-5916');
  assert.match(registryDigest(registry), /^[a-f0-9]{64}$/u);
});

test('rejects wrong schema and second ledger', () => {
  assert.throws(() => validateBenchmarkRegistry({}), /schema/);
  const registry = baseRegistry();
  registry.secondLedger = true;
  assert.throws(() => validateBenchmarkRegistry(registry), /second/);
});

test('rejects clock sweeps', () => {
  const registry = baseRegistry();
  registry.triggerPolicy.clockSweep = true;
  assert.throws(() => validateBenchmarkRegistry(registry), /clockSweep/);
  assert.equal(
    classifyTriggerEvent({ class: 'clock-sweep' }).disposition,
    'reject'
  );
  assert.equal(
    classifyTriggerEvent({ class: 'periodic-review' }).disposition,
    'reject'
  );
});

test('material events trigger; unclassed events accumulate by signature', () => {
  assert.equal(
    classifyTriggerEvent({
      class: 'external-capability-discovered',
      summary: 'new review agent released',
    }).disposition,
    'material'
  );
  const noSummary = classifyTriggerEvent({
    class: 'external-capability-discovered',
  });
  assert.equal(noSummary.disposition, 'reject');
  assert.equal(
    classifyTriggerEvent({ semanticSignature: 'vendor-x:code-review' })
      .disposition,
    'accumulate'
  );
  assert.equal(classifyTriggerEvent({}).disposition, 'reject');
});

test('code-review domain enforces required metrics and candidate mix', () => {
  const missingMetric = baseRegistry();
  missingMetric.domains[0].metrics = missingMetric.domains[0].metrics.slice(1);
  assert.throws(() => validateBenchmarkRegistry(missingMetric), /metrics/);

  const noExternal = baseRegistry();
  noExternal.domains[0].candidates = [
    noExternal.domains[0].candidates[0],
    { ...noExternal.domains[0].candidates[0], id: 'internal-2' },
  ];
  assert.throws(() => validateBenchmarkRegistry(noExternal), /challenger/);

  const noInternal = baseRegistry();
  noInternal.domains[0].candidates = [
    noInternal.domains[0].candidates[1],
    { ...noInternal.domains[0].candidates[1], id: 'challenger-2' },
  ];
  assert.throws(() => validateBenchmarkRegistry(noInternal), /internal/);
});

test('unverified external identity fails once the run completes', () => {
  const registry = baseRegistry();
  registry.domains[0].status = 'run-complete';
  assert.throws(() => validateBenchmarkRegistry(registry), /identityVerified/);
  registry.domains[0].candidates[1].identityVerified = true;
  assert.equal(validateBenchmarkRegistry(registry), true);
});

test('sourcing state must be a bounded state', () => {
  const registry = baseRegistry();
  registry.domains[0].decision.state = 'vibe';
  assert.throws(() => validateBenchmarkRegistry(registry), /state/);
});

test('only founder-judgment scopes reach the Ovi inbox', () => {
  assert.equal(
    requiresOviCertification({ scope: 'portfolio-allocation-change' }),
    true
  );
  assert.equal(
    requiresOviCertification({ scope: 'new-product-or-company' }),
    true
  );
  assert.equal(
    requiresOviCertification({ scope: 'capability-benchmark-run' }),
    false
  );
  assert.equal(requiresOviCertification(null), true);
});

test('decisions expire and supersede explicitly', () => {
  const decision = {
    expiresAt: '2026-12-26T00:00:00Z',
  };
  assert.equal(isDecisionStale(decision, '2026-12-25T00:00:00Z'), false);
  assert.equal(isDecisionStale(decision, '2026-12-27T00:00:00Z'), true);
  assert.equal(
    isDecisionStale(
      { ...decision, supersededBy: 'd2' },
      '2026-09-26T00:00:00Z'
    ),
    true
  );
  assert.throws(() => isDecisionStale(decision, 'not-a-date'), /UTC/);
});

test('shadow replay requires same cohort and certified outcome comparison', () => {
  const good = {
    cohortId: 'c1',
    cohortVersion: '1.0.0',
    contenders: [{ role: 'internal' }, { role: 'open-source' }],
    routeComparison: { divergence: 0.1 },
    outcomeComparison: { certifiedOutcomeDelta: 0.02 },
  };
  assert.deepEqual(validateShadowReplayReceipt(good), []);
  const matchOnly = { ...good, recommendationMatchOnly: true };
  assert.ok(validateShadowReplayReceipt(matchOnly).length > 0);
  const noOutcome = { ...good, outcomeComparison: undefined };
  assert.ok(
    validateShadowReplayReceipt(noOutcome).some(e => e.includes('outcome'))
  );
  const noChallenger = { ...good, contenders: [{ role: 'internal' }] };
  assert.ok(validateShadowReplayReceipt(noChallenger).length > 0);
});

test('capacity receipt proves preemptible, non-displacing lane', () => {
  const good = {
    schema: CAPACITY_RECEIPT_SCHEMA,
    preemptible: true,
    eligibleBlockersDisplaced: [],
    recordedAt: '2026-09-26T00:00:00Z',
  };
  assert.deepEqual(validateCapacityReceipt(good), []);
  const displaced = { ...good, eligibleBlockersDisplaced: ['JOV-5911'] };
  assert.ok(validateCapacityReceipt(displaced).length > 0);
  const notPreemptible = { ...good, preemptible: false };
  assert.ok(validateCapacityReceipt(notPreemptible).length > 0);
});
