import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planVictimRearms } from '../../merge-group-victim-rearm.mjs';
import {
  parseQueueBranch,
  RETRY_CONTEXT,
  retryDisposition,
  trustedRetryCount,
} from '../merge-queue-retry-policy.mjs';

const head = 'a'.repeat(40);
const base = () => ({ head, complete: true, removed: true });
const receipt = cls => ({ schema: 'ejection/v1', head, class: cls, run: 1 });
test('same-head code, size, conflict and unattributed failures require a new head', () => {
  for (const cls of ['code', 'size', 'conflict', 'unknown'])
    assert.equal(
      retryDisposition({ ...base(), receipts: [receipt(cls)] }).reason,
      'head-unchanged-non-infra'
    );
  assert.equal(retryDisposition(base()).allow, false);
});
test('first infra retry allowed, second infra retry skipped', () => {
  assert.deepEqual(
    retryDisposition({ ...base(), receipts: [receipt('infra')] }),
    { allow: true, reason: 'infra-retry', retry: true }
  );
  assert.equal(
    retryDisposition({ ...base(), receipts: [receipt('infra')], retries: 1 })
      .reason,
    'infra-retry-exhausted'
  );
  assert.equal(
    retryDisposition({
      ...base(),
      receipts: [receipt('infra'), { ...receipt('infra'), run: 2 }],
    }).reason,
    'infra-retry-exhausted'
  );
});
test('contract receives the same one-retry budget', () => {
  assert.equal(
    retryDisposition({ ...base(), receipts: [receipt('contract')] }).allow,
    true
  );
  assert.equal(
    retryDisposition({ ...base(), receipts: [receipt('contract')], retries: 1 })
      .allow,
    false
  );
});
test('cascade cancellation remains allowed without granting an unattributed failure a retry', () => {
  const run = {
    id: 2,
    head_branch: `gh-readonly-queue/main/pr-1-${head}`,
    conclusion: 'cancelled',
  };
  assert.equal(
    retryDisposition({ ...base(), cascade: true, runs: [run] }).reason,
    'cascade-rearm'
  );
  assert.equal(
    retryDisposition({
      ...base(),
      cascade: true,
      runs: [{ ...run, conclusion: 'failure' }],
    }).allow,
    false
  );
});
test('labels cannot excuse a run racing the classifier', () => {
  assert.equal(
    retryDisposition({
      ...base(),
      labels: ['mq-ejected:infra'],
      runs: [
        {
          id: 7,
          head_branch: `gh-readonly-queue/main/pr-1-${head}`,
          conclusion: 'failure',
        },
      ],
    }).allow,
    false
  );
});
test('old head receipts do not poison a new head', () => {
  assert.equal(
    retryDisposition({
      head: 'b'.repeat(40),
      complete: true,
      receipts: [receipt('code')],
      labels: ['mq-ejected:code'],
    }).allow,
    true
  );
});
test('circuit/systemic and incomplete evidence fail closed', () => {
  assert.equal(
    retryDisposition({ ...base(), cascade: true, circuitOpen: true }).reason,
    'circuit-open'
  );
  assert.equal(
    retryDisposition({ ...base(), receipts: [receipt('systemic')] }).reason,
    'circuit-open'
  );
  assert.equal(
    retryDisposition({ ...base(), complete: false, cascade: true }).allow,
    false
  );
});
test('manual unchanged-head dequeue requires explicit release', () => {
  assert.equal(
    retryDisposition({ ...base(), manual: true, cascade: true }).reason,
    'manual-release-required'
  );
  assert.equal(
    retryDisposition({ ...base(), manual: true, released: true, cascade: true })
      .allow,
    true
  );
});
test('branch parser accepts only the complete main queue identity', () => {
  assert.deepEqual(parseQueueBranch(`gh-readonly-queue/main/pr-123-${head}`), {
    pr: 123,
    head,
  });
  for (const branch of [
    `gh-readonly-queue/main/pr-0-${head}`,
    `pr-123-${head}`,
    `gh-readonly-queue/dev/pr-123-${head}`,
    `gh-readonly-queue/main/pr-123-${head}-suffix`,
    `gh-readonly-queue/main/pr-123-${head.slice(1)}`,
  ])
    assert.equal(parseQueueBranch(branch), null);
});
test('retry reservations count trusted unique spends only', () => {
  const s = {
    context: RETRY_CONTEXT,
    state: 'success',
    description: 'spent:run=1;try=1',
    creator: { type: 'Bot', login: 'jovie-bot[bot]' },
  };
  assert.equal(
    trustedRetryCount([
      s,
      s,
      { ...s, creator: { type: 'User', login: 'attacker' } },
    ]),
    1
  );
});
test('victim rearm uses the same policy for code/infra budgets and positive cascade attribution', () => {
  const candidate = {
    prNumber: 1,
    state: 'OPEN',
    baseRefName: 'main',
    headSha: head,
    mergeStateStatus: 'CLEAN',
    labels: [],
    files: ['docs/one.md'],
    statuses: [],
    dequeue: { actor: 'github-merge-queue[bot]', atMs: 1000 },
  };
  const decide = extra =>
    planVictimRearms({
      runId: 7,
      now: 1001,
      candidates: [{ ...candidate, ...extra }],
      implicatedPaths: [],
    })[0];
  assert.equal(
    decide({ retryEvidence: { complete: true, receipts: [receipt('code')] } })
      .reason,
    'head-unchanged-non-infra'
  );
  assert.equal(
    decide({
      retryEvidence: {
        complete: true,
        receipts: [receipt('infra')],
        retries: 0,
      },
    }).action,
    'rearm'
  );
  assert.equal(
    decide({
      retryEvidence: {
        complete: true,
        receipts: [receipt('infra')],
        retries: 1,
      },
    }).reason,
    'infra-retry-exhausted'
  );
  const [cascade] = planVictimRearms({
    runId: 7,
    now: 1001,
    candidates: [
      candidate,
      { ...candidate, prNumber: 2, files: ['other.mjs'] },
    ],
    implicatedPaths: ['other.mjs'],
  });
  assert.equal(cascade.action, 'rearm');
  assert.equal(cascade.reason, 'cascade-rearm');
});

test('positive cascade attribution releases its group run, never an older same-head code failure', () => {
  const current = { ...receipt('code'), run: 7 };
  const cascade = {
    ...base(),
    cascade: true,
    cascadeRun: 7,
    receipts: [current],
  };
  assert.equal(retryDisposition(cascade).reason, 'cascade-rearm');
  assert.equal(
    retryDisposition({ ...cascade, receipts: [current, receipt('code')] })
      .reason,
    'head-unchanged-non-infra'
  );
});
