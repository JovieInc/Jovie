import assert from 'node:assert/strict';
import { test } from 'node:test';
import { armAction, autoMergeBaseViolation } from '../stack-arm-policy.mjs';

const ready = {
  state: 'OPEN',
  isDraft: false,
  baseRefName: 'main',
  mergeStateStatus: 'BLOCKED',
  labels: [],
};

test('non-main base is a violation, main is not', () => {
  assert.equal(autoMergeBaseViolation('main'), null);
  assert.equal(
    autoMergeBaseViolation('feat/ovie-card-copy-contract'),
    'base=feat/ovie-card-copy-contract'
  );
  assert.equal(autoMergeBaseViolation(undefined), 'base=missing');
});

test('never arms a PR whose base is not main', () => {
  assert.equal(
    armAction({
      ...ready,
      baseRefName: 'feat/parent',
      mergeStateStatus: 'CLEAN',
    }),
    'skip:base=feat/parent'
  );
});

test('enqueues CLEAN, arms otherwise', () => {
  assert.equal(armAction({ ...ready, mergeStateStatus: 'CLEAN' }), 'enqueue');
  assert.equal(armAction(ready), 'auto-merge');
  assert.equal(
    armAction({ ...ready, mergeStateStatus: 'UNKNOWN' }),
    'auto-merge'
  );
});

test('skips draft, held, queued, armed, conflicted and closed PRs', () => {
  assert.equal(armAction({ ...ready, isDraft: true }), 'skip:draft');
  assert.equal(armAction({ ...ready, state: 'MERGED' }), 'skip:not-open');
  assert.match(armAction({ ...ready, labels: ['hold'] }), /^skip:held\(hold\)/);
  assert.match(
    armAction({ ...ready, labels: [{ name: 'lane-fix-red' }] }),
    /^skip:held/
  );
  assert.equal(armAction({ ...ready, inQueue: true }), 'skip:already-queued');
  assert.equal(
    armAction({ ...ready, autoMergeEnabled: true }),
    'skip:already-armed'
  );
  assert.equal(
    armAction({ ...ready, mergeStateStatus: 'DIRTY' }),
    'skip:conflict'
  );
});

test('compounding label alone does not block arming (no jump from here)', () => {
  assert.equal(armAction({ ...ready, labels: ['compounding'] }), 'auto-merge');
});
