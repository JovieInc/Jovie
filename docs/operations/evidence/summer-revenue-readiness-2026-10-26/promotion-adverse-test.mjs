import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluatePromotion } from '/workspace/Jovie/scripts/lib/promotion-journey-evidence.mjs';

const sha = 'a'.repeat(40);
const now = new Date('2026-10-26T12:00:00.000Z');
const range = {
  schema: 'jovie.release-range-risk/v1',
  candidateSha: sha,
  baseDeployedSha: 'b'.repeat(40),
  unknown: false,
  paths: [],
  affects: { auth: true, billing: true },
};
const good = journey => ({
  schema: 'jovie.journey-evidence/v1',
  journey,
  candidateSha: sha,
  deploymentSha: sha,
  source: 'playwright-run',
  runId: '123',
  runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/123',
  conclusion: 'success',
  completedAt: '2026-10-26T11:00:00.000Z',
  tests: { total: 2, passed: 2, failed: 0, skipped: 0 },
  providers: [
    journey === 'auth'
      ? { name: 'auth', mode: 'real' }
      : { name: 'stripe', mode: 'test' },
  ],
  quarantinedExclusions: [],
});
const evaluate = (evidence, r = range) =>
  evaluatePromotion({ range: r, evidence, now });
test('control: current bound positive evidence passes', () =>
  assert.equal(evaluate([good('auth'), good('billing')]).decision, 'pass'));
test('control: zero executed tests blocks', () =>
  assert.equal(
    evaluate([
      {
        ...good('auth'),
        tests: { total: 0, passed: 0, failed: 0, skipped: 0 },
      },
      good('billing'),
    ]).decision,
    'blocked'
  ));
test('control: wrong build blocks', () =>
  assert.equal(
    evaluate([
      { ...good('auth'), candidateSha: 'c'.repeat(40) },
      good('billing'),
    ]).decision,
    'blocked'
  ));
test('malformed range cannot omit required journey proof', () =>
  assert.equal(
    evaluate([], { schema: range.schema, candidateSha: sha }).decision,
    'blocked'
  ));
for (const invalid of [null, -1, 'unknown'])
  test(`invalid failure/skip counters ${JSON.stringify(invalid)} cannot certify`, () =>
    assert.equal(
      evaluate([
        {
          ...good('auth'),
          tests: { total: 2, passed: 2, failed: invalid, skipped: invalid },
        },
        good('billing'),
      ]).decision,
      'blocked'
    ));
test('later exact-build failed execution invalidates prior green', () =>
  assert.equal(
    evaluate([
      good('auth'),
      good('billing'),
      {
        ...good('auth'),
        runId: '124',
        runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/124',
        completedAt: '2026-10-26T11:30:00.000Z',
        conclusion: 'failure',
        tests: { total: 2, passed: 1, failed: 1, skipped: 0 },
      },
    ]).decision,
    'blocked'
  ));
