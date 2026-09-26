import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { JEV_ABSTAIN_LABEL, prepareJevRequest } from './jev-gateway.mjs';
import {
  buildReleaseTaskInput,
  classifyReleaseTask,
  decisionFromReceipt,
  decodeReleaseTaskCorpus,
  evaluateReleaseTaskCorpus,
  normalizeClusters,
  PREDECLARED_LIMITS,
  summarizeEvalRows,
  validateReleaseTaskCorpus,
} from './jev-release-task.mjs';

const CLUSTERS = [
  { slug: 'editorial-pitching', displayName: 'Editorial Pitching' },
  { slug: 'dj-promotion' },
  'radio-xm',
];
const corpus = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL('./fixtures/release-task-corpus.v1.json', import.meta.url)
    ),
    'utf8'
  )
);
const digests = { sourceSha: 'a'.repeat(40), artifactSha256: 'b'.repeat(64) };
const admitted = fp => ({
  approval: {
    fingerprint: fp,
    dataApproved: true,
    fundingApproved: true,
    expiresAt: 2000,
    authorityRef: 'test-only',
    availableUsd: 1,
    maxUsd: 0.01,
    estimatedUpperBoundUsd: 0.001,
  },
  readCurrentFingerprint: () => fp,
  now: () => 1000,
});
const jevResult = choice => async () => ({
  answers: { alignment: { type: 'choice', choice } },
  response: { modelId: 'typesafe-ai/jev', headers: {} },
  usage: { inputTokens: 40, outputTokens: 1 },
  warnings: [],
});
const synthCorpus = {
  ...corpus,
  examples: corpus.clusterAllowlist.flatMap((_, i) => [
    ...Array.from({ length: 6 }, (_, k) => `${i}|0|||t${i}-${k}`),
    ...Array.from({ length: 4 }, (_, k) => `${i}|1|||h${i}-${k}`),
  ]),
};

test('contract: bounded input, frozen allowlist, abstain on every non-fit', async () => {
  const n = normalizeClusters([
    ...CLUSTERS,
    CLUSTERS[0],
    { slug: 'Bad' },
    null,
  ]);
  assert.deepEqual(n.map(c => c.slug), [
    'editorial-pitching',
    'dj-promotion',
    'radio-xm',
  ]);

  const long = buildReleaseTaskInput({
    ...digests,
    taskText: 'x'.repeat(5000),
    clusters: CLUSTERS,
  });
  assert.ok(long.state.length < 2200);
  assert.match(long.state, /untrusted data/);
  assert.equal(long.decision.labels.length, 3);
  assert.ok(prepareJevRequest(long).fingerprint);

  // Empty text or zero clusters never reach the evaluator.
  for (const task of [
    { taskText: '', clusters: CLUSTERS },
    { taskText: 'real task', clusters: [] },
    null,
  ]) {
    let calls = 0;
    const d = await classifyReleaseTask(task, {
      transport: async () => (calls++, null),
    });
    assert.equal(calls, 0);
    assert.equal(d.status, 'skipped');
    assert.equal(d.abstained, true);
  }

  const task = {
    ...digests,
    taskText: 'Pitch to Spotify editorial',
    clusters: CLUSTERS,
  };
  const fp = prepareJevRequest(buildReleaseTaskInput(task)).fingerprint;
  const picked = await classifyReleaseTask(task, {
    ...admitted(fp),
    transport: jevResult('editorial-pitching'),
  });
  assert.equal(picked.clusterSlug, 'editorial-pitching');
  for (const [choice, want] of [
    [JEV_ABSTAIN_LABEL, 'evaluated'],
    ['invented-cluster', 'invalid-response'],
  ]) {
    const d = await classifyReleaseTask(task, {
      ...admitted(fp),
      transport: jevResult(choice),
    });
    assert.equal(d.status, want);
    assert.equal(d.abstained, true);
    assert.equal(d.clusterSlug, null);
  }
  const denied = await classifyReleaseTask(task, {
    readCurrentFingerprint: () => fp,
  });
  assert.equal(denied.status, 'not-admitted');
  let calls = 0;
  const screened = await classifyReleaseTask(
    { taskText: 'mail artist@example.com', clusters: CLUSTERS, ...digests },
    { transport: async () => (calls++, null) }
  );
  assert.equal(calls, 0);
  assert.equal(screened.status, 'invalid-input');

  // Non-evaluated or out-of-set outcomes abstain.
  for (const status of ['stale', 'timeout', 'cancelled', 'provider-error']) {
    const d = decisionFromReceipt(
      { status, alignment: 'editorial-pitching' },
      CLUSTERS
    );
    assert.equal(d.clusterSlug, null);
  }
  assert.equal(decisionFromReceipt(null, CLUSTERS).status, 'provider-error');
  assert.equal(
    decisionFromReceipt({ status: 'evaluated', alignment: 'lyrics' }, CLUSTERS)
      .abstained,
    true
  );
});

test('corpus fixture is valid, covers required cases, honestly below floor', async () => {
  assert.equal(corpus.schema, 'jev-release-task-corpus/v1');
  assert.equal(corpus.version, 'v1');
  assert.deepEqual(validateReleaseTaskCorpus(corpus), []);
  const ex = decodeReleaseTaskCorpus(corpus);
  assert.ok(ex.length >= 40 && ex.length < PREDECLARED_LIMITS.minExamples);
  assert.equal(ex[0].id, 'rt-0001');
  for (const tag of corpus.tags)
    assert.ok(ex.some(e => e.tags.includes(tag)), `covers ${tag}`);
  assert.ok(ex.some(e => e.clusters !== null));
  const r = await evaluateReleaseTaskCorpus(corpus, {
    classify: async ({ example }) => ({
      status: 'evaluated',
      clusterSlug: example.expected,
    }),
  });
  assert.equal(r.disposition, 'inconclusive');
});

test('corpus validation rejects malformed corpora', () => {
  assert.deepEqual(validateReleaseTaskCorpus(null), ['corpus object required']);
  const row = '0|0|||x';
  for (const delta of [
    { schema: 'x' },
    { version: 'v2' },
    { fields: [] },
    { tags: [] },
    { examples: [row, 42] },
    { examples: [row, '99|1|||y'] },
    { examples: [row, '0|3|||y'] },
    { examples: [row, '0|1|99||y'] },
    { examples: [row, '0|1||99|y'] },
    { examples: [row, '0|1||| '] },
  ])
    assert.ok(validateReleaseTaskCorpus({ ...corpus, ...delta }).length > 0);
});

test('shadow eval receipt and dispositions', async () => {
  const perfect = await evaluateReleaseTaskCorpus(synthCorpus, {
    classify: async ({ clusters, example }) => ({
      status: 'evaluated',
      clusterSlug: clusters.includes(example.expected)
        ? example.expected
        : null,
      inputTokens: 40,
      outputTokens: 1,
      billedCostUsd: 0.000001,
    }),
  });
  assert.equal(perfect.schema, 'jev-release-task-eval-receipt/v1');
  assert.equal(perfect.shadowOnly, true);
  assert.equal(perfect.certified, false);
  assert.equal(perfect.disposition, 'promote-candidate');
  assert.equal(perfect.metrics.heldOut.falseAssignmentRate, 0);
  assert.ok(perfect.metrics.heldOut.attributableCostUsd > 0);

  assert.equal(
    (await evaluateReleaseTaskCorpus({ schema: 'x' })).disposition,
    'blocked'
  );
  const echo = async ({ example }) => ({
    status: 'evaluated',
    clusterSlug: example.expected,
  });
  const tiny = { ...synthCorpus, examples: synthCorpus.examples.slice(0, 10) };
  assert.equal(
    (await evaluateReleaseTaskCorpus(tiny, { classify: echo })).disposition,
    'inconclusive'
  );
  let i = 0;
  assert.equal(
    (
      await evaluateReleaseTaskCorpus(synthCorpus, {
        classify: async ({ example }) =>
          ++i % 2 === 0
            ? { status: 'provider-error', clusterSlug: null }
            : { status: 'evaluated', clusterSlug: example.expected },
      })
    ).disposition,
    'inconclusive'
  );
  assert.equal(
    (
      await evaluateReleaseTaskCorpus(synthCorpus, {
        classify: async () => ({
          status: 'evaluated',
          clusterSlug: 'editorial-pitching',
        }),
      })
    ).disposition,
    'blocked'
  );
  for (const classify of [
    async () => ({ status: 'evaluated', clusterSlug: null }),
    async () => ({ status: 'evaluated', clusterSlug: 'invented' }),
    async () => {
      throw new Error('down');
    },
  ]) {
    const r = await evaluateReleaseTaskCorpus(synthCorpus, { classify });
    assert.equal(r.metrics.heldOut.abstentionRate, 1);
  }
  assert.equal(
    (
      await evaluateReleaseTaskCorpus(synthCorpus, {
        classify: async () => ({ status: 'evaluated', clusterSlug: null }),
      })
    ).disposition,
    'retain'
  );
});

test('summarizeEvalRows computes class metrics, latency and null usage', () => {
  const m = summarizeEvalRows([
    {
      expected: 'a',
      predicted: 'a',
      evaluated: true,
      latencyMs: 10,
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0.1,
    },
    { expected: 'a', predicted: 'b', evaluated: true, latencyMs: 20 },
    {
      expected: 'b',
      predicted: null,
      abstained: true,
      evaluated: true,
      latencyMs: 30,
    },
    { expected: null, predicted: 'a', evaluated: false, latencyMs: 40 },
    {
      expected: null,
      predicted: null,
      abstained: true,
      evaluated: true,
      latencyMs: 50,
    },
  ]);
  assert.equal(m.evaluated, 4);
  assert.equal(m.falseAssignmentRate, 2 / 5);
  assert.equal(m.correctionRate, 3 / 5);
  assert.equal(m.perClass.a.precision, 1 / 2);
  assert.equal(m.perClass.b.recall, 0);
  assert.equal(m.p50LatencyMs, 30);
  assert.equal(m.p95LatencyMs, 50);
});
