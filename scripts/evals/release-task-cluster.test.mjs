import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { JEV_ROUTE, prepareJevRequest } from '../invariants/jev-gateway.mjs';
import {
  freezeClusterAllowlist,
  prepareTaskClusterDecision,
  runTaskClusterDecision,
} from '../invariants/jev-task-cluster.mjs';
import {
  buildCorpus,
  computeMetrics,
  dispositionFor,
  runEval,
} from './release-task-cluster.mjs';

const CLUSTERS = [
  { slug: 'rights-royalty-registration', displayName: 'Rights & Royalties' },
  { slug: 'editorial-pitching', displayName: 'Editorial Pitching' },
];
const base = {
  taskText: 'register the song splits with my PRO',
  clusters: CLUSTERS,
  sourceSha: 'a'.repeat(40),
  artifactSha256: 'b'.repeat(64),
};
const transport = choice => async () => ({
  answers: { alignment: { type: 'choice', choice } },
  response: { modelId: JEV_ROUTE.model },
});
const opts = (input, choice, extra = {}) => {
  const fingerprint = prepareJevRequest(input).fingerprint;
  return {
    approval: {
      fingerprint,
      dataApproved: true,
      fundingApproved: true,
      expiresAt: 2000,
      authorityRef: 'test-only',
      availableUsd: 1,
      maxUsd: 0.01,
      estimatedUpperBoundUsd: 0.001,
    },
    readCurrentFingerprint: () => fingerprint,
    now: () => 1000,
    transport: transport(choice),
    ...extra,
  };
};

test('frozen allowlist, abstain-first decisions and evaluator-free short-circuits', async () => {
  assert.throws(() => freezeClusterAllowlist(CLUSTERS).push({ slug: 'x' }));
  assert.throws(() => freezeClusterAllowlist([{ slug: 'a' }, { slug: 'a' }]));
  const p = prepareTaskClusterDecision(base);
  assert.throws(() => p.labels.push('late'));
  const hit = await runTaskClusterDecision(
    base,
    opts(p.input, 'editorial-pitching')
  );
  assert.equal(hit.decision, 'cluster');
  assert.equal(hit.clusterSlug, 'editorial-pitching');
  assert.equal(hit.confidence, null);
  assert.equal(hit.autoAssignEligible, false);
  let calls = 0;
  const dead = async () => (calls++, Promise.reject(new Error('no call')));
  for (const delta of [
    { taskText: '' },
    { taskText: null },
    { clusters: [] },
  ]) {
    assert.equal(
      (await runTaskClusterDecision({ ...base, ...delta }, { transport: dead }))
        .decision,
      'abstain'
    );
  }
  assert.equal(calls, 0);
  for (const [extra, reason] of [
    [{ transport: transport('unclassified') }, 'no-clear-fit'],
    [{ approval: null }, 'evaluator-not-admitted'],
    [{ transport: transport('made-up-slug') }, 'evaluator-invalid-response'],
  ]) {
    const d = await runTaskClusterDecision(base, {
      ...opts(p.input, 'lyrics'),
      ...extra,
    });
    assert.equal(d.reason, reason);
  }
  // A single offered cluster still goes through the evaluator.
  const one = { ...base, clusters: [CLUSTERS[0]] };
  const d = await runTaskClusterDecision(one, {
    ...opts(prepareTaskClusterDecision(one).input, 'unclassified'),
    transport: async r => (calls++, transport('unclassified')(r)),
  });
  assert.equal(calls, 1);
  assert.equal(d.decision, 'abstain');
});

const corpus = buildCorpus();

test('corpus is deterministic, hash-pinned and split with tag coverage', () => {
  assert.equal(buildCorpus().corpusSha256, corpus.corpusSha256);
  const { corpusSha256, ...rest } = corpus;
  assert.equal(
    createHash('sha256').update(JSON.stringify(rest)).digest('hex'),
    corpusSha256
  );
  assert.ok(corpus.examples.length >= 200 && corpus.examples.length <= 500);
  const tags = { tuning: new Set(), heldout: new Set() };
  for (const e of corpus.examples) {
    e.tags.forEach(t => tags[e.split].add(t));
    assert.ok(['tuning', 'heldout'].includes(e.split));
  }
  for (const tag of [
    'clean',
    'typo',
    'ambiguous',
    'off-topic',
    'multi-plausible',
    'changed-cluster-set',
    'injection',
  ]) {
    assert.ok(tags.tuning.has(tag) && tags.heldout.has(tag), tag);
  }
});

test('stub run reports metrics and stays inconclusive; disposition gates hold', async () => {
  const r = await runEval(corpus, { mode: 'stub' });
  assert.equal(r.disposition, 'inconclusive');
  assert.equal(r.metrics.total, corpus.examples.length);
  assert.equal(r.metrics.protectedViolations, 0);
  assert.ok(r.metrics.assigned > 0 && r.metrics.abstained > 0);
  const good = {
    protectedViolations: 0,
    falseAutoAssignRate: 0.01,
    macroRecall: 0.9,
    macroPrecision: 0.9,
  };
  assert.equal(dispositionFor(good, corpus, 'gateway')[0], 'promote-candidate');
  assert.equal(
    dispositionFor({ ...good, protectedViolations: 1 }, corpus, 'gateway')[0],
    'blocked'
  );
  assert.equal(
    dispositionFor({ ...good, macroRecall: 0.5 }, corpus, 'gateway')[0],
    'retain'
  );
  const row = (id, expected, tags, clusterSlug) => ({
    example: { id, expected, tags },
    decision: { schema: 'jev-task-cluster/v1', clusterSlug },
    latencyMs: 1,
  });
  const m = computeMetrics(
    [
      row('a', 'lyrics', ['clean'], 'lyrics'),
      row('b', null, ['off-topic'], 'lyrics'),
    ],
    { a: 'lyrics', b: null }
  );
  assert.equal(m.falseAutoAssign, 1);
  assert.equal(m.protectedViolations, 1);
  assert.equal(m.correctionRate, 0.5);
});
