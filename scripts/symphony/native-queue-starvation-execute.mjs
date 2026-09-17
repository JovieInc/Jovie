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
export const PR_CHURN_EJECT = 'native-queue-pr-churn-eject';
export const WAITING_DURABLE_ORACLE = 'native-queue-waiting-durable-oracle';
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

export function lastMergeQueueTimelineEvent(timeline) {
  const events = Array.isArray(timeline)
    ? timeline.filter(
        event =>
          event?.__typename === 'AddedToMergeQueueEvent' ||
          event?.__typename === 'RemovedFromMergeQueueEvent' ||
          event?.__typename === 'MergedEvent'
      )
    : [];
  return events.length > 0 ? events[events.length - 1] : null;
}

export function hasGithubMergeQueueRemove(timeline) {
  return (
    Array.isArray(timeline) &&
    timeline.some(
      event =>
        event?.__typename === 'RemovedFromMergeQueueEvent' &&
        (event?.actor?.login === 'github-merge-queue' || !event?.actor)
    )
  );
}

export function readCapturedMergeQueueEntryId(body) {
  const match = String(body ?? '').match(/mergeQueueEntryId:(MQE_[A-Za-z0-9]+)/u);
  return match ? match[1] : null;
}

export function appendMergeQueueEntryBind(body, entryId) {
  if (typeof entryId !== 'string' || !entryId.startsWith('MQE_')) {
    return typeof body === 'string' ? body : '';
  }
  const current = typeof body === 'string' ? body : '';
  if (current.includes(`mergeQueueEntryId:${entryId}`)) return current;
  const line = `mergeQueueEntryId:${entryId}\n`;
  return current.trimEnd() ? `${current.trimEnd()}\n${line}` : line;
}

/**
 * Occupancy is not a ship. Pass only when mergedAt is set, or the live
 * mergeQueueEntry.id is the previously captured id and the last timeline
 * event for that enrollment is not a github-merge-queue remove.
 */
export function assertDurableNativeQueueOracle({
  mergedAt,
  mergeQueueEntry,
  timeline,
  capturedEntryId,
} = {}) {
  if (typeof mergedAt === 'string' && mergedAt.trim() !== '') {
    return { ok: true, detail: 'merged' };
  }
  const liveId =
    typeof mergeQueueEntry?.id === 'string' && mergeQueueEntry.id
      ? mergeQueueEntry.id
      : null;
  const last = lastMergeQueueTimelineEvent(timeline);
  if (last?.__typename === 'RemovedFromMergeQueueEvent') {
    return { ok: false, detail: PR_CHURN_EJECT };
  }
  if (
    typeof capturedEntryId === 'string' &&
    capturedEntryId.startsWith('MQE_') &&
    liveId === capturedEntryId
  ) {
    return { ok: true, detail: 'same-entry' };
  }
  return { ok: false, detail: PR_CHURN_EJECT };
}

export function nativeQueueEnrollPlan({
  mergeStateStatus,
  mergeQueueEntry,
  mergedAt,
  timeline,
  capturedEntryId,
} = {}) {
  if (typeof mergedAt === 'string' && mergedAt.trim() !== '') {
    return { action: 'bind-merged' };
  }
  const durable = assertDurableNativeQueueOracle({
    mergedAt,
    mergeQueueEntry,
    timeline,
    capturedEntryId,
  });
  if (durable.ok) return { action: 'bind-durable-queue' };
  if (hasGithubMergeQueueRemove(timeline)) {
    return { action: 'reject', detail: PR_CHURN_EJECT };
  }
  if (mergeStateStatus === 'CLEAN') {
    return { action: 'bind-and-await-bot' };
  }
  return {
    action: 'reject',
    detail: `native-queue-not-clean:${mergeStateStatus}`,
  };
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
  for (const row of prs) {
    if (row?.churned === true) continue;
    const pr = Number.isInteger(row)
      ? row
      : Number.isInteger(row?.number)
        ? row.number
        : null;
    const head =
      typeof row?.head === 'string' && /^[a-f0-9]{40}$/u.test(row.head)
        ? row.head
        : null;
    if (!Number.isInteger(pr) || pr <= 0) continue;
    return {
      status: 'ready-to-enroll',
      detail: ENROLL_EXACT_HEAD,
      mutationAttempted: true,
      authority:
        'exact-source-ci-native-queue-production-gates-remain-required',
      pr,
      head,
      candidates: prs,
    };
  }
  return {
    status: 'failed',
    detail: PR_CHURN_EJECT,
    mutationAttempted: false,
    authority:
      'exact-source-ci-native-queue-production-gates-remain-required',
    pr: null,
    head: null,
  };
}

export function unsignedNativeQueueExecution(input) {
  const decision = input.decision;
  return {
    schema: EXECUTION_SCHEMA,
    taskKey: input.taskKey,
    issueIdentifier: input.issueIdentifier,
    action: NATIVE_QUEUE_ACTION,
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
  const authority =
    'exact-source-ci-native-queue-production-gates-remain-required';
  let finalDecision = decision;
  const candidates = Array.isArray(decision.candidates)
    ? decision.candidates
    : decision.pr
      ? [{ number: decision.pr, head: decision.head }]
      : [];
  if (decision.status === 'ready-to-enroll') {
    let lastFail = null;
    for (const candidate of candidates) {
      const pr = Number.isInteger(candidate)
        ? candidate
        : candidate?.number;
      if (!Number.isInteger(pr) || pr <= 0) continue;
      try {
        const enrolled = await enrollPr({
          pr,
          head: candidate?.head ?? decision.head,
          issueIdentifier,
          taskKey,
        });
        const durable =
          enrolled?.ok === true &&
          enrolled?.durable === true &&
          (typeof enrolled.mergeQueueEntryId === 'string' ||
            typeof enrolled.mergedAt === 'string');
        if (durable) {
          finalDecision = {
            status: 'succeeded',
            detail: `enrolled PR #${pr}`,
            mutationAttempted: true,
            authority,
            pr,
            head: enrolled.head ?? candidate?.head ?? decision.head,
            mergeQueueEntryId: enrolled.mergeQueueEntryId ?? null,
            mergedAt: enrolled.mergedAt ?? null,
          };
          lastFail = null;
          break;
        }
        lastFail = {
          status: 'failed',
          detail: String(
            enrolled?.reason ?? 'native-queue-enroll-failed'
          ).slice(0, 240),
          mutationAttempted: true,
          authority,
          pr,
          head: enrolled?.head ?? candidate?.head ?? decision.head,
        };
        if (enrolled?.reason !== PR_CHURN_EJECT) break;
      } catch (error) {
        lastFail = {
          status: 'failed',
          detail: String(
            error instanceof Error ? error.message : error
          ).slice(0, 240),
          mutationAttempted: true,
          authority,
          pr,
          head: candidate?.head ?? decision.head,
        };
        break;
      }
    }
    if (finalDecision.status !== 'succeeded' && lastFail) {
      finalDecision = lastFail;
    }
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
  let acknowledgement;
  try {
    acknowledgement = await writeExecution(record);
  } catch (error) {
    acknowledgement = {
      status: 'execution-write-failed',
      detail: String(error instanceof Error ? error.message : error).slice(
        0,
        240
      ),
    };
    if (finalDecision.status === 'succeeded') {
      finalDecision = {
        ...finalDecision,
        detail: `${finalDecision.detail};${acknowledgement.detail}`.slice(
          0,
          240
        ),
      };
    }
  }
  let terminal = {
    state: claim?.state ?? 'In Progress',
    assignee: claim?.assignee ?? AUTONOMOUS_LINEAR_WORKER,
  };
  if (
    finalDecision.status === 'succeeded' &&
    (finalDecision.mergeQueueEntryId || finalDecision.mergedAt)
  ) {
    terminal = await completeIssue({
      identifier: issueIdentifier,
      state: 'Done',
    });
  }
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
