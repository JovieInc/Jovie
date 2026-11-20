import assert from 'node:assert/strict';
import test from 'node:test';
import { ciRoundsMetrics, flattenCiRounds } from '../ci-rounds.mjs';

const run = (branch, sha, at, conclusion, attempt = 1) => ({
  path: '.github/workflows/source-validation.yml',
  head_branch: branch,
  head_sha: sha,
  created_at: at,
  conclusion,
  run_attempt: attempt,
  status: 'completed',
});
const pr = (n, branch) => ({
  number: n,
  headRefName: branch,
  mergedAt: '2026-10-28T12:00:00Z',
});

test('counts distinct head shas as rounds and scores the first push', () => {
  const runs = [
    run('a', 's1', '2026-10-28T01:00:00Z', 'failure'),
    run('a', 's2', '2026-10-28T02:00:00Z', 'failure'),
    run('a', 's3', '2026-10-28T03:00:00Z', 'success'),
    run('b', 't1', '2026-10-28T01:00:00Z', 'success'),
  ];
  const m = ciRoundsMetrics(runs, [pr(1, 'a'), pr(2, 'b')], {
    sinceMs: Date.parse('2026-10-27T00:00:00Z'),
    nowMs: Date.parse('2026-10-29T00:00:00Z'),
  });
  assert.equal(m.prs, 2);
  assert.equal(m.roundsMean, 2);
  assert.equal(m.roundsP95, 3);
  assert.equal(m.firstPushPassRate, 0.5);
});

test('a flaky re-run of the same sha is one round and the last attempt decides', () => {
  const runs = [
    run('a', 's1', '2026-10-28T01:00:00Z', 'failure', 1),
    run('a', 's1', '2026-10-28T01:30:00Z', 'success', 2),
  ];
  const m = ciRoundsMetrics(runs, [pr(1, 'a')]);
  assert.equal(m.roundsMean, 1);
  assert.equal(m.firstPushPassRate, 1);
});

test('no data is null, not zero', () => {
  const m = ciRoundsMetrics([], [pr(1, 'a')]);
  assert.equal(m.prs, 0);
  assert.deepEqual(flattenCiRounds(m), {
    'ci_rounds.per_merged_pr.mean': null,
    'ci_rounds.per_merged_pr.p95': null,
    'source_validation.first_push_pass_rate': null,
  });
});

test('ignores other workflows and PRs merged outside the window', () => {
  const other = {
    ...run('a', 's1', '2026-10-28T01:00:00Z', 'success'),
    path: '.github/workflows/ci.yml',
  };
  const m = ciRoundsMetrics([other], [pr(1, 'a')]);
  assert.equal(m.prs, 0);
  const old = ciRoundsMetrics(
    [run('a', 's1', '2026-10-01T01:00:00Z', 'success')],
    [pr(1, 'a')],
    {
      sinceMs: Date.parse('2026-10-29T00:00:00Z'),
    }
  );
  assert.equal(old.prs, 0);
});
