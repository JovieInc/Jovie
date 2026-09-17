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
export const AUTONOMOUS_LINEAR_WORKER = 'unassigned-machine';
export const FOUNDER_LINEAR_ASSIGNEE = 'Tim White';
export const NATIVE_QUEUE_ACTION = 'reconcile-native-queue-starvation';
export const RELEASE_CERT_ACTION = 'reconcile-release-certification-starvation';
export const ENROLLABLE_ACTIONS = Object.freeze([
  NATIVE_QUEUE_ACTION,
  RELEASE_CERT_ACTION,
]);
export const SUMMER_ISSUE_BIND_MARKER = '<!-- summer-issue-bind -->';

export function assertAutonomousClaim(claim) {
  const state = claim?.state;
  const assignee = claim?.assignee ?? null;
  if (state !== 'In Progress' || assignee === FOUNDER_LINEAR_ASSIGNEE) {
    throw new Error('linear-claim-not-autonomous');
  }
  return { state, assignee: assignee || AUTONOMOUS_LINEAR_WORKER };
}

export function assertAutonomousTerminal(claim) {
  const state = claim?.state;
  const assignee = claim?.assignee ?? null;
  if (state !== 'Done' || assignee === FOUNDER_LINEAR_ASSIGNEE) {
    throw new Error('linear-terminal-not-autonomous');
  }
  return { state, assignee: assignee || AUTONOMOUS_LINEAR_WORKER };
}

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

export function appendSummerIssueBind(body, issueIdentifier, taskKey) {
  if (!/^JOV-[1-9][0-9]*$/u.test(issueIdentifier ?? '')) {
    return typeof body === 'string' ? body : '';
  }
  const current = typeof body === 'string' ? body : '';
  if (current.includes(issueIdentifier)) return current;
  const taskLine =
    typeof taskKey === 'string' && /^[a-f0-9]{64}$/u.test(taskKey)
      ? `\ntaskKey:${taskKey}`
      : '';
  const bind = `${SUMMER_ISSUE_BIND_MARKER}\n${issueIdentifier}${taskLine}\n`;
  return current.trimEnd() ? `${current.trimEnd()}\n\n${bind}` : bind;
}

export function decideNativeQueueExecution(input) {
  if (!ENROLLABLE_ACTIONS.includes(input?.action)) {
    throw new Error('native-queue-action-required');
  }
  // Enrolling an already-green PR into the native queue is the starvation
  // repair for both native-queue-starvation and release-certification-starvation.
  // New-branch mutation seats (maxConcurrent) do not gate that.
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
    action: ENROLLABLE_ACTIONS.includes(input.action)
      ? input.action
      : NATIVE_QUEUE_ACTION,
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
      action: ENROLLABLE_ACTIONS.includes(input.action)
        ? input.action
        : NATIVE_QUEUE_ACTION,
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
  completeIssue,
  enrollPr,
  writeExecution,
}) {
  if (!/^[a-f0-9]{64}$/u.test(taskKey ?? '')) {
    throw new Error('task-key-invalid');
  }
  if (!/^JOV-[1-9][0-9]*$/u.test(issueIdentifier ?? '')) {
    throw new Error('issue-identifier-invalid');
  }
  const action = ENROLLABLE_ACTIONS.includes(admission?.action)
    ? admission.action
    : NATIVE_QUEUE_ACTION;
  const decision = decideNativeQueueExecution({
    ...admission,
    action,
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
      issueIdentifier,
      taskKey,
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
      action,
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
  const terminal = await completeIssue({
    identifier: issueIdentifier,
    state: 'Done',
  });
  return {
    status: 'execution-recorded',
    taskKey,
    issueIdentifier,
    decision: finalDecision,
    claim,
    terminal,
    record,
    acknowledgement,
  };
}
