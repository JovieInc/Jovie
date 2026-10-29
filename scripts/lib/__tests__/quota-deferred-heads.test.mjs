import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fleetRulesQuotaShare,
  metric,
  staleQuotaDeferredHeads,
} from '../../quota-deferred-heads.mjs';

const now = Date.parse('2026-10-25T18:00:00Z');
const row = (number, completedAt, annotations, conclusion = 'FAILURE') => ({
  number,
  headSha: 'a'.repeat(40),
  completedAt,
  conclusion,
  annotations,
});
const quota =
  'Fleet rule evidence unavailable: GitHub API quota or outage (github-quota-deferred)';

test('counts only quota-deferred failures older than the limit', () => {
  const rows = [
    row(1, '2026-10-25T16:00:00Z', [quota]),
    row(2, '2026-10-25T17:50:00Z', [quota]),
    row(3, '2026-10-25T16:00:00Z', [
      'red-before-green: include Failing command',
    ]),
    row(4, '2026-10-25T16:00:00Z', [quota], 'SUCCESS'),
  ];
  assert.deepEqual(
    staleQuotaDeferredHeads(rows, now).map(h => h.number),
    [1]
  );
  assert.equal(metric(rows, now).value, 1);
  assert.equal(metric([], now).value, 0);
});

test('quota share counts quota-marked failures and advisory quota hits', () => {
  const infra = ['Infrastructure, not a verdict: (github-quota-deferred)'];
  const runs = [
    { conclusion: 'failure', annotations: [quota] },
    { conclusion: 'failure', annotations: ['red-before-green: x'] },
    { conclusion: 'failure', annotations: [] },
    { conclusion: 'failure', annotations: [quota] },
    { conclusion: 'success', annotations: infra },
    { conclusion: 'success', annotations: [] },
  ];
  const share = fleetRulesQuotaShare(runs);
  assert.equal(share.failures, 4);
  assert.equal(share.quota_failures, 2);
  assert.equal(share.quota_failure_share, 0.5);
  assert.equal(share.quota_hits, 3);
  assert.equal(share.quota_hit_share, 0.5);
  assert.equal(fleetRulesQuotaShare([]).quota_failure_share, 0);
});
