import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gateMode, judgeWalk, percentile } from './latency-gate.mjs';

test('p95 over 2s fails; build turns are exempt; no answer counts as a miss', () => {
  assert.equal(percentile([1000, 3000], 50), 1000);
  assert.equal(
    judgeWalk([{ firstVisibleMs: 900 }, { firstVisibleMs: 1500 }]).pass,
    true
  );
  assert.equal(
    judgeWalk([{ firstVisibleMs: 900 }, { firstVisibleMs: 21866 }]).pass,
    false
  );
  assert.equal(
    judgeWalk([{ firstVisibleMs: 900 }, { firstVisibleMs: 30000, build: true }])
      .pass,
    true
  );
  assert.equal(judgeWalk([{ firstVisibleMs: null }]).pass, false);
});

test('report-only until 3 straight passes, then enforcing for good', () => {
  assert.equal(gateMode([]), 'report');
  assert.equal(
    gateMode([{ pass: true }, { pass: false }, { pass: true }, { pass: true }]),
    'report'
  );
  assert.equal(
    gateMode([{ pass: true }, { pass: true }, { pass: true }, { pass: false }]),
    'enforce'
  );
});
