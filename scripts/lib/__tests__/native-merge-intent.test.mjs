import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  parseArgs,
  QUERY,
  submitMergeIntent,
} from '../../native-merge-intent.mjs';

const head = 'a'.repeat(40);
const directories = [];
afterEach(() => {
  for (const path of directories.splice(0))
    rmSync(path, { recursive: true, force: true });
});
function fixture({
  states = [{}],
  checks = [{ name: 'PR Ready', bucket: 'pass' }],
  checkCode = 0,
  mergeCode = 0,
  throwMerge = false,
  viewer = 'test-owner',
} = {}) {
  const receiptDir = mkdtempSync(join(tmpdir(), 'native-intent-'));
  directories.push(receiptDir);
  const options = { repo: 'JovieInc/Jovie', pr: 42, head, receiptDir };
  const calls = [];
  let reads = 0;
  const exec = async args => {
    calls.push(args);
    if (args[0] === 'api') {
      const patch = states[Math.min(reads++, states.length - 1)];
      if (patch === null) return { code: 1, stdout: '' };
      return {
        code: 0,
        stdout: JSON.stringify({
          data: {
            viewer: { login: viewer },
            repository: {
              pullRequest: {
                headRefOid: head,
                baseRefName: 'main',
                state: 'OPEN',
                isDraft: false,
                mergeable: 'MERGEABLE',
                reviewDecision: null,
                isMergeQueueEnabled: true,
                isInMergeQueue: false,
                autoMergeRequest: null,
                mergeQueueEntry: null,
                timelineItems: { nodes: [] },
                ...patch,
              },
            },
          },
        }),
      };
    }
    if (args[1] === 'checks')
      return { code: checkCode, stdout: JSON.stringify(checks) };
    if (throwMerge) throw new Error('transport lost');
    return { code: mergeCode, stdout: '' };
  };
  return {
    options,
    exec,
    policy: async () => ({ allowed: true }),
    calls,
    mutations: () => calls.filter(args => args[1] === 'merge'),
  };
}

test('pending required checks record native intent with exact SHA and no bypass', async () => {
  const f = fixture({
    states: [{}, {}, { autoMergeRequest: { enabledAt: 'now' } }],
    checks: [{ name: 'PR Ready', bucket: 'pending' }],
    checkCode: 8,
  });
  const result = await submitMergeIntent(f.options, f);
  assert.equal(result.status, 'intent-recorded');
  assert.deepEqual(f.mutations(), [
    [
      'pr',
      'merge',
      '42',
      '--repo',
      'JovieInc/Jovie',
      '--auto',
      '--match-head-commit',
      head,
    ],
  ]);
  assert.equal(
    (await submitMergeIntent(f.options, f)).status,
    'intent-recorded'
  );
  assert.equal(f.mutations().length, 1);
});

test('queue requires both native membership and positive position', async () => {
  for (const position of [null, 0, 2]) {
    const f = fixture({
      states: [
        {
          isMergeQueueEnabled: true,
          isInMergeQueue: true,
          mergeQueueEntry: { position },
        },
      ],
    });
    const result = await submitMergeIntent(f.options, f);
    assert.equal(result.status, position === 2 ? 'queued' : 'unknown');
    assert.equal(f.mutations().length, 0);
  }
});

test('blocks stale SHA, drafts, conflicts, unknown mergeability, closed, base and review holds', async () => {
  for (const patch of [
    { headRefOid: 'b'.repeat(40) },
    { isDraft: true },
    { isMergeQueueEnabled: false },
    { mergeable: 'CONFLICTING' },
    { mergeable: 'UNKNOWN' },
    { state: 'CLOSED' },
    { baseRefName: 'release' },
    { reviewDecision: 'CHANGES_REQUESTED' },
    { reviewDecision: 'REVIEW_REQUIRED' },
  ]) {
    const f = fixture({ states: [patch] });
    assert.equal((await submitMergeIntent(f.options, f)).status, 'blocked');
    assert.equal(f.mutations().length, 0);
  }
});

test('head change during check lookup prevents request', async () => {
  const f = fixture({ states: [{}, { headRefOid: 'b'.repeat(40) }] });
  assert.equal((await submitMergeIntent(f.options, f)).reason, 'stale-head');
  assert.equal(f.mutations().length, 0);
});

test('terminal required checks and missing or malformed metadata fail closed', async () => {
  for (const checks of [
    [],
    null,
    [{ name: 'PR Ready', bucket: 'fail' }],
    [{ name: 'PR Ready', bucket: 'cancel' }],
    [{ name: 'PR Ready', bucket: 'unknown' }],
  ]) {
    const f = fixture({ checks });
    assert.equal((await submitMergeIntent(f.options, f)).status, 'blocked');
    assert.equal(f.mutations().length, 0);
  }
});

test('ambiguous request reconciles accepted queue without retry', async () => {
  const f = fixture({
    states: [
      {},
      {},
      {
        isMergeQueueEnabled: true,
        isInMergeQueue: true,
        mergeQueueEntry: { position: 1 },
      },
    ],
    mergeCode: 1,
  });
  assert.equal((await submitMergeIntent(f.options, f)).status, 'queued');
  assert.equal(f.mutations().length, 1);
});

test('uncertain success/error/exception survives restart without blind resubmission', async () => {
  for (const flags of [{}, { mergeCode: 1 }, { throwMerge: true }]) {
    const f = fixture(flags);
    assert.equal(
      (await submitMergeIntent(f.options, f)).reason,
      'request-outcome-unconfirmed'
    );
    assert.equal(
      (await submitMergeIntent(f.options, f)).reason,
      'previous-attempt-requires-owner-reconciliation'
    );
    assert.equal(f.mutations().length, 1);
  }
});

test('concurrent completion events issue at most one mutation', async () => {
  const f = fixture();
  await Promise.all([
    submitMergeIntent(f.options, f),
    submitMergeIntent(f.options, f),
  ]);
  assert.equal(f.mutations().length, 1);
});

test('every removal blocks ordinary callers even when beforeCommit is a synthetic group SHA', async () => {
  for (const oid of [head, null, 'b'.repeat(40)]) {
    const f = fixture({
      states: [
        {
          timelineItems: {
            nodes: [
              {
                id: 'MQR_latest-removal',
                beforeCommit: oid ? { oid } : null,
                reason: 'failed_checks',
              },
            ],
          },
        },
      ],
    });
    const result = await submitMergeIntent(f.options, f);
    assert.equal(f.mutations().length, 0);
    assert.equal(result.reason, 'queue-ejected-requires-owner-reconciliation');
    assert.equal(result.removalEventId, 'MQR_latest-removal');
  }
});

const removalId = 'MQR_latest-removal';
function removed(id = removalId) {
  return {
    timelineItems: {
      nodes: [
        {
          id,
          beforeCommit: { oid: 'f3e8fd874a474c57b65cb903b612792acade79d0' },
          reason: 'failed_checks',
        },
      ],
    },
  };
}
function reconcile(
  f,
  patch = {},
  path = join(f.options.receiptDir, 'owner-reconciliation.json')
) {
  const record = {
    schema: 'jovie-native-merge-reconciliation/v1',
    repository: f.options.repo,
    prNumber: f.options.pr,
    headSha: f.options.head,
    removalEventId: removalId,
    decision: 'retry-once',
    owner: 'test-owner',
    evidence:
      'Independent review: transient infrastructure failure resolved; exact source checks requalified.',
    ...patch,
  };
  writeFileSync(path, JSON.stringify(record));
  return {
    ...f.options,
    reconcileRemoval: record.removalEventId,
    reconciliationReceipt: path,
  };
}

test('owner-bound exact removal permits one request and retains immutable event evidence', async () => {
  const f = fixture({
    states: [
      removed(),
      removed(),
      { ...removed(), isInMergeQueue: true, mergeQueueEntry: { position: 2 } },
    ],
  });
  const result = await submitMergeIntent(reconcile(f), f);
  assert.equal(result.status, 'queued');
  assert.equal(f.mutations().length, 1);
  const receipt = JSON.parse(readFileSync(result.receipt, 'utf8'));
  assert.equal(receipt.removalEventId, removalId);
  assert.equal(receipt.head, head);
  assert.equal(receipt.reconciliation.owner, 'test-owner');
  assert.ok(f.calls[0].includes(`query=${QUERY}`));
  assert.ok(QUERY.includes('RemovedFromMergeQueueEvent{id beforeCommit'));
  assert.ok(QUERY.includes('viewer{login}'));
});

test('ambiguous reconciliation cannot replay with changed evidence, path, or coordinator instance', async () => {
  const f = fixture({ states: [removed()], mergeCode: 1 });
  const first = await submitMergeIntent(reconcile(f), f);
  assert.equal(first.status, 'unknown');
  assert.equal(f.mutations().length, 1);
  const options = reconcile(
    f,
    { evidence: 'Another report for the same event is not a new operation.' },
    join(f.options.receiptDir, 'different-proof.json')
  );
  const again = await submitMergeIntent(options, { ...f });
  assert.equal(again.reason, 'previous-attempt-requires-owner-reconciliation');
  assert.equal(again.receipt, first.receipt);
  assert.equal(f.mutations().length, 1);
});

test('a later removal requires its own explicit reconciliation while preserving prior claim', async () => {
  const f = fixture({ states: [removed()], mergeCode: 1 });
  const first = await submitMergeIntent(reconcile(f), f);
  const next = fixture({ states: [removed('MQR_new-removal')], mergeCode: 1 });
  next.options.receiptDir = f.options.receiptDir;
  const stale = await submitMergeIntent(reconcile(next), next);
  assert.equal(stale.reason, 'reconciliation-removal-changed');
  assert.equal(next.mutations().length, 0);
  const second = await submitMergeIntent(
    reconcile(next, { removalEventId: 'MQR_new-removal' }),
    next
  );
  assert.equal(second.status, 'unknown');
  assert.equal(next.mutations().length, 1);
  assert.notEqual(first.receipt, second.receipt);
  assert.equal(
    JSON.parse(readFileSync(first.receipt, 'utf8')).removalEventId,
    removalId
  );
});

test('unbound, missing, oversized, and malformed reconciliation receipts never mutate', async () => {
  const f = fixture({ states: [removed()] });
  for (const patch of [
    { schema: 'other' },
    { repository: 'other/repo' },
    { prNumber: 9 },
    { headSha: 'c'.repeat(40) },
    { decision: 'retry-forever' },
    { owner: ' ' },
    { evidence: ' ' },
  ]) {
    assert.equal(
      (await submitMergeIntent(reconcile(f, patch), f)).reason,
      'reconciliation-receipt-invalid'
    );
  }
  const options = reconcile(f);
  for (const content of ['not-json', 'x'.repeat(65537), 'null']) {
    writeFileSync(options.reconciliationReceipt, content);
    assert.equal(
      (await submitMergeIntent(options, f)).reason,
      'reconciliation-receipt-invalid'
    );
  }
  rmSync(options.reconciliationReceipt);
  assert.equal(
    (await submitMergeIntent(options, f)).reason,
    'reconciliation-receipt-invalid'
  );
  const wrongEvent = reconcile(f);
  wrongEvent.reconcileRemoval = 'MQR_not-receipted';
  assert.equal(
    (await submitMergeIntent(wrongEvent, f)).reason,
    'reconciliation-receipt-invalid'
  );
  assert.equal(f.mutations().length, 0);
});

test('latest removal and authenticated owner must match on both authoritative reads', async () => {
  for (const viewer of ['another-owner', '']) {
    const f = fixture({ states: [removed()], viewer });
    assert.equal(
      (await submitMergeIntent(reconcile(f), f)).reason,
      'reconciliation-owner-mismatch'
    );
    assert.equal(f.mutations().length, 0);
  }
  for (const last of [
    removed('MQR_new-removal'),
    {},
    { ...removed(), headRefOid: 'c'.repeat(40) },
  ]) {
    const f = fixture({ states: [removed(), last] });
    assert.equal((await submitMergeIntent(reconcile(f), f)).status, 'blocked');
    assert.equal(f.mutations().length, 0);
  }
  const f = fixture({ states: [removed()] });
  const original = f.exec;
  let reads = 0;
  const outcome = await submitMergeIntent(reconcile(f), {
    ...f,
    exec: async args => {
      const response = await original(args);
      if (args[0] === 'api' && ++reads === 2) {
        const data = JSON.parse(response.stdout);
        data.data.viewer.login = 'new-owner';
        response.stdout = JSON.stringify(data);
      }
      return response;
    },
  });
  assert.equal(outcome.reason, 'reconciliation-owner-mismatch');
  assert.equal(f.mutations().length, 0);
});

test('explicit reconciliation retains required check and source integrity policy gates', async () => {
  const failed = fixture({
    states: [removed()],
    checks: [{ name: 'PR Ready', bucket: 'fail' }],
    checkCode: 1,
  });
  assert.equal(
    (await submitMergeIntent(reconcile(failed), failed)).status,
    'blocked'
  );
  assert.equal(failed.mutations().length, 0);
  const held = fixture({ states: [removed()] });
  assert.equal(
    (
      await submitMergeIntent(reconcile(held), {
        ...held,
        policy: async () => ({ allowed: false, blockers: ['hold'] }),
      })
    ).reason,
    'source-policy-blocked'
  );
  assert.equal(held.mutations().length, 0);
});

test('merged response is distinct; stale merged SHA never proves requested head', async () => {
  const f = fixture({ states: [{ state: 'MERGED' }] });
  assert.equal((await submitMergeIntent(f.options, f)).status, 'merged');
  assert.equal(f.mutations().length, 0);
});

test('read failures before and after request remain unknown', async () => {
  const before = fixture({ states: [null] });
  assert.equal(
    (await submitMergeIntent(before.options, before)).status,
    'unknown'
  );
  assert.equal(before.mutations().length, 0);
  const after = fixture({ states: [{}, {}, null] });
  assert.equal(
    (await submitMergeIntent(after.options, after)).status,
    'unknown'
  );
  assert.equal(after.mutations().length, 1);
});

test('explicit inputs reject shell-like or abbreviated identifiers', async () => {
  const f = fixture();
  for (const patch of [
    { repo: 'x;evil/y' },
    { head: 'abc' },
    { pr: -1 },
    { pr: '1;evil' },
    { reconcileRemoval: removalId },
    { reconciliationReceipt: '/tmp/proof.json' },
    {
      reconcileRemoval: 'node with spaces',
      reconciliationReceipt: '/tmp/proof.json',
    },
  ]) {
    await assert.rejects(submitMergeIntent({ ...f.options, ...patch }, f));
  }
  assert.deepEqual(parseArgs(['--repo', 'a/b', '--pr', '1', '--head', head]), {
    repo: 'a/b',
    pr: '1',
    head,
  });
  assert.deepEqual(
    parseArgs([
      '--reconcile-removal',
      removalId,
      '--reconciliation-receipt',
      '/proof.json',
    ]),
    { reconcileRemoval: removalId, reconciliationReceipt: '/proof.json' }
  );
  assert.throws(() => parseArgs(['--admin', 'true']));
  assert.throws(() => parseArgs(['--pr']));
  assert.throws(() => parseArgs(['--pr', '1', '--pr', '2']));
});

test('source integrity policy holds and policy errors block mutation', async () => {
  const f = fixture();
  const blocked = await submitMergeIntent(f.options, {
    ...f,
    policy: async () => ({ allowed: false, blockers: ['integrity-hold'] }),
  });
  assert.equal(blocked.reason, 'source-policy-blocked');
  assert.deepEqual(blocked.blockers, ['integrity-hold']);
  const unknown = await submitMergeIntent(f.options, {
    ...f,
    policy: async () => {
      throw new Error('unavailable');
    },
  });
  assert.equal(unknown.reason, 'source-policy-unavailable');
  assert.equal(f.mutations().length, 0);
});

test('real CLI reports invalid input, gh read failures, and native queued proof', () => {
  const dir = mkdtempSync(join(tmpdir(), 'native-cli-'));
  directories.push(dir);
  const cli = fileURLToPath(
    new URL('../../native-merge-intent.mjs', import.meta.url)
  );
  const args = ['--repo', 'JovieInc/Jovie', '--pr', '42', '--head', head];
  const env = { ...process.env, PATH: `${dir}:${process.env.PATH}` };
  const invoke = more =>
    spawnSync(process.execPath, [cli, ...more], { env, encoding: 'utf8' });
  assert.equal(invoke(['--bad']).status, 1);
  writeFileSync(join(dir, 'gh'), '#!/bin/sh\nexit 1\n', { mode: 0o700 });
  assert.equal(JSON.parse(invoke(args).stdout).reason, 'readback-failed');
  const response = JSON.stringify({
    data: {
      repository: {
        pullRequest: {
          headRefOid: head,
          baseRefName: 'main',
          state: 'OPEN',
          isMergeQueueEnabled: true,
          isInMergeQueue: true,
          mergeQueueEntry: { position: 3 },
          timelineItems: { nodes: [] },
        },
      },
    },
  });
  writeFileSync(join(dir, 'gh'), `#!/bin/sh\nprintf '%s' '${response}'\n`, {
    mode: 0o700,
  });
  const queued = invoke(args);
  assert.equal(queued.status, 0);
  assert.equal(JSON.parse(queued.stdout).position, 3);
});

test('incomplete GraphQL/check responses and unwritable receipt do not mutate', async () => {
  const f = fixture();
  const malformed = async args =>
    args[0] === 'api' ? { code: 0, stdout: '{"data":{}}' } : f.exec(args);
  assert.equal(
    (await submitMergeIntent(f.options, { ...f, exec: malformed })).reason,
    'readback-failed'
  );
  const invalidChecks = async args =>
    args[1] === 'checks' ? { code: 0, stdout: 'bad' } : f.exec(args);
  assert.equal(
    (await submitMergeIntent(f.options, { ...f, exec: invalidChecks })).reason,
    'required-checks-unavailable'
  );
  const file = join(f.options.receiptDir, 'file');
  writeFileSync(file, 'occupied');
  assert.equal(
    (await submitMergeIntent({ ...f.options, receiptDir: file }, f)).reason,
    'receipt-write-failed'
  );
  assert.equal(f.mutations().length, 0);
});
