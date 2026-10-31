import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  classifyPr,
  decide,
  dependencyMetrics,
  migrationFingerprint,
  REBASE_MARKER,
} from './lib/dependency-loop.mjs';
import { compare } from './toolchain-drift.mjs';

const NOW = new Date('2026-10-29T18:00:00Z');
const pr = over => ({
  number: 1,
  title: 'deps(deps): bump foo from 1.2.3 to 1.2.4',
  headRefName: 'dependabot/npm_and_yarn/foo-1.2.4',
  createdAt: '2026-10-28T18:00:00Z',
  mergeStateStatus: 'BLOCKED',
  labels: [],
  comments: [],
  ...over,
});

test('classifies patch, minor, major and groups', () => {
  assert.equal(classifyPr(pr()).kind, 'patch');
  assert.equal(
    classifyPr(pr({ title: 'bump foo from 1.2.3 to 1.3.0' })).kind,
    'minor'
  );
  assert.equal(
    classifyPr(
      pr({ title: 'deps-dev(deps-dev): bump electron from 43.8.0 to 44.9.1' })
    ).kind,
    'major'
  );
  assert.equal(
    classifyPr(
      pr({
        title:
          'bump the dev-non-major group across 1 directory with 23 updates',
      })
    ).kind,
    'minor'
  );
  assert.equal(
    classifyPr(pr({ title: 'bump the electron-major group with 1 update' }))
      .kind,
    'major'
  );
  assert.equal(
    classifyPr(
      pr({
        title: 'ci(deps): bump the codeql-action group with 3 updates',
        headRefName: 'dependabot/github_actions/x',
      })
    ).kind,
    'minor'
  );
});

test('majors route to a migration issue with a stable fingerprint', () => {
  const p = pr({ title: 'bump electron from 43.8.0 to 44.9.1' });
  const d = decide(p, NOW);
  assert.equal(d.action, 'migrate');
  assert.equal(migrationFingerprint(d.class), 'depmajor-electron-44-9-1');
});

test('every action carries its dependency classification for metrics and migrations', () => {
  for (const update of [
    pr({ mergeStateStatus: 'DIRTY' }),
    pr({ title: 'bump foo from 1.0.0 to 2.0.0' }),
    pr(),
    pr({ labels: ['hold'] }),
  ]) {
    const decision = decide(update, NOW);
    assert.deepEqual(decision.class, classifyPr(update));
    assert.deepEqual(Object.keys(decision).sort(), [
      'action',
      'class',
      'reason',
    ]);
  }
});

test('DIRTY patch/minor heads get one recreate per 24h', () => {
  assert.equal(
    decide(pr({ mergeStateStatus: 'DIRTY' }), NOW).action,
    'recreate'
  );
  const recent = pr({
    mergeStateStatus: 'DIRTY',
    comments: [
      { body: `x ${REBASE_MARKER}`, createdAt: '2026-10-29T10:00:00Z' },
    ],
  });
  assert.equal(decide(recent, NOW).reason, 'recreate-requested-recently');
  const old = pr({
    mergeStateStatus: 'DIRTY',
    comments: [{ body: REBASE_MARKER, createdAt: '2026-10-27T10:00:00Z' }],
  });
  assert.equal(decide(old, NOW).action, 'recreate');
});

test('BLOCKED heads are left to the green-to-enqueue path; holds are respected', () => {
  assert.equal(decide(pr(), NOW).reason, 'awaiting-green-enroll');
  assert.equal(
    decide(pr({ labels: [{ name: 'hold' }] }), NOW).reason,
    'durable-hold'
  );
});

test('metrics: dwell, majors open and their age, time to merge', () => {
  const m = dependencyMetrics({
    open: [
      pr(),
      pr({
        number: 2,
        title: 'bump electron from 43.0.0 to 44.0.0',
        createdAt: '2026-10-23T18:00:00Z',
        mergeStateStatus: 'DIRTY',
      }),
    ],
    merged: [
      { createdAt: '2026-10-27T00:00:00Z', mergedAt: '2026-10-28T00:00:00Z' },
    ],
    now: NOW,
  });
  assert.equal(m.openUpdatePrs, 2);
  assert.equal(m.majorsOpen, 1);
  assert.equal(m.majorsOldestHours, 144);
  assert.equal(m.timeToMergeHours.p50, 24);
  assert.deepEqual(m.byMergeState, { BLOCKED: 1, DIRTY: 1 });
});

test('toolchain drift: pins, host node/pnpm and a behind-latest pin are reported', () => {
  assert.equal(
    compare({
      nvmrc: '24.22.1',
      engineNode: '>=24.22.1 <25',
      packageManager: 'pnpm@9.15.9',
    }).ok,
    true
  );
  const r = compare({
    nvmrc: '24.22.1',
    engineNode: '>=24.22.1 <25',
    packageManager: 'pnpm@9.15.9',
    latestInLine: '24.23.0',
    host: { node: 'v24.21.0', pnpm: '9.15.9' },
  });
  assert.deepEqual(
    r.drift.map(d => d.check),
    ['repo pin behind latest patch of its Node line', 'host node vs .nvmrc']
  );
  assert.equal(
    compare({
      nvmrc: '24.22.1',
      engineNode: '>=24.21.0',
      packageManager: 'pnpm@9.15.9',
    }).ok,
    false
  );
});
