// Tests for the security-advisory-intake close-scan and close-runner additions.
// Split from security-advisory-intake.test.mjs to stay under the size-500
// guard's default budget; node --test picks both files up.

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { resolveLinearIssueByFingerprint } from './lib/linear-issue-intake.mjs';
import { logFailedLinearAction, withLinearRetry } from './lib/linear-retry.mjs';
import {
  CLOSE_SCAN_MAX_PAGES,
  listSecadvIssueCandidates,
  runAdvisoryCloses,
} from './security-advisory-intake.mjs';

function linearPage(nodes, hasNextPage, endCursor) {
  return {
    data: { issues: { nodes, pageInfo: { hasNextPage, endCursor } } },
  };
}

function candidateNode(id, title, labelNames = []) {
  return {
    id,
    identifier: 'JOV-1',
    url: 'https://linear.app/jovie/issue/JOV-1',
    title,
    state: { id: 's1', name: 'Todo', type: 'unstarted' },
    labels: { nodes: labelNames.map(name => ({ id: name, name })) },
  };
}

test('close-candidate scan pages Linear results until exhausted', async () => {
  const pages = [
    linearPage(
      [
        candidateNode(
          'i1',
          '[secadv-ghsa-aaaa-bbbb-cccc-left-pad] HIGH left-pad: bad'
        ),
      ],
      true,
      'cursor-1'
    ),
    linearPage(
      [
        candidateNode(
          'i2',
          '[secadv-ghsa-cccc-dddd-eeee-right-pad] MEDIUM right-pad: worse'
        ),
      ],
      false,
      null
    ),
  ];
  let calls = 0;
  const fetchImpl = /** @type {any} */ (
    async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(pages[calls++]),
    })
  );
  const scan = await listSecadvIssueCandidates({
    apiKey: `k-${randomUUID()}`,
    fetchImpl,
  });
  assert.equal(scan.ok, true);
  assert.equal(scan.nodes.length, 2);
  assert.equal(scan.truncated, false);
  assert.equal(calls, 2);
});

test('close-candidate scan reports truncation at the page cap', async () => {
  let calls = 0;
  const fetchImpl = /** @type {any} */ (
    async () => {
      calls += 1;
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify(
            linearPage(
              [candidateNode(`i${calls}`, '[secadv-x] always another page')],
              true,
              `cursor-${calls}`
            )
          ),
      };
    }
  );
  const scan = await listSecadvIssueCandidates({
    apiKey: `k-${randomUUID()}`,
    fetchImpl,
  });
  assert.equal(scan.ok, true);
  assert.equal(calls, CLOSE_SCAN_MAX_PAGES);
  assert.equal(scan.truncated, true);
});

test('close-candidate scan fails closed on a Linear rate limit', async () => {
  const fetchImpl = /** @type {any} */ (
    async () => ({
      ok: false,
      status: 429,
      text: async () => '',
    })
  );
  const scan = await listSecadvIssueCandidates({
    apiKey: `k-${randomUUID()}`,
    fetchImpl,
  });
  assert.equal(scan.ok, false);
  assert.equal(scan.reason, 'linear_rate_limited');
});

test('close-candidate scan fails closed on a GraphQL error', async () => {
  const fetchImpl = /** @type {any} */ (
    async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ errors: [{ message: 'nope' }] }),
    })
  );
  const scan = await listSecadvIssueCandidates({
    apiKey: `k-${randomUUID()}`,
    fetchImpl,
  });
  assert.equal(scan.ok, false);
  assert.equal(scan.reason, 'linear_close_scan_graphql_error');
});

test('close-candidate scan requires an api key', async () => {
  const scan = await listSecadvIssueCandidates({ apiKey: '' });
  assert.equal(scan.ok, false);
  assert.equal(scan.reason, 'missing_linear_api_key');
});

test('scan nodes resolve candidates by title fingerprint and label, and skip non-matches', () => {
  const nodes = [
    candidateNode('i1', '[secadv-ghsa-aaaa-bbbb-cccc-left-pad] HIGH left-pad'),
    candidateNode('i2', 'Secadv intake hand-retitled', [
      'remediation:secadv-ghsa-aaaa-bbbb-cccc-right-pad',
    ]),
  ];
  assert.ok(
    resolveLinearIssueByFingerprint(
      nodes,
      'secadv-ghsa-aaaa-bbbb-cccc-left-pad'
    )
  );
  assert.ok(
    resolveLinearIssueByFingerprint(
      nodes,
      'secadv-ghsa-aaaa-bbbb-cccc-right-pad'
    )
  );
  assert.equal(
    resolveLinearIssueByFingerprint(nodes, 'secadv-ghsa-zzzz-yyyy-xxxx-none'),
    null
  );
});

const closeGroup = (fingerprint, fixedAt = '2026-10-25T00:00:00Z') => ({
  fingerprint,
  fixedAt,
  deployedAt: '2026-10-25T01:00:00Z',
});

test('runAdvisoryCloses defers the tail after a rate limit and fails closed', async () => {
  const calls = [];
  const r = await runAdvisoryCloses({
    closes: [
      closeGroup('secadv-ghsa-aaaa-bbbb-cccc-left-pad'),
      closeGroup('secadv-ghsa-cccc-dddd-eeee-right-pad'),
    ],
    candidates: [
      candidateNode(
        'i1',
        '[secadv-ghsa-aaaa-bbbb-cccc-left-pad] HIGH left-pad'
      ),
      candidateNode(
        'i2',
        '[secadv-ghsa-cccc-dddd-eeee-right-pad] MED right-pad'
      ),
    ],
    runId: 'run-1',
    comment: 'fixed',
    close: async input => {
      calls.push(input.fingerprint);
      return { ok: false, reason: 'linear_rate_limited' };
    },
  });
  assert.equal(r.ok, false);
  assert.deepEqual(calls, ['secadv-ghsa-aaaa-bbbb-cccc-left-pad']);
  assert.deepEqual(r.actions, [
    {
      fingerprint: 'secadv-ghsa-aaaa-bbbb-cccc-left-pad',
      op: 'close',
      ok: false,
      action: undefined,
    },
    {
      fingerprint: 'secadv-ghsa-cccc-dddd-eeee-right-pad',
      op: 'close',
      ok: false,
      action: 'deferred_rate_limited',
    },
  ]);
});

test('runAdvisoryCloses fails closed when a rate limit lands on the LAST group', async () => {
  const r = await runAdvisoryCloses({
    closes: [closeGroup('secadv-ghsa-aaaa-bbbb-cccc-left-pad')],
    candidates: [
      candidateNode(
        'i1',
        '[secadv-ghsa-aaaa-bbbb-cccc-left-pad] HIGH left-pad'
      ),
    ],
    close: async () => ({ ok: false, reason: 'linear_rate_limited' }),
  });
  assert.equal(r.ok, false);
  assert.equal(r.actions[0].ok, false);
});

test('runAdvisoryCloses records noop for groups without a candidate issue', async () => {
  let calls = 0;
  const r = await runAdvisoryCloses({
    closes: [closeGroup('secadv-ghsa-zzzz-yyyy-xxxx-none')],
    candidates: [
      candidateNode(
        'i1',
        '[secadv-ghsa-aaaa-bbbb-cccc-left-pad] HIGH left-pad'
      ),
    ],
    close: async () => {
      calls += 1;
      return { ok: true, action: 'resolved' };
    },
  });
  assert.equal(r.ok, true);
  assert.equal(calls, 0, 'no Linear close must fire without a candidate');
  assert.deepEqual(r.actions, [
    {
      fingerprint: 'secadv-ghsa-zzzz-yyyy-xxxx-none',
      op: 'close',
      ok: true,
      action: 'none',
    },
  ]);
});

test('runAdvisoryCloses closes matched groups and stays green while all succeed', async () => {
  const r = await runAdvisoryCloses({
    closes: [closeGroup('secadv-ghsa-aaaa-bbbb-cccc-left-pad')],
    candidates: [
      candidateNode(
        'i1',
        '[secadv-ghsa-aaaa-bbbb-cccc-left-pad] HIGH left-pad'
      ),
    ],
    runId: 'run-9',
    commentFor: g => `Fixed on main at ${g.fixedAt} and deployed.`,
    close: async input => {
      assert.equal(input.fingerprint, 'secadv-ghsa-aaaa-bbbb-cccc-left-pad');
      assert.equal(input.runId, 'run-9');
      assert.equal(
        input.comment,
        'Fixed on main at 2026-10-25T00:00:00Z and deployed.'
      );
      return { ok: true, action: 'resolved' };
    },
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.actions, [
    {
      fingerprint: 'secadv-ghsa-aaaa-bbbb-cccc-left-pad',
      op: 'close',
      ok: true,
      action: 'resolved',
    },
  ]);
});

test('runAdvisoryCloses fails closed on a non-rate-limit close failure', async () => {
  const r = await runAdvisoryCloses({
    closes: [closeGroup('secadv-ghsa-aaaa-bbbb-cccc-left-pad')],
    candidates: [
      candidateNode(
        'i1',
        '[secadv-ghsa-aaaa-bbbb-cccc-left-pad] HIGH left-pad'
      ),
    ],
    close: async () => ({ ok: false, reason: 'linear_close_unsuccessful' }),
  });
  assert.equal(r.ok, false);
});

test('withLinearRetry retries a transient failure and returns the recovered result', async () => {
  let attempts = 0;
  const waits = [];
  const result = await withLinearRetry(
    async () => {
      attempts += 1;
      if (attempts < 3) return { ok: false, reason: 'linear_search_transport' };
      return { ok: true, action: 'resolved' };
    },
    {
      fingerprint: 'secadv-x',
      op: 'upsert',
      delays: [1, 1],
      sleep: async ms => waits.push(ms),
    }
  );
  assert.equal(result.ok, true);
  assert.deepEqual(waits, [1, 1]);
});

test('withLinearRetry fails closed after exhausting retries on a transient failure', async () => {
  let attempts = 0;
  const result = await withLinearRetry(
    async () => {
      attempts += 1;
      return { ok: false, reason: 'linear_rate_limited' };
    },
    {
      fingerprint: 'secadv-x',
      op: 'upsert',
      delays: [1, 1],
      sleep: async () => {},
    }
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'linear_rate_limited');
  assert.equal(attempts, 3);
});

test('withLinearRetry returns a deterministic failure without retrying', async () => {
  let attempts = 0;
  const result = await withLinearRetry(
    async () => {
      attempts += 1;
      return { ok: false, reason: 'linear_search_401' };
    },
    {
      fingerprint: 'secadv-x',
      op: 'upsert',
      delays: [1, 1, 1],
      sleep: async () => {},
    }
  );
  assert.equal(result.ok, false);
  assert.equal(attempts, 1, 'auth failures must not be retried');
});

test('logFailedLinearAction names the failing op, fingerprint and reason', () => {
  const lines = [];
  logFailedLinearAction(
    { fingerprint: 'secadv-ghsa-x', op: 'upsert', reason: 'linear_search_502' },
    { log: line => lines.push(line) }
  );
  assert.equal(lines.length, 1);
  assert.match(
    lines[0],
    /upsert for secadv-ghsa-x failed \(linear_search_502\)/
  );
});
