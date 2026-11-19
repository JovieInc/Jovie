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
  reportMetrics,
  wilson95,
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
  failedSubjects: ['job:Unit Tests'],
  ...over,
});
const fresh = () => loadLedger(null, { now });

test('a verified flip (v1) is attempt-1 failure or timeout, later-attempt success', () => {
  let ledger = fresh();
  ledger = recordRun(ledger, run({ conclusion: 'timed_out' }), { now }).ledger;
  const result = recordRun(
    ledger,
    run({
      runId: 1,
      runAttempt: 2,
      conclusion: 'success',
      observedAt: '2026-11-19T11:00:00Z',
    }),
    { now }
  );
  assert.equal(result.flips.length, 1);
  assert.equal(result.flips[0].subject, 'job:Unit Tests');
  assert.equal(result.flips[0].kind, 'test');
});

test('attempt-1 success, or a first-observed later-attempt success, is not a flip', () => {
  const ledger = fresh();
  let result = recordRun(ledger, run({ conclusion: 'success' }), { now });
  assert.deepEqual(result.flips, []);
  // Same run, no recorded attempt-1 failure: unverifiable, not a flip.
  result = recordRun(
    result.ledger,
    run({
      runAttempt: 2,
      conclusion: 'success',
      observedAt: '2026-11-19T11:00:00Z',
    }),
    { now }
  );
  assert.deepEqual(result.flips, []);
});

test('a flip after main moved is a different base and is not a flake', () => {
  let ledger = fresh();
  ledger = recordRun(ledger, run(), { now }).ledger;
  const result = recordRun(
    ledger,
    run({
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
  const result = recordRun(fresh(), run({ baseSha: null }), { now });
  assert.deepEqual(result.flips, []);
  assert.deepEqual(result.ledger.failures, []);
});

test('two verified test flips in seven days make a repeat offender keyed on the test file', () => {
  let ledger = fresh();
  const flip = (runId, headSha, attempt, conclusion, at) =>
    recordRun(
      ledger,
      run({
        runId,
        headSha,
        runAttempt: attempt,
        conclusion,
        observedAt: at,
        testFile: 'apps/web/tests/unit/ci/example.test.ts',
      }),
      { now }
    ).ledger;
  ledger = flip(1, HEAD_A, 1, 'failure', '2026-11-18T09:00:00Z');
  ledger = flip(1, HEAD_A, 2, 'success', '2026-11-18T10:00:00Z');
  ledger = flip(2, HEAD_B, 1, 'timed_out', '2026-11-19T09:00:00Z');
  ledger = flip(2, HEAD_B, 2, 'success', '2026-11-19T10:00:00Z');
  const offenders = repeatOffenders(ledger, { now });
  assert.equal(offenders.length, 1);
  assert.equal(offenders[0].test, 'apps/web/tests/unit/ci/example.test.ts');
  assert.equal(offenders[0].flips, 2);
});

test('evidence-gate flips are counted separately and never quarantine a test', () => {
  let ledger = fresh();
  const gate = over => run({ failedSubjects: ['job:PR Ready'], ...over });
  ledger = recordRun(ledger, gate(), { now }).ledger;
  ledger = recordRun(
    ledger,
    gate({
      runAttempt: 2,
      conclusion: 'success',
      observedAt: '2026-11-19T11:00:00Z',
    }),
    { now }
  ).ledger;
  assert.deepEqual(repeatOffenders(ledger, { now }), []);
  const metrics = reportMetrics(ledger, { now });
  assert.equal(metrics.verifiedFlips, 1);
  assert.equal(metrics.evidenceGateFlips, 1);
  assert.equal(metrics.testFlips, 0);
});

test('bulk reruns (5+ runs by one actor in 10 minutes) never count as flakes', () => {
  let ledger = fresh();
  // The Nov 14 shape: five failing runs, then one actor bulk-reruns all five
  // within ten minutes. Every flip lands on the bulk line, none on flakes.
  for (let i = 1; i <= 5; i++)
    ledger = recordRun(
      ledger,
      run({
        runId: i,
        conclusion: 'failure',
        observedAt: '2026-11-19T09:00:00Z',
      }),
      { now }
    ).ledger;
  for (let i = 1; i <= 5; i++) {
    const at = new Date(
      Date.parse('2026-11-19T10:00:00Z') + i * 60_000
    ).toISOString();
    ledger = recordRun(
      ledger,
      run({
        runId: i,
        runAttempt: 2,
        conclusion: 'success',
        actor: 'itstimwhite',
        rerunAt: at,
        observedAt: at,
      }),
      { now }
    ).ledger;
  }
  assert.deepEqual(repeatOffenders(ledger, { now }), []);
  const metrics = reportMetrics(ledger, { now });
  assert.equal(metrics.bulkRerunRuns, 5);
  assert.equal(metrics.verifiedFlips, 0);
  // A different actor's rerun outside any bulk window still flips.
  const solo = recordRun(
    ledger,
    run({
      runId: 9,
      runAttempt: 1,
      conclusion: 'failure',
      observedAt: '2026-11-19T12:00:00Z',
    }),
    { now }
  ).ledger;
  const flipped = recordRun(
    solo,
    run({
      runId: 9,
      runAttempt: 2,
      conclusion: 'success',
      actor: 'ci-bot',
      rerunAt: '2026-11-19T13:00:00Z',
      observedAt: '2026-11-19T13:00:00Z',
    }),
    { now }
  );
  assert.equal(flipped.flips.length, 1);
  assert.equal(flipped.flips[0].kind, 'test');
});

test('reportMetrics publishes n and Wilson 95% intervals', () => {
  let ledger = fresh();
  for (let i = 1; i <= 100; i++) {
    ledger = recordRun(
      ledger,
      run({
        runId: i,
        conclusion: i <= 2 ? 'failure' : 'success',
        observedAt: '2026-11-19T10:00:00Z',
      }),
      { now }
    ).ledger;
    if (i <= 2)
      ledger = recordRun(
        ledger,
        run({
          runId: i,
          runAttempt: 2,
          conclusion: 'success',
          observedAt: '2026-11-19T10:05:00Z',
        }),
        { now }
      ).ledger;
  }
  const metrics = reportMetrics(ledger, { now });
  assert.equal(metrics.n, 102);
  assert.equal(metrics.verifiedFlips, 2);
  assert.equal(metrics.testFlips, 2);
  assert.ok(Math.abs(metrics.flipRate - 2 / 102) < 1e-9);
  assert.ok(metrics.flipCi95.lo >= 0 && metrics.flipCi95.hi <= 1);
  assert.ok(metrics.testFlipCi95.lo > 0 && metrics.testFlipCi95.hi < 1);
});

test('wilson95 is exact on a known value and null without samples', () => {
  // k=2, n=100, z=1.96: Wilson interval ~[0.0055, 0.0700]
  const ci = wilson95(2, 100);
  assert.ok(Math.abs(ci.lo - 0.0055) < 0.0005, JSON.stringify(ci));
  assert.ok(Math.abs(ci.hi - 0.07001) < 0.0005, JSON.stringify(ci));
  assert.equal(wilson95(0, 0), null);
});

test('the seven day window prunes old evidence', () => {
  const ledger = recordRun(
    fresh(),
    run({ observedAt: '2026-11-05T00:00:00Z' }),
    { now }
  ).ledger;
  assert.deepEqual(loadLedger(ledger, { now }).failures, []);
});

test('retry quota allows one rerun per head base workflow per day', () => {
  let ledger = fresh();
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

test('attempt-1 job subjects survive a success attempt that reports no subjects', () => {
  let ledger = fresh();
  // The hook records attempt 1 first (with its real failed job subjects),
  // then the later attempt whose event carries no failedSubjects.
  ledger = recordRun(ledger, run({ conclusion: 'failure' }), { now }).ledger;
  const result = recordRun(
    ledger,
    run({
      runAttempt: 2,
      conclusion: 'success',
      failedSubjects: [],
      observedAt: '2026-11-19T11:00:00Z',
    }),
    { now }
  );
  assert.equal(result.flips.length, 1);
  assert.equal(result.flips[0].subject, 'job:Unit Tests');
  assert.equal(result.flips[0].kind, 'test');
});
