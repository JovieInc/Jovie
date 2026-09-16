#!/usr/bin/env node
/**
 * Autonomous execute lane for reconcile-native-queue-starvation.
 * Does not grant v2 Linear-projection PR mutation. Claims the existing
 * Linear child, then either enrolls one green-ready PR under live gates
 * or fail-closes naming the missing execution authority.
 */
import { createPrivateKey, sign as nodeSign } from 'node:crypto';
import { canonical } from './summer-symphony-outbox-consumer.mjs';

export const EXECUTION_SCHEMA = 'jovie.symphony-native-queue-execution/v1';
export const MUTATION_AUTHORITY_UNAVAILABLE =
  'native-queue-mutation-authority-unavailable';
export const NO_GREEN_READY_PR = 'native-queue-no-green-ready-pr';
export const ENROLL_EXACT_HEAD = 'native-queue-enroll-exact-head';

export function selectGreenReadyPrs(fleet) {
  const actions = fleet?.signals?.closureHealth?.lifecycleActions;
  if (Array.isArray(actions)) {
    const rows = [];
    for (const action of actions) {
      if (action?.sourceState !== 'promote') continue;
      const pr = Number.isInteger(action.pr) ? action.pr : null;
      const head =
        typeof action.headSha === 'string' &&
        /^[a-f0-9]{40}$/u.test(action.headSha)
          ? action.headSha
          : null;
      if (Number.isInteger(pr) && pr > 0) rows.push({ number: pr, head });
    }
    if (rows.length > 0) return rows;
  }
  const ready = fleet?.signals?.queue?.greenReady;
  return Array.isArray(ready) ? ready : [];
}

export function decideNativeQueueExecution(input) {
  if (input?.action !== 'reconcile-native-queue-starvation') {
    throw new Error('native-queue-action-required');
  }
  const maxConcurrent = input.maxConcurrent;
  const mutationAllowed =
    input.mutationAllowed === true &&
    input.pushAllowed === true &&
    Number.isInteger(maxConcurrent) &&
    !Number.isNaN(maxConcurrent) &&
    maxConcurrent > 0;
  if (!mutationAllowed) {
    return {
      status: 'failed',
      detail: MUTATION_AUTHORITY_UNAVAILABLE,
      mutationAttempted: false,
      authority: MUTATION_AUTHORITY_UNAVAILABLE,
      pr: null,
      head: null,
    };
  }
  const prs = input.greenReadyPrs;
  if (!Array.isArray(prs) || prs.length === 0) {
    return {
      status: 'failed',
      detail: NO_GREEN_READY_PR,
      mutationAttempted: false,
      authority:
        'exact-source-ci-native-queue-production-gates-remain-required',
      pr: null,
      head: null,
    };
  }
  const first = prs[0];
  const pr = Number.isInteger(first)
    ? first
    : Number.isInteger(first?.number)
      ? first.number
      : null;
  const head =
    typeof first?.head === 'string' && /^[a-f0-9]{40}$/u.test(first.head)
      ? first.head
      : null;
  if (!Number.isInteger(pr) || pr <= 0) {
    return {
      status: 'failed',
      detail: NO_GREEN_READY_PR,
      mutationAttempted: false,
      authority:
        'exact-source-ci-native-queue-production-gates-remain-required',
      pr: null,
      head: null,
    };
  }
  return {
    status: 'ready-to-enroll',
    detail: ENROLL_EXACT_HEAD,
    mutationAttempted: true,
    authority: 'exact-source-ci-native-queue-production-gates-remain-required',
    pr,
    head,
  };
}

export function unsignedNativeQueueExecution(input) {
  const decision = input.decision;
  return {
    schema: EXECUTION_SCHEMA,
    taskKey: input.taskKey,
    issueIdentifier: input.issueIdentifier,
    action: 'reconcile-native-queue-starvation',
    status: decision.status === 'succeeded' ? 'succeeded' : 'failed',
    detail: String(decision.detail).slice(0, 240),
    completedAt: input.completedAt,
    claim: {
      state: input.claim.state,
      assignee: input.claim.assignee,
    },
    execution: {
      mutationAttempted: decision.mutationAttempted === true,
      authority: decision.authority,
      pr: decision.pr,
      head: decision.head,
    },
    source: {
      action: 'reconcile-native-queue-starvation',
      snapshotDigest: input.source.snapshotDigest,
      sourceVersion: input.source.sourceVersion,
    },
    signatureKeyId: input.signatureKeyId,
  };
}

export function signNativeQueueExecution(input, privateKeyPem) {
  const unsigned = unsignedNativeQueueExecution(input);
  const privateKey = createPrivateKey(privateKeyPem);
  return {
    ...unsigned,
    signature: `ed25519=${nodeSign(
      null,
      Buffer.from(`${EXECUTION_SCHEMA}\0${canonical(unsigned)}`),
      privateKey
    ).toString('base64url')}`,
  };
}

export async function executeNativeQueueStarvation({
  taskKey,
  issueIdentifier,
  source,
  admission,
  signatureKeyId,
  privateKeyPem,
  now = () => new Date().toISOString(),
  claimIssue,
  enrollPr,
  writeExecution,
}) {
  if (!/^[a-f0-9]{64}$/u.test(taskKey ?? '')) {
    throw new Error('task-key-invalid');
  }
  if (!/^JOV-[1-9][0-9]*$/u.test(issueIdentifier ?? '')) {
    throw new Error('issue-identifier-invalid');
  }
  const decision = decideNativeQueueExecution({
    action: 'reconcile-native-queue-starvation',
    ...admission,
  });
  const claim = await claimIssue({
    identifier: issueIdentifier,
    state: 'In Progress',
  });
  let finalDecision = decision;
  if (decision.status === 'ready-to-enroll') {
    const enrolled = await enrollPr({
      pr: decision.pr,
      head: decision.head,
    });
    finalDecision = enrolled?.ok
      ? {
          status: 'succeeded',
          detail: `enrolled PR #${decision.pr}`,
          mutationAttempted: true,
          authority:
            'exact-source-ci-native-queue-production-gates-remain-required',
          pr: decision.pr,
          head: enrolled.head ?? decision.head,
        }
      : {
          status: 'failed',
          detail: String(
            enrolled?.reason ?? 'native-queue-enroll-failed'
          ).slice(0, 240),
          mutationAttempted: true,
          authority:
            'exact-source-ci-native-queue-production-gates-remain-required',
          pr: decision.pr,
          head: enrolled?.head ?? decision.head,
        };
  }
  const record = signNativeQueueExecution(
    {
      taskKey,
      issueIdentifier,
      source,
      decision: finalDecision,
      completedAt: now(),
      claim: {
        state: claim?.state ?? 'In Progress',
        assignee: claim?.assignee ?? null,
      },
      signatureKeyId,
    },
    privateKeyPem
  );
  const acknowledgement = await writeExecution(record);
  return {
    status: 'execution-recorded',
    taskKey,
    issueIdentifier,
    decision: finalDecision,
    claim,
    record,
    acknowledgement,
  };
}
