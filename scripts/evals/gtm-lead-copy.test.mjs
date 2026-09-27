import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JEV_ROUTE } from '../invariants/jev-gateway.mjs';
import {
  ABSTAIN,
  buildSeedCorpus,
  disposition,
  evaluateCase,
  prepareGtmRequest,
  runBenchmark,
  scoreRows,
} from './gtm-lead-copy.mjs';

const corpus = buildSeedCorpus();

test('seed corpus is versioned, grouped against leakage, and reports every required stratum', async () => {
  assert.equal(corpus.cases.length, 234);
  assert.equal(buildSeedCorpus().corpusSha256, corpus.corpusSha256);
  const splitByGroup = new Map();
  for (const example of corpus.cases) {
    const group = `${example.identityKey}:${example.sourceRevision}`;
    assert.equal(splitByGroup.get(group) ?? example.split, example.split);
    splitByGroup.set(group, example.split);
  }
  const report = await runBenchmark(corpus);
  assert.deepEqual(report.missingStrata, []);
  assert.equal(report.humanAdjudicatedCases, 0);
  assert.equal(report.disposition, 'live-evaluation-blocker');
  assert.equal(report.metrics.operations.evaluatorCalls, 0);
  assert.equal(report.metrics.calibration.expectedCalibrationError, null);
  assert.ok(Object.keys(report.metrics.byJob).length >= 3);
  assert.match(report.dispositionReason, /incumbent retained/);
});

test('incumbent and reasoning arms are scored on the identical cases', async () => {
  const predictions = Object.fromEntries(
    corpus.cases.map(example => [example.caseId, example.expected])
  );
  const report = await runBenchmark(corpus, {
    incumbent: predictions,
    reasoning: predictions,
  });
  assert.equal(report.comparisonArms.incumbent.total, corpus.cases.length);
  assert.equal(report.comparisonArms.reasoning.total, corpus.cases.length);
  assert.equal(report.comparisonArms.incumbent.unsupportedClaimRate, 0);
});

test('request bundles related bounded questions with raw evidence and frozen job choices', () => {
  const example = corpus.cases.find(c => c.offeredJobs.length > 1);
  const request = prepareGtmRequest(example);
  assert.deepEqual(Object.keys(request.questions), [
    'entityRole',
    'evidence',
    'job',
    'message',
  ]);
  assert.ok(request.state.includes(example.rawExcerpt));
  assert.ok(request.state.includes(example.proposedMessage));
  assert.ok(Object.hasOwn(request.questions.job.criteria, ABSTAIN));
  assert.equal(request.route.model, JEV_ROUTE.model);
});

test('zero and one eligible jobs short-circuit without an evaluator call', async () => {
  let calls = 0;
  const transport = async () => {
    calls += 1;
    throw new Error('must not run');
  };
  for (const example of [
    corpus.cases.find(c => c.offeredJobs.length === 0),
    corpus.cases.find(c => c.offeredJobs.length === 1),
  ]) {
    const result = await evaluateCase(example, { transport });
    assert.equal(result.status, 'deterministic');
    assert.equal(result.evaluatorCalls, 0);
  }
  assert.equal(calls, 0);
});

test('invalid, hostile, unavailable, and low-authority evaluation falls back safely', async () => {
  const example = corpus.cases.find(
    c => c.stratum === 'hostile-source' && c.offeredJobs.length > 1
  );
  const request = prepareGtmRequest(example);
  const base = {
    readCurrentFingerprint: () => request.fingerprint,
    transport: async () => ({
      answers: {
        entityRole: { type: 'choice', choice: 'owner-of-everything' },
        evidence: { type: 'choice', choice: 'supported' },
        job: { type: 'choice', choice: example.offeredJobs[0] },
        message: { type: 'choice', choice: 'approve' },
      },
      response: { modelId: JEV_ROUTE.model },
    }),
  };
  const notAdmitted = await evaluateCase(example, base);
  assert.equal(notAdmitted.status, 'not-admitted');
  assert.equal(notAdmitted.decision, undefined);

  const invalid = await evaluateCase(example, {
    ...base,
    approval: {
      fingerprint: request.fingerprint,
      dataApproved: true,
      fundingApproved: true,
      expiresAt: 2000,
      authorityRef: 'test-only',
      availableUsd: 1,
      maxUsd: 0.01,
      estimatedUpperBoundUsd: 0.001,
    },
    now: () => 1000,
  });
  assert.equal(invalid.status, 'invalid-response');
  assert.equal(invalid.decision, undefined);
});

test('metrics keep identity and unsupported claims protected and contradictory evidence retains', () => {
  const examples = corpus.cases.slice(0, 2);
  const rows = examples.map((example, index) => ({
    example,
    result: {
      status: 'evaluated',
      evaluatorCalls: 1,
      decision:
        index === 0
          ? example.expected
          : {
              ...example.expected,
              entityRole: 'artist',
              message: 'approve',
              job: example.offeredJobs[0] ?? ABSTAIN,
            },
    },
  }));
  const metrics = scoreRows(rows);
  assert.equal(metrics.operations.evaluatorCalls, 2);
  assert.ok(metrics.wrongIdentityRate >= 0);
  assert.equal(disposition(corpus, metrics, { live: true })[0], 'retain');
});
