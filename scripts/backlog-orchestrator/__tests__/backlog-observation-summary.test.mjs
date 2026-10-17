import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  nativeObservationSummary,
  worldObservationSummary,
} from '../backlog-observation-summary.mjs';

const PRIVATE = 'private description and accepted worker prompt';
const ID = '68b3e8de-588e-46ba-8209-84329d154627';
const NOW = 1_792_188_000;
function observation() {
  return {
    schema: 'jovie.backlog-admission-observation/v1',
    issue: 'JOV-6641',
    allowed: true,
    authorizesTransition: false,
    authorizesDispatch: false,
    holds: [],
    evidence: {
      observedAt: NOW,
      completedAt: NOW,
      revalidatedAt: NOW,
      localBoundAt: NOW,
      linearPreimagesObservedAt: NOW,
      prObservedAt: NOW,
      historyObservedAt: NOW,
      sourceHash: 'a'.repeat(64),
      policyHash: 'b'.repeat(64),
      cohortDigest: 'c'.repeat(64),
      releaseTree: 'd'.repeat(40),
      cohortCount: 1,
      priority: 1,
      readOnly: true,
      linearPreimages: {
        [ID]: {
          id: ID,
          description: PRIVATE,
          comments: { nodes: [{ body: PRIVATE }] },
        },
      },
      cohortMetadataPreimages: {
        [ID]: { id: ID, title: 'Bounded prerequisite', description: PRIVATE },
      },
      arbitraryPayload: PRIVATE,
    },
  };
}
/** @param {unknown} [evidence] */
function held(
  evidence = { issue: 'JOV-6641', commentId: ID, pr: 19037, body: PRIVATE }
) {
  return {
    ...observation(),
    allowed: false,
    holds: [
      {
        code: 'terminal-attempt',
        owner: 'JOV-7089 reentry owner',
        nextAction: 'certified reentry',
        evidence,
      },
    ],
  };
}
function digest(value) {
  assert.ok(typeof value === 'string');
  assert.match(value, /^[a-f0-9]{64}$/);
}

test('native output retains bounded provenance and private-preimage digests without mutating proof', () => {
  const source = observation(),
    before = structuredClone(source);
  const summary = nativeObservationSummary(source);
  assert.equal(
    summary.schema,
    'jovie.backlog-admission-observation-summary/v1'
  );
  assert.equal(summary.sourceSchema, source.schema);
  assert.equal(summary.issue, 'JOV-6641');
  assert.equal(summary.allowed, true);
  assert.equal(summary.authorizesTransition, false);
  assert.equal(summary.authorizesDispatch, false);
  assert.deepEqual(summary.holds, []);
  assert.deepEqual(
    Object.keys(summary.evidence).sort(),
    [
      'observedAt',
      'completedAt',
      'revalidatedAt',
      'localBoundAt',
      'linearPreimagesObservedAt',
      'prObservedAt',
      'historyObservedAt',
      'sourceHash',
      'policyHash',
      'cohortDigest',
      'releaseTree',
      'cohortCount',
      'priority',
      'readOnly',
      'criticalPreimageCount',
      'criticalPreimageDigest',
      'cohortPreimageCount',
      'cohortPreimageDigest',
    ].sort()
  );
  assert.equal(summary.evidence.criticalPreimageCount, 1);
  assert.equal(summary.evidence.cohortPreimageCount, 1);
  digest(summary.evidence.criticalPreimageDigest);
  digest(summary.evidence.cohortPreimageDigest);
  assert.deepEqual(source, before);
  assert.ok(!JSON.stringify(summary).includes(PRIVATE));
  assert.ok(!JSON.stringify(summary).includes('arbitraryPayload'));
  assert.equal(summary.evidence.sourceHash, source.evidence.sourceHash);
  assert.equal(summary.evidence.observedAt, NOW);
});

test('private comment drift changes its digest while object key order does not', () => {
  const source = observation(),
    first = nativeObservationSummary(source);
  const row = source.evidence.linearPreimages[ID];
  source.evidence.linearPreimages[ID] = {
    comments: row.comments,
    description: row.description,
    id: ID,
  };
  assert.equal(
    nativeObservationSummary(source).evidence.criticalPreimageDigest,
    first.evidence.criticalPreimageDigest
  );
  source.evidence.linearPreimages[ID].comments.nodes[0].body =
    'changed current custody';
  assert.notEqual(
    nativeObservationSummary(source).evidence.criticalPreimageDigest,
    first.evidence.criticalPreimageDigest
  );
});

test('named hold custody and canonical references survive without evidence payloads', () => {
  const source = held(),
    summary = nativeObservationSummary(source);
  assert.equal(summary.allowed, false);
  assert.equal(summary.holds[0].owner, 'JOV-7089 reentry owner');
  assert.equal(summary.holds[0].code, 'terminal-attempt');
  assert.equal(summary.holds[0].nextAction, 'certified reentry');
  assert.deepEqual(summary.holds[0].evidence.references, [
    'issue:JOV-6641',
    `commentId:${ID}`,
    'pr:19037',
  ]);
  digest(summary.holds[0].evidence.sha256);
  assert.ok(!JSON.stringify(summary).includes(PRIVATE));
  for (const evidence of ['JOV-6641', ID, 'a'.repeat(64)]) {
    const projected = nativeObservationSummary(held(evidence));
    assert.deepEqual(projected.holds[0].evidence.references, [
      `evidence:${evidence}`,
    ]);
    digest(projected.holds[0].evidence.sha256);
  }
  const malformed = nativeObservationSummary(
    held({ issue: PRIVATE, pr: -1, number: 'private', body: PRIVATE })
  );
  assert.deepEqual(malformed.holds[0].evidence.references, []);
  assert.ok(!JSON.stringify(malformed).includes(PRIVATE));
});

test('unsupported or internally inconsistent native observations have no raw fallback', () => {
  for (const mutate of [
    value => {
      value.schema = 'unknown';
    },
    value => {
      value.issue = PRIVATE;
    },
    value => {
      value.allowed = undefined;
    },
    value => {
      value.authorizesTransition = true;
    },
    value => {
      value.authorizesDispatch = true;
    },
    value => {
      value.holds = null;
    },
    value => {
      value.evidence = null;
    },
    value => {
      value.evidence = [];
    },
    value => {
      value.allowed = true;
    },
    value => {
      value.holds = [];
    },
    value => {
      value.holds = Array(1);
    },
    value => {
      value.holds[0].code = 'invalid gate';
    },
    value => {
      value.holds[0].owner = null;
    },
    value => {
      value.holds[0].nextAction = null;
    },
    value => {
      delete value.holds[0].evidence;
    },
    value => {
      value.evidence.linearPreimages.cycle = value.evidence;
    },
  ]) {
    const source = held();
    mutate(source);
    assert.equal(nativeObservationSummary(source), undefined);
  }
  assert.equal(nativeObservationSummary(null), undefined);
});

test('malformed optional provenance is omitted rather than forwarded or granted', () => {
  const source = observation();
  Object.assign(source.evidence, {
    observedAt: Infinity,
    completedAt: -1,
    sourceHash: PRIVATE,
    releaseTree: PRIVATE,
    cohortCount: 1.5,
    priority: '1',
    readOnly: false,
    linearPreimages: [],
    cohortMetadataPreimages: null,
  });
  const summary = nativeObservationSummary(source);
  for (const key of [
    'observedAt',
    'completedAt',
    'sourceHash',
    'releaseTree',
    'cohortCount',
    'priority',
    'readOnly',
    'criticalPreimageDigest',
    'criticalPreimageCount',
    'cohortPreimageDigest',
    'cohortPreimageCount',
  ])
    assert.equal(summary.evidence[key], undefined);
  assert.ok(!JSON.stringify(summary).includes(PRIVATE));
});

test('World summary retains validated identity, counts and named holds without run payloads', () => {
  const identity = {
    projectId: 'prj_current',
    teamId: 'team_current',
    deploymentId: 'dpl_current',
    sourceRevision: 'a'.repeat(40),
    environment: 'production',
    privatePayload: PRIVATE,
  };
  const world = {
    schema: 'summer.workflow-drain-observation/v1',
    status: 'held',
    complete: false,
    observedAt: '2026-10-16T22:00:00.000Z',
    counts: {
      pending: 0,
      running: 2,
      currentDeployment: 0,
      oldDeployment: 2,
      unknownLineage: 0,
      privatePayload: PRIVATE,
    },
    holds: ['workflow-world-old-deployment-active', PRIVATE, 1],
    runs: [{ body: PRIVATE }],
    privatePayload: PRIVATE,
  };
  const before = structuredClone(world),
    summary = worldObservationSummary(world, identity);
  assert.equal(summary.schema, 'summer.workflow-drain-observation-summary/v1');
  assert.equal(summary.sourceSchema, world.schema);
  assert.equal(summary.status, 'held');
  assert.equal(summary.complete, false);
  assert.equal(summary.observedAt, world.observedAt);
  assert.equal(summary.authorizesTransition, false);
  assert.equal(summary.authorizesDispatch, false);
  assert.equal(summary.genericWriterDrain, 'unverified');
  assert.deepEqual(
    summary.identity,
    Object.fromEntries(
      Object.entries(identity).filter(([key]) => key !== 'privatePayload')
    )
  );
  assert.deepEqual(summary.counts, {
    pending: 0,
    running: 2,
    currentDeployment: 0,
    oldDeployment: 2,
    unknownLineage: 0,
  });
  assert.deepEqual(summary.holds, ['workflow-world-old-deployment-active']);
  digest(summary.evidenceDigest);
  assert.ok(!JSON.stringify(summary).includes(PRIVATE));
  assert.deepEqual(world, before);
  world.privatePayload = 'changed omitted payload';
  assert.notEqual(
    worldObservationSummary(world, identity).evidenceDigest,
    summary.evidenceDigest
  );
  assert.deepEqual(
    worldObservationSummary(
      { ...world, holds: null, counts: { pending: -1 } },
      identity
    ).holds,
    []
  );
  assert.deepEqual(
    worldObservationSummary({ ...world, counts: { pending: -1 } }, identity)
      .counts,
    {}
  );
});
