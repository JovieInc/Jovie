import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canRetry,
  classifyRerunEligibility,
  loadLedger,
  MAX_RETRIES_PER_WINDOW,
  normalizeRun,
  recordRetry,
  recordRun,
  repeatOffenders,
} from '../flake-ledger.mjs';

const sha = n => `${n}`.repeat(10).padEnd(40, '0').slice(0, 40);
const HEAD_A = sha('a');
const HEAD_B = sha('b');
const BASE_1 = sha('1');
const BASE_2 = sha('2');
const now = Date.parse('2026-11-19T18:00:00Z');
const run = over => ({
  workflowPath: '.github/workflows/source-validation.yml',
  runId: 1,
  runAttempt: 1,
  headSha: HEAD_A,
  baseSha: BASE_1,
  conclusion: 'failure',
  observedAt: '2026-11-19T10:00:00Z',
  ...over,
});

test('a red to green flip on the same head and base is recorded', () => {
  let ledger = loadLedger(null, { now });
  ledger = recordRun(ledger, run(), { now }).ledger;
  const result = recordRun(
    ledger,
    run({
      runId: 2,
      runAttempt: 2,
      conclusion: 'success',
      observedAt: '2026-11-19T11:00:00Z',
    }),
    { now }
  );
  assert.equal(result.flips.length, 1);
  assert.equal(
    result.flips[0].subject,
    'workflow:.github/workflows/source-validation.yml'
  );
  assert.deepEqual(result.flips[0].failedRunIds, [1]);
});

test('a flip after main moved is a different base and is not a flake', () => {
  let ledger = loadLedger(null, { now });
  ledger = recordRun(ledger, run(), { now }).ledger;
  const result = recordRun(
    ledger,
    run({
      runId: 3,
      runAttempt: 2,
      conclusion: 'success',
      baseSha: BASE_2,
      observedAt: '2026-11-19T12:00:00Z',
    }),
    { now }
  );
  assert.deepEqual(result.flips, []);
  assert.deepEqual(repeatOffenders(result.ledger, { now }), []);
});

test('runs without a base SHA are never recorded as flake evidence', () => {
  const ledger = loadLedger(null, { now });
  const result = recordRun(
    ledger,
    run({ baseSha: null, observedAt: '2026-11-19T10:00:00Z' }),
    { now }
  );
  assert.deepEqual(result.flips, []);
  assert.deepEqual(result.ledger.failures, []);
});

test('two or more flips in seven days make a repeat offender with a test file', () => {
  let ledger = loadLedger(null, { now });
  const failure = over =>
    run({ testFile: 'apps/web/tests/unit/ci/example.test.ts', ...over });
  ledger = recordRun(ledger, failure({ runId: 1 }), { now }).ledger;
  ledger = recordRun(
    ledger,
    failure({
      runId: 2,
      runAttempt: 2,
      conclusion: 'success',
      observedAt: '2026-11-19T11:00:00Z',
    }),
    { now }
  ).ledger;
  ledger = recordRun(ledger, failure({ runId: 3, headSha: HEAD_B }), {
    now,
  }).ledger;
  ledger = recordRun(
    ledger,
    failure({
      runId: 4,
      headSha: HEAD_B,
      runAttempt: 2,
      conclusion: 'success',
      observedAt: '2026-11-19T12:00:00Z',
    }),
    { now }
  ).ledger;
  const offenders = repeatOffenders(ledger, { now });
  assert.equal(offenders.length, 1);
  assert.equal(offenders[0].flips, 2);
  assert.deepEqual(offenders[0].testFiles, [
    'apps/web/tests/unit/ci/example.test.ts',
  ]);
});

test('the seven day window prunes old evidence', () => {
  let ledger = loadLedger(null, { now });
  ledger = recordRun(ledger, run({ observedAt: '2026-11-05T00:00:00Z' }), {
    now,
  }).ledger;
  const pruned = loadLedger(ledger, { now });
  assert.deepEqual(pruned.failures, []);
});

test('retry quota allows one rerun per head base workflow per day', () => {
  let ledger = loadLedger(null, { now });
  const key = {
    headSha: HEAD_A,
    baseSha: BASE_1,
    workflowPath: '.github/workflows/source-validation.yml',
  };
  assert.deepEqual(canRetry(ledger, key, { now }), {
    allowed: true,
    used: 0,
    max: MAX_RETRIES_PER_WINDOW,
  });
  ledger = recordRetry(ledger, key, { now }).ledger;
  assert.equal(canRetry(ledger, key, { now }).allowed, false);
  assert.equal(
    canRetry(ledger, key, { now: now + 25 * 3600000 }).allowed,
    true
  );
  assert.throws(() => recordRetry(ledger, key, { now }), /rate limit/i);
});

test('normalizeRun rejects untrusted records', () => {
  assert.throws(
    () => normalizeRun(run({ workflowPath: 'evil.yml' })),
    /workflow path/i
  );
  assert.throws(() => normalizeRun(run({ headSha: 'nope' })), /head SHA/i);
  assert.throws(
    () => normalizeRun(run({ conclusion: 'skipped' })),
    /conclusion/i
  );
  assert.throws(
    () => normalizeRun(run({ observedAt: 'nope' })),
    /observation time/i
  );
  assert.throws(
    () => normalizeRun(run({ failedSubjects: ['bad\nsubject'] })),
    /subject/i
  );
});

test('the rerun classifier allows infrastructure classes only', () => {
  for (const evidence of [
    'fatal: unable to access',
    'could not resolve host: github.com',
    'HTTP 429 rate limit exceeded',
    '502 Bad Gateway from cache service',
    'The runner has received a shutdown signal',
    'Process completed with exit code 143',
  ]) {
    const result = classifyRerunEligibility({
      conclusion: 'failure',
      annotationText: evidence,
    });
    assert.deepEqual(
      { retryable: result.retryable, kind: result.kind },
      { retryable: true, kind: 'transient-infrastructure' },
      evidence
    );
  }
});

test('test assertions are never retryable, even with infra words nearby', () => {
  for (const evidence of [
    'FAIL tests/unit/ci/x.test.mjs > example\nAssertionError: expected 1 to be 2',
    'vitest exited with code 1',
    'expect(received).toBe(expected)',
    'error TS2322: Type X is not assignable',
  ]) {
    const result = classifyRerunEligibility({
      conclusion: 'failure',
      annotationText: `${evidence}\n502 Bad Gateway`,
    });
    assert.equal(result.retryable, false, evidence);
    assert.equal(result.kind, 'test-assertion');
  }
});

test('unclassified and non-failure evidence fails closed', () => {
  assert.deepEqual(
    classifyRerunEligibility({
      conclusion: 'failure',
      annotationText: 'Process completed with exit code 1',
    }),
    {
      retryable: false,
      kind: 'unclassified',
      reason: 'no recognized infrastructure signature',
    }
  );
  for (const conclusion of ['success', 'cancelled', 'timed_out', undefined])
    assert.equal(classifyRerunEligibility({ conclusion }).retryable, false);
});
