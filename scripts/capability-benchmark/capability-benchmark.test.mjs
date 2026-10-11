import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCorpus as buildInboxCorpus } from '../invariants/fixtures/inbox-triage-corpus.gen.mjs';
import { buildCorpus as buildReleaseCorpus } from '../invariants/fixtures/release-task-corpus.gen.mjs';
import { summarizeOutcomes as summarizeInbox } from '../invariants/jev-inbox-pilot.mjs';
import { summarizeOutcomes as summarizeRelease } from '../invariants/jev-task-pilot.mjs';
import {
  BENCHMARK_REGISTRY_SCHEMA,
  CAPACITY_RECEIPT_SCHEMA,
  classifyTriggerEvent,
  DECISION_BENCHMARK_DIMENSIONS,
  isDecisionStale,
  loadDecisionRoutingBenchmark,
  loadRegistry,
  MATERIAL_TRIGGER_CLASSES,
  REQUIRED_CODE_REVIEW_METRICS,
  registryDigest,
  requiresOviCertification,
  SOURCING_STATES,
  validateBenchmarkRegistry,
  validateCapacityReceipt,
  validateDecisionRoutingBenchmark,
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

test('JOV-7341 records workload-scoped dispositions on the pinned cohorts', () => {
  const report = loadDecisionRoutingBenchmark();
  assert.equal(validateDecisionRoutingBenchmark(report), true);
  assert.equal(Object.hasOwn(report, 'aggregateScore'), false);
  const generated = new Map(
    [buildReleaseCorpus(), buildInboxCorpus()].map(corpus => [
      corpus.version,
      registryDigest(corpus),
    ])
  );
  for (const workload of report.workloads) {
    assert.equal(
      generated.get(workload.cohort.version),
      workload.cohort.sha256
    );
    assert.deepEqual(
      Object.keys(workload.evidenceByDimension).sort(),
      [...DECISION_BENCHMARK_DIMENSIONS].sort()
    );
    assert.equal(workload.sourcingDecision.state, 'retain-internal-only');
    const baseline = workload.candidates.find(
      candidate => candidate.id === 'deterministic-baseline'
    );
    const corpus =
      workload.id === 'release-task-clustering'
        ? buildReleaseCorpus()
        : buildInboxCorpus();
    const outcomes = corpus.examples.map(example => ({
      id: example.id,
      decision:
        workload.id === 'release-task-clustering'
          ? { action: 'abstain', clusterSlug: null }
          : { action: 'abstain', category: null, priority: null },
      latencyMs: 0,
      executed: false,
    }));
    if (workload.id === 'release-task-clustering') {
      const metrics = summarizeRelease(corpus, outcomes, {}, {});
      assert.equal(baseline.evaluated, metrics.evaluated);
      assert.equal(baseline.macroF1, metrics.macroF1);
      assert.equal(baseline.abstentionRate, metrics.abstentionRate);
      assert.equal(
        baseline.falseAutoAssignmentRate,
        metrics.falseAutoAssignmentRate
      );
    } else {
      const metrics = summarizeInbox(corpus, outcomes, {}, {});
      assert.equal(baseline.evaluated, metrics.evaluated);
      assert.equal(baseline.macroF1, metrics.macroF1);
      assert.equal(baseline.abstentionRate, metrics.abstentionRate);
      assert.equal(baseline.highValueMissRate, metrics.highValueMissRate);
    }
  }
});

test('JOV-7341 fails closed on cohort drift, hidden calls, or missing resume event', () => {
  const report = loadDecisionRoutingBenchmark();
  const drifted = structuredClone(report);
  drifted.workloads[0].candidates[1].cohortSha256 = '0'.repeat(64);
  assert.throws(
    () => validateDecisionRoutingBenchmark(drifted),
    /different cohort/
  );

  const hiddenCall = structuredClone(report);
  hiddenCall.workloads[0].bypass.oneOption.probabilisticCalls = 1;
  assert.throws(
    () => validateDecisionRoutingBenchmark(hiddenCall),
    /zero calls/
  );

  const noResume = structuredClone(report);
  delete noResume.access.resumeEvent;
  assert.throws(
    () => validateDecisionRoutingBenchmark(noResume),
    /resumeEvent/
  );

  const rolledUp = structuredClone(report);
  rolledUp.aggregateScore = 0.99;
  assert.throws(() => validateDecisionRoutingBenchmark(rolledUp), /aggregate/);

  for (const companyWinner of [false, null, '', 0, 'openai-decisions']) {
    const companyWide = { ...structuredClone(report), companyWinner };
    assert.throws(
      () => validateDecisionRoutingBenchmark(companyWide),
      /company-wide winner/
    );
  }

  const wrongIssue = structuredClone(report);
  wrongIssue.issue = 'JOV-2966';
  assert.throws(
    () => validateDecisionRoutingBenchmark(wrongIssue),
    /must be JOV-7341/
  );
});

test('JOV-7341 fails closed on contradictory candidate status and counts', () => {
  const report = loadDecisionRoutingBenchmark();

  const promoted = structuredClone(report);
  const promotedJev = promoted.workloads[0].candidates.find(
    candidate => candidate.id === 'typesafe-jev'
  );
  promotedJev.status = 'production';
  promotedJev.executedComparisons = 999;
  assert.throws(
    () => validateDecisionRoutingBenchmark(promoted),
    /status must be one of/
  );

  const blockedButRan = structuredClone(report);
  blockedButRan.workloads[0].candidates.find(
    candidate => candidate.id === 'openai-decisions'
  ).executedComparisons = 3;
  assert.throws(
    () => validateDecisionRoutingBenchmark(blockedButRan),
    /executedComparisons: 0/
  );

  const shadowRan = structuredClone(report);
  shadowRan.workloads[1].candidates.find(
    candidate => candidate.id === 'typesafe-jev'
  ).executedComparisons = 1;
  assert.throws(
    () => validateDecisionRoutingBenchmark(shadowRan),
    /executedComparisons: 0/
  );

  const missingCount = structuredClone(report);
  delete missingCount.workloads[0].candidates.find(
    candidate => candidate.id === 'typesafe-jev'
  ).executedComparisons;
  assert.throws(
    () => validateDecisionRoutingBenchmark(missingCount),
    /executedComparisons: 0/
  );

  const baselineRan = structuredClone(report);
  baselineRan.workloads[0].candidates.find(
    candidate => candidate.id === 'deterministic-baseline'
  ).executedComparisons = 1;
  assert.throws(
    () => validateDecisionRoutingBenchmark(baselineRan),
    /must not execute supplier comparisons/
  );

  const duplicated = structuredClone(report);
  duplicated.workloads[0].candidates.push(
    structuredClone(duplicated.workloads[0].candidates[1])
  );
  assert.throws(
    () => validateDecisionRoutingBenchmark(duplicated),
    /duplicate ids/
  );

  const completedWithoutEvidence = structuredClone(report);
  const completedJev = completedWithoutEvidence.workloads[0].candidates.find(
    candidate => candidate.id === 'typesafe-jev'
  );
  completedJev.status = 'complete';
  assert.throws(
    () => validateDecisionRoutingBenchmark(completedWithoutEvidence),
    /positive integer/
  );

  completedJev.executedComparisons = 1;
  assert.equal(
    validateDecisionRoutingBenchmark(completedWithoutEvidence),
    true
  );
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
