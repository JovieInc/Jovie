import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateReleaseLag, findBlocker } from './release-lag-check.mjs';

const H = 3_600_000;
const base = {
  prodSha: 'a'.repeat(40),
  mainSha: 'b'.repeat(40),
  nowMs: 10 * H,
};

test('lagging when the oldest unshipped main commit is older than the limit', () => {
  const r = evaluateReleaseLag({ ...base, firstUnshippedMs: 1 * H });
  assert.equal(r.ok, false);
  assert.match(r.reason, /9\.0h/);
});
test('ok when production has main, nothing is unshipped, or the unshipped commit is recent', () => {
  assert.equal(
    evaluateReleaseLag({ ...base, mainSha: base.prodSha, firstUnshippedMs: 0 })
      .ok,
    true
  );
  assert.equal(evaluateReleaseLag({ ...base }).ok, true);
  assert.equal(
    evaluateReleaseLag({ ...base, firstUnshippedMs: 9 * H }).ok,
    true
  );
});
test('unreadable build-info alerts', () => {
  assert.equal(evaluateReleaseLag({ ...base, prodSha: '' }).ok, false);
});
test('names the failing job and step of the newest failed run', () => {
  const runs = [
    { databaseId: 2, conclusion: 'success', url: 'u2' },
    { databaseId: 1, conclusion: 'failure', url: 'u1' },
  ];
  const jobs = () => [
    { name: 'ok', conclusion: 'success' },
    {
      name: 'Promote to Production',
      conclusion: 'failure',
      steps: [{ name: 'Prove LCP budgets', conclusion: 'failure' }],
    },
  ];
  assert.equal(
    findBlocker(runs, jobs),
    'Promote to Production / Prove LCP budgets (u1)'
  );
  assert.match(
    findBlocker([{ databaseId: 3, conclusion: 'success' }], jobs),
    /superseded/
  );
});
