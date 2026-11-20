import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluate, lowerBound, REQUIRED } from '../promotion-readiness.mjs';

const now = 1800000000000;
const base = () => {
  const tuple = {
    repo: 'JovieInc/Jovie',
    pr: 1,
    head: 'a'.repeat(40),
    base: 'b'.repeat(40),
    tree: 'c'.repeat(40),
    policy: 'd'.repeat(40),
    metadata: 'e'.repeat(40),
  };
  return {
    tuple,
    main: tuple.base,
    evidence: Object.fromEntries(
      REQUIRED.map(k => [k, { tuple, at: now, pass: true }])
    ),
    snapshot: { tuple, at: now, complete: true, queueVersion: 'q1' },
    queue: { complete: true, version: 'q1', lease: true, overlap: 'none' },
    health: { complete: true, circuitOpen: false },
    calibration: {
      policy: tuple.policy,
      complete: true,
      definition: 'first-pass-v1',
      at: now,
      resolved: 100,
      clean: 98,
    },
  };
};
const verdict = x => evaluate(x, { now });
test('trivial green/fresh complete evidence passes; no invented individual probability', () => {
  const v = verdict(base());
  assert.equal(v.ready, true);
  assert.equal(v.probability, null);
});
for (const gate of REQUIRED)
  test(`missing/failing ${gate} fails closed`, () => {
    const x = base();
    delete x.evidence[gate];
    assert.equal(verdict(x).ready, false);
  });
test('busy queue movement invalidates old admission', () => {
  const x = base();
  x.queue.version = 'q2';
  assert.equal(verdict(x).ready, false);
});
test('lease prevents parallel promoters racing', () => {
  const x = base();
  x.queue.lease = false;
  assert.equal(verdict(x).ready, false);
});
test('flaky check warnings cannot make red required check green', () => {
  const x = base();
  x.health.suspectedFlakes = ['unit'];
  x.evidence.sourceChecks.pass = false;
  assert.equal(verdict(x).ready, false);
});
test('big refactor follows trusted size policy; no synthetic size bypass', () => {
  const x = base();
  x.evidence.sizePolicy.pass = false;
  assert.equal(verdict(x).ready, false);
});
test('stacked overlap with proven clean combined tree is warning; conflict fails', () => {
  const x = base();
  x.queue.overlap = 'files-only';
  assert.equal(verdict(x).ready, true);
  x.queue.overlap = 'conflict';
  assert.equal(verdict(x).ready, false);
});
test('gaming green evidence from another head fails', () => {
  const x = base();
  x.evidence.dryMerge = {
    pass: true,
    at: now,
    tuple: { ...x.tuple, head: 'f'.repeat(40) },
  };
  assert.equal(verdict(x).ready, false);
});
test('stale/future receipts fail', () => {
  const x = base();
  x.evidence.dryMerge.at = now - 31 * 60000;
  assert.equal(verdict(x).ready, false);
  x.evidence.dryMerge.at = now + 1;
  assert.equal(verdict(x).ready, false);
});
test('main moving before promotion invalidates proof', () => {
  const x = base();
  x.main = 'f'.repeat(40);
  assert.equal(verdict(x).ready, false);
});
test('calibration unknown is not 90% validated; optional mature mode fails closed', () => {
  const x = base();
  delete x.calibration;
  assert.equal(verdict(x).reliability, '90% target, unvalidated');
  assert.equal(evaluate(x, { now, calibrated: true }).ready, false);
});
test('98/100 cohort lower bound clears 90%; 90/100 does not', () => {
  assert.ok(lowerBound(98, 100) > 0.9);
  assert.ok(lowerBound(90, 100) < 0.9);
  assert.equal(evaluate(base(), { now, calibrated: true }).ready, true);
});
test('invalid calibration cannot game the bar', () => {
  for (const [s, n] of [
    [101, 100],
    [-1, 100],
    [1, 0],
    [1, 1.5],
  ])
    assert.equal(lowerBound(s, n), null);
});
