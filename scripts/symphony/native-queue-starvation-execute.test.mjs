import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { describe, it } from 'node:test';

import {
  AUTONOMOUS_LINEAR_WORKER,
  appendSummerIssueBind,
  assertAutonomousClaim,
  assertAutonomousTerminal,
  decideNativeQueueExecution,
  ENROLL_EXACT_HEAD,
  executeNativeQueueStarvation,
  FOUNDER_LINEAR_ASSIGNEE,
  NATIVE_QUEUE_ACTION,
  NO_GREEN_READY_PR,
  nativeQueueEnrollPlan,
  RELEASE_CERT_ACTION,
  SUMMER_ISSUE_BIND_MARKER,
  selectGreenReadyPrs,
  signNativeQueueExecution,
  unsignedNativeQueueExecution,
} from './native-queue-starvation-execute.mjs';

function pair() {
  const keys = generateKeyPairSync('ed25519');
  return {
    privateKey: keys.privateKey
      .export({ format: 'pem', type: 'pkcs8' })
      .toString(),
    publicKey: keys.publicKey
      .export({ format: 'pem', type: 'spki' })
      .toString(),
  };
}

const TASK_KEY = '2'.repeat(64);
const SOURCE = {
  sourceVersion: '7'.repeat(40),
  snapshotDigest: 'c'.repeat(64),
};

describe('assertAutonomousClaim', () => {
  it('rejects founder-named In Progress claims and accepts a cleared machine claim', () => {
    assert.equal(FOUNDER_LINEAR_ASSIGNEE, 'Tim White');
    assert.deepEqual(
      assertAutonomousClaim({ state: 'In Progress', assignee: null }),
      { state: 'In Progress', assignee: AUTONOMOUS_LINEAR_WORKER }
    );
    assert.deepEqual(
      assertAutonomousClaim({ state: 'In Progress', assignee: 'Codex' }),
      { state: 'In Progress', assignee: 'Codex' }
    );
    assert.throws(
      () =>
        assertAutonomousClaim({ state: 'In Progress', assignee: 'Tim White' }),
      /linear-claim-not-autonomous/
    );
    assert.throws(
      () => assertAutonomousClaim({ state: 'Todo', assignee: null }),
      /linear-claim-not-autonomous/
    );
  });
});

describe('assertAutonomousTerminal', () => {
  it('rejects founder-named Done and leftover In Progress', () => {
    assert.deepEqual(
      assertAutonomousTerminal({ state: 'Done', assignee: null }),
      { state: 'Done', assignee: AUTONOMOUS_LINEAR_WORKER }
    );
    assert.throws(
      () => assertAutonomousTerminal({ state: 'Done', assignee: 'Tim White' }),
      /linear-terminal-not-autonomous/
    );
    assert.throws(
      () => assertAutonomousTerminal({ state: 'In Progress', assignee: null }),
      /linear-terminal-not-autonomous/
    );
  });
});

describe('selectGreenReadyPrs', () => {
  it('binds promote lifecycle actions instead of inventing PR numbers from a count', () => {
    assert.deepEqual(
      selectGreenReadyPrs({
        signals: {
          queue: { greenReadyPrs: 4 },
          closureHealth: {
            lifecycleActions: [
              {
                sourceState: 'held',
                pr: 17001,
                headSha: 'a'.repeat(40),
              },
              {
                sourceState: 'promote',
                pr: 17886,
                headSha: 'e'.repeat(40),
              },
            ],
          },
        },
      }),
      [{ number: 17886, head: 'e'.repeat(40) }]
    );
    assert.deepEqual(
      selectGreenReadyPrs({ signals: { queue: { greenReadyPrs: 4 } } }),
      []
    );
  });
});

describe('appendSummerIssueBind', () => {
  it('appends the Linear identifier so is:pr search can bind, and is idempotent', () => {
    const first = appendSummerIssueBind('PR body', 'JOV-6371', TASK_KEY);
    assert.match(first, new RegExp(`${SUMMER_ISSUE_BIND_MARKER}\\nJOV-6371`));
    assert.match(first, new RegExp(`taskKey:${TASK_KEY}`));
    assert.equal(appendSummerIssueBind(first, 'JOV-6371', TASK_KEY), first);
    assert.equal(appendSummerIssueBind('x', 'JOV-0', TASK_KEY), 'x');
  });
});

describe('nativeQueueEnrollPlan', () => {
  it('never self-enqueues; binds an existing queue entry or waits for jovie-bot', () => {
    assert.deepEqual(
      nativeQueueEnrollPlan({
        mergeStateStatus: 'CLEAN',
        mergeQueueEntry: { id: 'MQE_1' },
      }),
      { action: 'bind-existing-queue' }
    );
    assert.deepEqual(
      nativeQueueEnrollPlan({
        mergeStateStatus: 'CLEAN',
        mergeQueueEntry: null,
      }),
      { action: 'bind-and-await-bot' }
    );
    assert.equal(
      nativeQueueEnrollPlan({
        mergeStateStatus: 'BLOCKED',
        mergeQueueEntry: null,
      }).action,
      'reject'
    );
  });
});

describe('decideNativeQueueExecution', () => {
  it('enrolls an existing green-ready PR even when new-mutation seats are closed', () => {
    assert.deepEqual(
      decideNativeQueueExecution({
        action: NATIVE_QUEUE_ACTION,
        mutationAllowed: false,
        pushAllowed: false,
        maxConcurrent: 0,
        greenReadyPrs: [{ number: 17917, head: 'd'.repeat(40) }],
      }),
      {
        status: 'ready-to-enroll',
        detail: ENROLL_EXACT_HEAD,
        mutationAttempted: true,
        authority:
          'exact-source-ci-native-queue-production-gates-remain-required',
        pr: 17917,
        head: 'd'.repeat(40),
      }
    );
  });

  it('enrolls the same green-ready PR for release-certification-starvation', () => {
    assert.equal(
      decideNativeQueueExecution({
        action: RELEASE_CERT_ACTION,
        mutationAllowed: false,
        pushAllowed: false,
        maxConcurrent: 0,
        greenReadyPrs: [{ number: 17918, head: 'e'.repeat(40) }],
      }).pr,
      17918
    );
  });

  it('fail-closes when no green-ready PR is bound', () => {
    assert.equal(
      decideNativeQueueExecution({
        action: NATIVE_QUEUE_ACTION,
        mutationAllowed: true,
        pushAllowed: true,
        maxConcurrent: 1,
        greenReadyPrs: [],
      }).detail,
      NO_GREEN_READY_PR
    );
  });

  it('selects the first green-ready PR', () => {
    assert.deepEqual(
      decideNativeQueueExecution({
        action: NATIVE_QUEUE_ACTION,
        mutationAllowed: true,
        pushAllowed: true,
        maxConcurrent: 2,
        greenReadyPrs: [{ number: 17540, head: 'd'.repeat(40) }, 17542],
      }),
      {
        status: 'ready-to-enroll',
        detail: ENROLL_EXACT_HEAD,
        mutationAttempted: true,
        authority:
          'exact-source-ci-native-queue-production-gates-remain-required',
        pr: 17540,
        head: 'd'.repeat(40),
      }
    );
  });

  it('rejects other bottleneck actions instead of lie-mapping onto a CI class', () => {
    assert.throws(
      () =>
        decideNativeQueueExecution({
          action: 'remediate-selected-ci-audit-class',
          mutationAllowed: true,
          pushAllowed: true,
          maxConcurrent: 1,
          greenReadyPrs: [1],
        }),
      /native-queue-action-required/
    );
  });
});

describe('executeNativeQueueStarvation', () => {
  const host = pair();

  it('claims the Linear child and records a signed fail-closed terminal without mutating a PR', async () => {
    const claims = [];
    const completes = [];
    const enrolls = [];
    const writes = [];
    const result = await executeNativeQueueStarvation({
      taskKey: TASK_KEY,
      issueIdentifier: 'JOV-6304',
      source: SOURCE,
      admission: {
        action: NATIVE_QUEUE_ACTION,
        mutationAllowed: false,
        pushAllowed: false,
        maxConcurrent: 0,
        greenReadyPrs: [],
      },
      signatureKeyId: 'symphony-outcome-2026-09',
      privateKeyPem: host.privateKey,
      now: () => '2026-09-16T00:00:00.000Z',
      claimIssue: async input => {
        claims.push(input);
        return { state: 'In Progress', assignee: 'symphony-worker' };
      },
      completeIssue: async input => {
        completes.push(input);
        return { state: 'Done', assignee: AUTONOMOUS_LINEAR_WORKER };
      },
      enrollPr: async input => {
        enrolls.push(input);
        return { ok: true, head: 'd'.repeat(40) };
      },
      writeExecution: async record => {
        writes.push(record);
        return { status: 'recorded' };
      },
    });
    assert.equal(result.status, 'execution-recorded');
    assert.equal(result.decision.detail, NO_GREEN_READY_PR);
    assert.equal(result.decision.mutationAttempted, false);
    assert.equal(result.decision.pr, null);
    assert.deepEqual(claims, [
      { identifier: 'JOV-6304', state: 'In Progress' },
    ]);
    assert.deepEqual(completes, [{ identifier: 'JOV-6304', state: 'Done' }]);
    assert.deepEqual(result.terminal, {
      state: 'Done',
      assignee: AUTONOMOUS_LINEAR_WORKER,
    });
    assert.deepEqual(enrolls, []);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].status, 'failed');
    assert.equal(writes[0].claim.state, 'In Progress');
    assert.equal(writes[0].claim.assignee, 'symphony-worker');
    assert.equal(writes[0].execution.mutationAttempted, false);
    assert.match(writes[0].signature, /^ed25519=[A-Za-z0-9_-]{86}$/u);
    assert.equal(result.record.taskKey, TASK_KEY);
  });

  it('enrolls the bound PR even when new-mutation seats are closed', async () => {
    const enrolls = [];
    const result = await executeNativeQueueStarvation({
      taskKey: TASK_KEY,
      issueIdentifier: 'JOV-6371',
      source: SOURCE,
      admission: {
        action: RELEASE_CERT_ACTION,
        mutationAllowed: false,
        pushAllowed: false,
        maxConcurrent: 0,
        greenReadyPrs: [{ number: 17917, head: 'd'.repeat(40) }],
      },
      signatureKeyId: 'symphony-outcome-2026-09',
      privateKeyPem: host.privateKey,
      now: () => '2026-09-16T00:00:00.000Z',
      claimIssue: async () => ({
        state: 'In Progress',
        assignee: 'symphony-worker',
      }),
      completeIssue: async () => ({
        state: 'Done',
        assignee: AUTONOMOUS_LINEAR_WORKER,
      }),
      enrollPr: async input => {
        enrolls.push(input);
        return { ok: true, head: 'd'.repeat(40) };
      },
      writeExecution: async () => ({ status: 'recorded' }),
    });
    assert.deepEqual(enrolls, [
      {
        pr: 17917,
        head: 'd'.repeat(40),
        issueIdentifier: 'JOV-6371',
        taskKey: TASK_KEY,
      },
    ]);
    assert.equal(result.decision.status, 'succeeded');
    assert.equal(result.decision.pr, 17917);
    assert.equal(result.record.status, 'succeeded');
    assert.equal(result.record.action, RELEASE_CERT_ACTION);
  });

  it('signs a fail-closed execution that cannot claim a PR number', () => {
    const decision = decideNativeQueueExecution({
      action: NATIVE_QUEUE_ACTION,
      mutationAllowed: false,
      pushAllowed: false,
      maxConcurrent: 0,
      greenReadyPrs: [],
    });
    const unsigned = unsignedNativeQueueExecution({
      taskKey: TASK_KEY,
      issueIdentifier: 'JOV-6304',
      source: SOURCE,
      decision,
      completedAt: '2026-09-16T00:00:00.000Z',
      claim: { state: 'In Progress', assignee: 'symphony-worker' },
      signatureKeyId: 'symphony-outcome-2026-09',
    });
    assert.equal(unsigned.execution.pr, null);
    const signed = signNativeQueueExecution(
      {
        taskKey: TASK_KEY,
        issueIdentifier: 'JOV-6304',
        source: SOURCE,
        decision,
        completedAt: '2026-09-16T00:00:00.000Z',
        claim: { state: 'In Progress', assignee: 'symphony-worker' },
        signatureKeyId: 'symphony-outcome-2026-09',
      },
      host.privateKey
    );
    assert.notEqual(signed.signature, unsigned.signature);
  });
});
