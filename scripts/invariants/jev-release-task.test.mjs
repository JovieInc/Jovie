import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JEV_ROUTE } from './jev-gateway.mjs';
import {
  prepareReleaseTaskRequest,
  releaseTaskCriteria,
  runReleaseTaskClassification,
  UNCLASSIFIED,
} from './jev-release-task.mjs';

const CLUSTERS = [
  { slug: 'editorial-pitching', displayName: 'Editorial Pitching' },
  { slug: 'dj-promotion', displayName: 'DJ Promotion' },
];
const input = { taskText: 'Pitch the single to Spotify', clusters: CLUSTERS };
const request = prepareReleaseTaskRequest(input);
const result = (choice, probabilities) => ({
  answers: {
    cluster: {
      type: 'choice',
      choice,
      ...(probabilities && { probabilities }),
    },
  },
  response: { modelId: JEV_ROUTE.model },
  usage: {},
  warnings: [],
});
const options = (extra = {}) => ({
  approval: {
    fingerprint: request.fingerprint,
    dataApproved: true,
    fundingApproved: true,
    expiresAt: 2000,
    authorityRef: 't',
    availableUsd: 1,
    maxUsd: 0.01,
  },
  transport: async () =>
    result('editorial-pitching', { 'editorial-pitching': 0.9 }),
  now: () => 1000,
  ...extra,
});

test('frozen allowlist, abstain label, invalid slugs and screened text', () => {
  const c = releaseTaskCriteria(CLUSTERS);
  assert.ok(Object.isFrozen(c) && Object.hasOwn(c, UNCLASSIFIED));
  for (const bad of [
    [],
    [{ slug: 'Bad!', displayName: 'x' }],
    [{ slug: UNCLASSIFIED, displayName: 'x' }],
    [
      { slug: 'a', displayName: 'x' },
      { slug: 'a', displayName: 'y' },
    ],
  ])
    assert.throws(() => releaseTaskCriteria(bad));
  assert.throws(() =>
    prepareReleaseTaskRequest({ ...input, taskText: 'me@x.com' })
  );
  assert.throws(() =>
    prepareReleaseTaskRequest({ ...input, taskText: 'x'.repeat(4001) })
  );
});

test('empty input and zero clusters abstain with no evaluator call', async () => {
  let calls = 0;
  const transport = async () => {
    calls++;
    return result('a');
  };
  for (const bad of [
    null,
    { taskText: ' ', clusters: CLUSTERS },
    { taskText: 'x', clusters: [] },
  ]) {
    const r = await runReleaseTaskClassification(bad, options({ transport }));
    assert.equal(r.status, 'not-applicable');
    assert.equal(r.decision.abstained, true);
  }
  assert.equal(calls, 0);
});

test('single cluster still requires a fit decision, never auto-assigns', async () => {
  const one = {
    taskText: 'reconcile the ledger',
    clusters: CLUSTERS.slice(0, 1),
  };
  const req = prepareReleaseTaskRequest(one);
  const r = await runReleaseTaskClassification(
    one,
    options({
      approval: {
        fingerprint: req.fingerprint,
        dataApproved: true,
        fundingApproved: true,
        expiresAt: 2000,
        authorityRef: 't',
        availableUsd: 1,
        maxUsd: 0.01,
      },
      transport: async () => result(UNCLASSIFIED, { [UNCLASSIFIED]: 0.9 }),
    })
  );
  assert.equal(r.status, 'evaluated');
  assert.equal(r.decision.clusterSlug, null);
  assert.equal(r.decision.confidence, 0.9);
  assert.equal(r.decision.confidenceBasis, 'choice-probability');
});

test('evaluated binds slug and confidence; stays advisory and frozen', async () => {
  const r = await runReleaseTaskClassification(input, options());
  assert.equal(r.status, 'evaluated');
  assert.equal(r.decision.clusterSlug, 'editorial-pitching');
  assert.equal(r.certified, false);
  assert.equal(r.billedCostUsd, null);
  assert.throws(() => {
    r.certified = true;
  });
  const noDist = await runReleaseTaskClassification(
    input,
    options({ transport: async () => result('dj-promotion') })
  );
  assert.equal(noDist.decision.confidenceBasis, 'none');
});

test('unknown labels, wrong model and warnings cannot create clusters', async () => {
  for (const raw of [
    result('invented'),
    { ...result('a'), response: { modelId: 'openai/x' } },
    { ...result('a'), warnings: [{}] },
    null,
  ])
    assert.equal(
      (
        await runReleaseTaskClassification(
          input,
          options({ transport: async () => raw })
        )
      ).status,
      'invalid-response'
    );
});

test('admission, timeout, cancel and provider failure fail closed', async () => {
  let calls = 0;
  const transport = async () => {
    calls++;
    return result('a');
  };
  for (const approval of [null, { fingerprint: 'old' }])
    assert.equal(
      (
        await runReleaseTaskClassification(
          input,
          options({ approval, transport })
        )
      ).status,
      'not-admitted'
    );
  assert.equal(calls, 0);
  assert.equal(
    (
      await runReleaseTaskClassification(
        input,
        options({ timeoutMs: 5, transport: () => new Promise(() => {}) })
      )
    ).status,
    'timeout'
  );
  const pre = new AbortController();
  pre.abort();
  assert.equal(
    (await runReleaseTaskClassification(input, options({ signal: pre.signal })))
      .status,
    'cancelled'
  );
  assert.equal(
    (
      await runReleaseTaskClassification(
        input,
        options({
          transport: async () => {
            throw new Error('x');
          },
        })
      )
    ).status,
    'provider-error'
  );
  assert.equal(
    (
      await runReleaseTaskClassification(
        { taskText: 'Bearer abcdef123456', clusters: CLUSTERS },
        options()
      )
    ).status,
    'invalid-input'
  );
});
