import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildCorpus } from './fixtures/release-task-corpus.gen.mjs';
import { JEV_ROUTE } from './jev-gateway.mjs';
import {
  buildTaskClusterState,
  classifyReleaseTaskCluster,
  decideTaskClusterAssignment,
  freezeClusterAllowlist,
  interpretTaskCluster,
  prepareTaskClusterRequest,
  TASK_CLUSTER_SCHEMA,
  TASK_CLUSTER_STAGE,
  UNCLASSIFIED_LABEL,
  validateTaskClusterThresholds,
} from './jev-task-classification.mjs';
import { corpusIntegrityReport, loadTaskCorpus } from './jev-task-pilot.mjs';

const CLUSTERS = [
  { slug: 'rights-royalty-registration', displayName: 'Rights & Royalties' },
  { slug: 'editorial-pitching', displayName: 'Editorial Pitching' },
  { slug: 'dj-promotion', displayName: 'DJ Promotion' },
];

const baseInput = {
  sourceSha: 'a'.repeat(40),
  artifactSha256: 'b'.repeat(64),
  scope: 'release-task-corpus test',
  taskText: 'Pitch the track to Spotify editorial',
  clusters: CLUSTERS,
};

const allowlist = freezeClusterAllowlist(CLUSTERS);

function approvalFor(request) {
  return {
    fingerprint: request.fingerprint,
    dataApproved: true,
    fundingApproved: true,
    expiresAt: 2000,
    authorityRef: 'test-only',
    availableUsd: 1,
    maxUsd: 0.01,
    estimatedUpperBoundUsd: 0.001,
  };
}

function transportResult(choice, extra = {}) {
  return {
    answers: {
      classification: {
        type: 'choice',
        choice,
        probabilities: { [choice]: 0.8, [UNCLASSIFIED_LABEL]: 0.2 },
      },
    },
    response: { modelId: JEV_ROUTE.model, headers: { 'x-vercel-id': 'fx-1' } },
    usage: { inputTokens: 40, outputTokens: 6 },
    warnings: [],
    ...extra,
  };
}

test('cluster allowlist is frozen, deduped, sorted and validated', () => {
  assert.deepEqual(allowlist.slugs, [
    'dj-promotion',
    'editorial-pitching',
    'rights-royalty-registration',
  ]);
  assert.match(allowlist.sha256, /^[0-9a-f]{64}$/);
  assert.throws(() => {
    /** @type {any} */ (allowlist.clusters).push({
      slug: 'x',
      displayName: 'x',
    });
  });
  const deduped = freezeClusterAllowlist([...CLUSTERS, CLUSTERS[0]]);
  assert.equal(deduped.slugs.length, 3);
  for (const bad of [
    null,
    [],
    [{ slug: '', displayName: 'x' }],
    [{ slug: 'BAD SLUG', displayName: 'x' }],
    [{ slug: UNCLASSIFIED_LABEL, displayName: 'x' }],
    [{ slug: 'ok-slug', displayName: '' }],
    [{ slug: 'ok-slug', displayName: 'x'.repeat(121) }],
    [{ slug: 'ok-slug' }],
  ]) {
    assert.throws(() => freezeClusterAllowlist(bad));
  }
});

test('classification request binds frozen slugs and untrusted state into the fingerprint', () => {
  const { request } = prepareTaskClusterRequest(baseInput);
  assert.equal(request.schema, TASK_CLUSTER_SCHEMA);
  assert.equal(request.stage, TASK_CLUSTER_STAGE);
  assert.equal(request.allowlistSha256, allowlist.sha256);
  assert.deepEqual(
    Object.keys(request.questions.classification.criteria).sort(),
    [...allowlist.slugs, UNCLASSIFIED_LABEL].sort()
  );
  assert.ok(request.state.includes('<<<task-text'));
  assert.ok(request.state.includes('Pitch the track to Spotify editorial'));
  const other = prepareTaskClusterRequest({
    ...baseInput,
    clusters: [...CLUSTERS, { slug: 'lyrics', displayName: 'Lyrics' }],
  });
  assert.notEqual(other.request.fingerprint, request.fingerprint);
  const renamed = prepareTaskClusterRequest({
    ...baseInput,
    clusters: [
      { slug: 'rights-royalty-registration', displayName: 'Royalties!' },
      ...CLUSTERS.slice(1),
    ],
  });
  assert.notEqual(renamed.request.fingerprint, request.fingerprint);
  assert.throws(() =>
    prepareTaskClusterRequest({ ...baseInput, taskText: '' })
  );
  assert.throws(() =>
    prepareTaskClusterRequest({ ...baseInput, clusters: [] })
  );
  assert.throws(() =>
    prepareTaskClusterRequest({ ...baseInput, sourceSha: 'main' })
  );
  assert.throws(() =>
    prepareTaskClusterRequest({
      ...baseInput,
      taskText: 'contact me at artist@example.com',
    })
  );
  const built = buildTaskClusterState('  pad  ' + 'x'.repeat(5000), allowlist);
  assert.ok(Buffer.byteLength(built) < 16000);
});

test('empty task text and zero clusters never reach the evaluator', async () => {
  let calls = 0;
  const options = {
    transport: async () => {
      calls += 1;
      return transportResult('editorial-pitching');
    },
  };
  for (const input of [
    { ...baseInput, taskText: '' },
    { ...baseInput, taskText: '   ' },
    { ...baseInput, taskText: 42 },
    { ...baseInput, clusters: [] },
    { ...baseInput, clusters: null },
    { ...baseInput, clusters: [{ slug: 'BAD', displayName: 'x' }] },
    { ...baseInput, sourceSha: 'not-a-sha' },
  ]) {
    const receipt = await classifyReleaseTaskCluster(
      /** @type {any} */ (input),
      options
    );
    assert.equal(receipt.status, 'skipped');
    assert.equal(receipt.evaluatorCalls, 0);
    assert.equal(receipt.decision.clusterSlug, null);
    assert.equal(receipt.decision.abstained, true);
  }
  assert.equal(calls, 0);
});

test('a single cluster still requires a fit decision; unrelated text can abstain', async () => {
  const single = [CLUSTERS[0]];
  let calls = 0;
  const unrelated = {
    ...baseInput,
    clusters: single,
    taskText: 'Water the plants',
  };
  const { request: abstainReq } = prepareTaskClusterRequest(unrelated);
  const abstain = await classifyReleaseTaskCluster(unrelated, {
    approval: approvalFor(abstainReq),
    readCurrentFingerprint: () => abstainReq.fingerprint,
    now: () => 1000,
    transport: async () => {
      calls += 1;
      return transportResult(UNCLASSIFIED_LABEL);
    },
  });
  assert.equal(calls, 1);
  assert.equal(abstain.status, 'evaluated');
  assert.equal(abstain.decision.abstained, true);
  assert.equal(abstain.decision.clusterSlug, null);
  const related = { ...baseInput, clusters: single };
  const { request: fitReq } = prepareTaskClusterRequest(related);
  const fit = await classifyReleaseTaskCluster(related, {
    approval: approvalFor(fitReq),
    readCurrentFingerprint: () => fitReq.fingerprint,
    now: () => 1000,
    transport: async () => transportResult('rights-royalty-registration'),
  });
  assert.equal(fit.decision.clusterSlug, 'rights-royalty-registration');
});

test('unknown or stale labels invalidate the response instead of mutating work', async () => {
  const { request } = prepareTaskClusterRequest(baseInput);
  const options = {
    approval: approvalFor(request),
    readCurrentFingerprint: () => request.fingerprint,
    now: () => 1000,
  };
  for (const result of [
    transportResult('made-up-slug'),
    transportResult('lyrics'), // real cluster, but absent from this allowlist
    { ...transportResult('editorial-pitching'), warnings: [{}] },
    {
      ...transportResult('editorial-pitching'),
      response: { modelId: 'other/model' },
    },
    {
      answers: {
        classification: { type: 'boolean', choice: 'editorial-pitching' },
      },
      response: { modelId: JEV_ROUTE.model },
      warnings: [],
    },
    null,
  ]) {
    const receipt = await classifyReleaseTaskCluster(baseInput, {
      ...options,
      transport: async () => result,
    });
    assert.equal(receipt.status, 'invalid-response');
    assert.equal(receipt.certified, false);
    assert.equal(receipt.decision, undefined);
  }
});

test('evaluated decisions carry concentration and never certification', async () => {
  const { request } = prepareTaskClusterRequest(baseInput);
  const receipt = await classifyReleaseTaskCluster(baseInput, {
    approval: approvalFor(request),
    readCurrentFingerprint: () => request.fingerprint,
    now: () => 1000,
    transport: async () => transportResult('editorial-pitching'),
  });
  assert.equal(receipt.status, 'evaluated');
  assert.equal(receipt.schema, TASK_CLUSTER_SCHEMA);
  assert.equal(receipt.evaluatorCalls, 1);
  assert.equal(receipt.decision.clusterSlug, 'editorial-pitching');
  assert.equal(receipt.decision.abstained, false);
  assert.equal(receipt.decision.concentration, 0.8);
  assert.equal(receipt.certified, false);
  assert.equal(receipt.humanCertified, false);
  assert.equal(receipt.billedCostUsd, null);
  const noProbs = await classifyReleaseTaskCluster(baseInput, {
    approval: approvalFor(request),
    readCurrentFingerprint: () => request.fingerprint,
    now: () => 1000,
    transport: async () => ({
      ...transportResult('dj-promotion'),
      answers: {
        classification: { type: 'choice', choice: 'dj-promotion' },
      },
    }),
  });
  assert.equal(noProbs.decision.concentration, null);
});

test('interpreter treats malformed probability payloads as unavailable', () => {
  for (const probs of [
    { 'dj-promotion': 'high' },
    { 'dj-promotion': Number.POSITIVE_INFINITY },
    'nope',
  ]) {
    const read = interpretTaskCluster(
      transportResult('dj-promotion', {
        answers: {
          classification: {
            type: 'choice',
            choice: 'dj-promotion',
            probabilities: probs,
          },
        },
      }),
      allowlist
    );
    assert.equal(read.invalid, undefined);
    assert.equal(read.detail.decision.concentration, null);
    assert.equal(read.detail.decision.probabilities, null);
    assert.equal(read.detail.decision.clusterSlug, 'dj-promotion');
  }
});

test('timeout, cancellation and admission failures stay fail-closed', async () => {
  const { request } = prepareTaskClusterRequest(baseInput);
  const options = {
    approval: approvalFor(request),
    readCurrentFingerprint: () => request.fingerprint,
    now: () => 1000,
  };
  let calls = 0;
  const unadmitted = await classifyReleaseTaskCluster(baseInput, {
    ...options,
    approval: null,
    transport: async () => {
      calls += 1;
      return transportResult('editorial-pitching');
    },
  });
  assert.equal(unadmitted.status, 'not-admitted');
  assert.equal(calls, 0);
  const pre = new AbortController();
  pre.abort();
  assert.equal(
    (
      await classifyReleaseTaskCluster(baseInput, {
        ...options,
        signal: pre.signal,
      })
    ).status,
    'cancelled'
  );
  assert.equal(
    (
      await classifyReleaseTaskCluster(baseInput, {
        ...options,
        timeoutMs: 5,
        transport: () => new Promise(() => {}),
      })
    ).status,
    'timeout'
  );
  assert.equal(
    (
      await classifyReleaseTaskCluster(baseInput, {
        ...options,
        transport: async () => {
          throw new Error('Bearer raw-provider-error');
        },
      })
    ).status,
    'provider-error'
  );
  assert.ok(
    !JSON.stringify(
      await classifyReleaseTaskCluster(baseInput, {
        ...options,
        transport: async () => {
          throw new Error('raw-secret-marker');
        },
      })
    ).includes('raw-secret-marker')
  );
});

test('concentration thresholds reject legacy confidence cutoffs and gate actions', () => {
  for (const bad of [
    null,
    {},
    { assign: 0.7, review: 0.3 },
    { assign: 0.9, review: 0.6 },
    { assign: 0.5, review: 0.7 },
    { assign: 0.4, review: 0.4 },
    { assign: 1.2, review: 0.2 },
    { assign: '0.8', review: 0.3 },
  ]) {
    assert.throws(() =>
      validateTaskClusterThresholds(/** @type {any} */ (bad))
    );
  }
  const thresholds = validateTaskClusterThresholds({
    assign: 0.55,
    review: 0.35,
  });
  const evaluated = decision =>
    Object.freeze({
      status: 'evaluated',
      decision: Object.freeze({ abstained: false, ...decision }),
    });
  assert.equal(
    decideTaskClusterAssignment(
      evaluated({ clusterSlug: 'dj-promotion', concentration: 0.9 }),
      thresholds
    ).action,
    'assign'
  );
  assert.equal(
    decideTaskClusterAssignment(
      evaluated({ clusterSlug: 'dj-promotion', concentration: 0.4 }),
      thresholds
    ).action,
    'review'
  );
  assert.equal(
    decideTaskClusterAssignment(
      evaluated({ clusterSlug: 'dj-promotion', concentration: 0.1 }),
      thresholds
    ).action,
    'abstain'
  );
  assert.equal(
    decideTaskClusterAssignment(
      evaluated({ clusterSlug: 'dj-promotion', concentration: null }),
      thresholds
    ).action,
    'review'
  );
  assert.equal(
    decideTaskClusterAssignment(
      evaluated({ clusterSlug: null, abstained: true, concentration: null }),
      thresholds
    ).action,
    'abstain'
  );
  for (const receipt of [
    null,
    { status: 'timeout' },
    { status: 'skipped', decision: {} },
  ]) {
    assert.equal(
      decideTaskClusterAssignment(receipt, thresholds).action,
      'abstain'
    );
  }
});

test('versioned corpus loads, is hash-pinned, split-separated and covers tags', () => {
  const corpus = loadTaskCorpus(buildCorpus());
  const config = JSON.parse(
    readFileSync(
      new URL('./fixtures/release-task-pilot-config.json', import.meta.url),
      'utf8'
    )
  );
  assert.ok(corpus.examples.length >= corpus.targetSize.min);
  assert.ok(corpus.examples.length <= corpus.targetSize.max);
  assert.equal(
    createHash('sha256').update(JSON.stringify(buildCorpus())).digest('hex'),
    config.corpusSha256
  );
  const report = corpusIntegrityReport(corpus, config);
  assert.deepEqual(report.issues, []);
  assert.ok(report.ok);
  for (const tag of config.sufficiency.requiredTags) {
    assert.ok(report.stats.tags[tag] > 0, tag);
  }
  assert.throws(() => loadTaskCorpus({ schema: 'wrong' }));
  const tampered = structuredClone(corpus);
  tampered.examples[0].expected = 'cluster-that-does-not-exist';
  assert.throws(() => loadTaskCorpus(tampered));
  const dup = structuredClone(corpus);
  dup.examples[1].text = dup.examples[0].text;
  dup.examples[1].clusterSetId = dup.examples[0].clusterSetId;
  assert.throws(() => loadTaskCorpus(dup));
  const cross = structuredClone(corpus);
  cross.examples.push({
    ...cross.examples[0],
    id: 'rt-dup-split',
    split: cross.examples[0].split === 'tuning' ? 'holdout' : 'tuning',
  });
  assert.throws(() => loadTaskCorpus(cross));
  // Tuning and holdout must never share the same task text under one set.
  const leak = loadTaskCorpus(JSON.stringify(structuredClone(corpus)));
  const leaked = structuredClone(leak);
  const victim = leaked.examples.find(e => e.split === 'tuning');
  const shadow = structuredClone(victim);
  shadow.id = 'rt-leak';
  shadow.split = 'holdout';
  shadow.text = `${victim.text} `; // same normalized text
  leaked.examples.push(shadow);
  const leakReport = corpusIntegrityReport(leaked, config);
  assert.ok(leakReport.issues.some(i => i.startsWith('tuning/holdout')));
});
