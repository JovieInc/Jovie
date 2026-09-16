import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { describe, it } from 'node:test';

import {
  decideNativeQueueExecution,
  ENROLL_EXACT_HEAD,
  executeNativeQueueStarvation,
  MUTATION_AUTHORITY_UNAVAILABLE,
  NO_GREEN_READY_PR,
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

describe('decideNativeQueueExecution', () => {
  it('fail-closes when mutation/push/concurrency authority is missing', () => {
    assert.deepEqual(
      decideNativeQueueExecution({
        action: 'reconcile-native-queue-starvation',
        mutationAllowed: false,
        pushAllowed: true,
        maxConcurrent: 4,
        greenReadyPrs: [17540],
      }),
      {
        status: 'failed',
        detail: MUTATION_AUTHORITY_UNAVAILABLE,
        mutationAttempted: false,
        authority: MUTATION_AUTHORITY_UNAVAILABLE,
        pr: null,
        head: null,
      }
    );
    assert.equal(
      decideNativeQueueExecution({
        action: 'reconcile-native-queue-starvation',
        mutationAllowed: true,
        pushAllowed: false,
        maxConcurrent: 4,
        greenReadyPrs: [17540],
      }).detail,
      MUTATION_AUTHORITY_UNAVAILABLE
    );
    assert.equal(
      decideNativeQueueExecution({
        action: 'reconcile-native-queue-starvation',
        mutationAllowed: true,
        pushAllowed: true,
        maxConcurrent: 0,
        greenReadyPrs: [17540],
      }).detail,
      MUTATION_AUTHORITY_UNAVAILABLE
    );
  });

  it('fail-closes when authority exists but no green-ready PR is bound', () => {
    assert.equal(
      decideNativeQueueExecution({
        action: 'reconcile-native-queue-starvation',
        mutationAllowed: true,
        pushAllowed: true,
        maxConcurrent: 1,
        greenReadyPrs: [],
      }).detail,
      NO_GREEN_READY_PR
    );
  });

  it('selects the first green-ready PR only when mutation authority is live', () => {
    assert.deepEqual(
      decideNativeQueueExecution({
        action: 'reconcile-native-queue-starvation',
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
    const enrolls = [];
    const writes = [];
    const result = await executeNativeQueueStarvation({
      taskKey: TASK_KEY,
      issueIdentifier: 'JOV-6304',
      source: SOURCE,
      admission: {
        mutationAllowed: false,
        pushAllowed: false,
        maxConcurrent: 0,
        greenReadyPrs: [17540],
      },
      signatureKeyId: 'symphony-outcome-2026-09',
      privateKeyPem: host.privateKey,
      now: () => '2026-09-16T00:00:00.000Z',
      claimIssue: async input => {
        claims.push(input);
        return { state: 'In Progress', assignee: 'symphony-worker' };
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
    assert.equal(result.decision.detail, MUTATION_AUTHORITY_UNAVAILABLE);
    assert.equal(result.decision.mutationAttempted, false);
    assert.equal(result.decision.pr, null);
    assert.deepEqual(claims, [
      { identifier: 'JOV-6304', state: 'In Progress' },
    ]);
    assert.deepEqual(enrolls, []);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].status, 'failed');
    assert.equal(writes[0].claim.state, 'In Progress');
    assert.equal(writes[0].claim.assignee, 'symphony-worker');
    assert.equal(writes[0].execution.mutationAttempted, false);
    assert.match(writes[0].signature, /^ed25519=[A-Za-z0-9_-]{86}$/u);
    assert.equal(result.record.taskKey, TASK_KEY);
  });

  it('enrolls the bound PR when mutation authority is live and records succeeded', async () => {
    const enrolls = [];
    const result = await executeNativeQueueStarvation({
      taskKey: TASK_KEY,
      issueIdentifier: 'JOV-6304',
      source: SOURCE,
      admission: {
        mutationAllowed: true,
        pushAllowed: true,
        maxConcurrent: 1,
        greenReadyPrs: [{ number: 17540, head: 'd'.repeat(40) }],
      },
      signatureKeyId: 'symphony-outcome-2026-09',
      privateKeyPem: host.privateKey,
      now: () => '2026-09-16T00:00:00.000Z',
      claimIssue: async () => ({
        state: 'In Progress',
        assignee: 'symphony-worker',
      }),
      enrollPr: async input => {
        enrolls.push(input);
        return { ok: true, head: 'd'.repeat(40) };
      },
      writeExecution: async () => ({ status: 'recorded' }),
    });
    assert.deepEqual(enrolls, [{ pr: 17540, head: 'd'.repeat(40) }]);
    assert.equal(result.decision.status, 'succeeded');
    assert.equal(result.decision.pr, 17540);
    assert.equal(result.record.status, 'succeeded');
  });

  it('signs a fail-closed execution that cannot claim a PR number', () => {
    const decision = decideNativeQueueExecution({
      action: 'reconcile-native-queue-starvation',
      mutationAllowed: false,
      pushAllowed: false,
      maxConcurrent: 0,
      greenReadyPrs: [17540],
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
