#!/usr/bin/env node

/** Bounded UI fallback contract for a typed delivery-controller failure. Receipt-only. */

import { createHash } from 'node:crypto';

import { REQUIRED_MERGE_STATUSES } from '../lib/merge-queue-guard.mjs';
import { canAcceptExactHeadQueueReceipt } from '../merge-queue-backend.mjs';
import {
  buildEscalationHandoff,
  NO_UNATTENDED_RED_SCHEMA,
} from './no-unattended-red.mjs';

export const COMPUTER_USE_FALLBACK_SCHEMA = 'jovie-computer-use-fallback/v1';
export const AUTO_LAND_ELIGIBILITY_SCHEMA = 'jovie-auto-land-eligibility/v1';
export const COMPUTER_USE_SCREENSHOT_SCHEMA =
  'jovie-computer-use-screenshot/v1';
export const FOUNDER_DECISION_RECEIPT_SCHEMA =
  'jovie-founder-decision-required/v1';
export const UI_FALLBACK_TTL_MS = 5 * 60 * 1000;
export const COMPUTER_USE_FALLBACK_STATES = Object.freeze([
  'fallback-proposed',
  'preflight-passed',
  'ui-action-in-progress',
  'postcondition-verified',
  'controller-repair-pending',
  'blocked',
]);

const digest = value =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text = value =>
  typeof value === 'string' && value.trim() ? value.trim() : null;
const sha = value => {
  const normalized = text(value)?.toLowerCase();
  return normalized && /^[0-9a-f]{40}$/.test(normalized) ? normalized : null;
};
const prn = value => (Number.isInteger(value) && value > 0 ? value : null);
const iso = now =>
  typeof now === 'string' ? now : new Date(now).toISOString();
const ref = (record, value, now) =>
  buildEscalationHandoff(record, { evidenceRefs: [value] }, { now })
    .evidenceRefs[0] || null;
const promptsClear = live =>
  ['authPrompt', 'mfaPrompt', 'permissionPrompt', 'unexpectedDialog'].every(
    key => live?.[key] === false
  );
const exactTarget = (target, pr, headSha) =>
  prn(target?.pr) === pr && sha(target?.headSha) === headSha;

function attentionFor(record, decision, now) {
  if (
    decision?.schema !== FOUNDER_DECISION_RECEIPT_SCHEMA ||
    decision?.verified !== true ||
    decision?.required !== true ||
    !text(decision.exactQuestion)
  )
    return null;
  const handoff = buildEscalationHandoff(
    record,
    {
      phase: 'computer-use-fallback-blocked',
      exactQuestion: decision.exactQuestion,
    },
    { now }
  );
  return {
    schema: 'jovie-ovie-attention/v1',
    status: 'decision-required',
    escalationKey: handoff.escalationKey,
    exactQuestion: handoff.exactQuestion,
    externalMutations: 0,
  };
}

function screenshotReceipt(record, receipt, kind, pr, headSha, now) {
  const receiptRef = ref(record, receipt?.ref, now);
  if (
    receipt?.schema !== COMPUTER_USE_SCREENSHOT_SCHEMA ||
    receipt?.verified !== true ||
    receipt?.kind !== kind ||
    !exactTarget(receipt, pr, headSha) ||
    !receiptRef
  )
    return null;
  return {
    schema: receipt.schema,
    kind,
    verified: true,
    pr,
    headSha,
    ref: receiptRef,
  };
}

export function planComputerUseFallback(
  record,
  input = {},
  { existing = null, now = new Date().toISOString() } = {}
) {
  const observedAt = iso(now);
  const pr = prn(input.pr);
  const headSha = sha(input.headSha);
  const action = text(input.action);
  const fallbackKey = digest({
    rootLoopKey: record?.rootLoopKey || record?.loopKey,
    pr,
    headSha,
    action,
  });
  if (
    existing?.schema === COMPUTER_USE_FALLBACK_SCHEMA &&
    existing.fallbackKey === fallbackKey &&
    existing.state !== 'blocked' &&
    input.controller?.repaired !== true
  )
    return {
      status: 'duplicate',
      reason: 'idempotent-ui-fallback',
      fallback: existing,
    };

  const reasons = [];
  const controller = input.controller;
  const policy = input.policy;
  const ci = input.ci;
  const capability = input.capability;
  const live = input.live;
  if (
    record?.schema !== NO_UNATTENDED_RED_SCHEMA ||
    !['escalation-pending', 'hard-blocked'].includes(record?.state) ||
    !['dropped-controller-event', 'queue-eviction'].includes(
      record?.stallClass
    ) ||
    controller?.typedFailure !== true ||
    controller?.failureClass !== record?.stallClass ||
    controller?.apiRecoveryExhausted !== true
  )
    reasons.push('typed-controller-failure-and-exhausted-api-required');
  if (controller?.repaired === true)
    reasons.push('fallback-suppressed-controller-repaired');
  if (!pr || !headSha || action !== 'queue-enroll')
    reasons.push('bounded-queue-enroll-target-required');
  if (prn(record?.pr) !== pr || sha(record?.headSha) !== headSha)
    reasons.push('controller-record-target-or-revision-mismatch');
  if (input.writer !== record?.writer || input.leaseKey !== record?.leaseKey)
    reasons.push('single-writer-lease-conflict');
  if (
    policy?.schema !== AUTO_LAND_ELIGIBILITY_SCHEMA ||
    policy?.source !== 'merge-queue-guard' ||
    policy?.eligible !== true ||
    policy?.action !== action ||
    !exactTarget(policy, pr, headSha) ||
    policy?.draft !== false ||
    policy?.base !== 'main' ||
    policy?.mergeable !== 'MERGEABLE' ||
    policy?.riskClass !== 'ordinary' ||
    !Array.isArray(policy?.hardHolds) ||
    policy.hardHolds.length !== 0 ||
    policy?.humanReviewRequired !== false ||
    policy?.externalConsentRequired !== false ||
    policy?.protectedOperation !== false
  )
    reasons.push('auto-land-policy-denied');
  if (
    ci?.machineCertified !== true ||
    ci?.allPassed !== true ||
    ci?.terminalRed !== false ||
    !exactTarget(ci, pr, headSha) ||
    !Array.isArray(ci?.requiredStatuses) ||
    !REQUIRED_MERGE_STATUSES.every(status =>
      ci.requiredStatuses.includes(status)
    )
  )
    reasons.push('exact-head-machine-ci-required');
  if (
    capability?.name !== 'computer-use' ||
    capability?.approved !== true ||
    capability?.scopedSession !== true ||
    capability?.target !== 'github-pr' ||
    !text(capability?.sessionId) ||
    !Array.isArray(capability?.allowedActions) ||
    !capability.allowedActions.includes(action) ||
    capability?.readsCredentials !== false ||
    capability?.readsCookies !== false ||
    capability?.privateUnrelatedScope !== false
  )
    reasons.push('approved-scoped-computer-use-capability-required');
  if (
    !exactTarget(live, pr, headSha) ||
    live?.draft !== false ||
    live?.actionAvailable !== true ||
    !promptsClear(live)
  )
    reasons.push(
      promptsClear(live)
        ? 'live-ui-target-or-action-mismatch'
        : 'unexpected-auth-permission-or-dialog'
    );
  const screenshot = screenshotReceipt(
    record,
    input.preflightScreenshot,
    'preflight',
    pr,
    headSha,
    observedAt
  );
  if (!screenshot) reasons.push('preflight-screenshot-receipt-required');

  const state = reasons.length ? 'blocked' : 'preflight-passed';
  const fallback = {
    schema: COMPUTER_USE_FALLBACK_SCHEMA,
    fallbackKey,
    controllerLoopKey: record?.rootLoopKey || record?.loopKey || null,
    controllerFailureClass: record?.stallClass || null,
    state,
    reason: reasons[0] || 'computer-use-preflight-passed',
    reasons,
    target: { pr, headSha },
    action,
    writer: record?.writer || null,
    leaseKey: record?.leaseKey || null,
    session: {
      capability: 'computer-use',
      sessionId: text(capability?.sessionId),
      scope: 'github-pr-queue-enroll',
      credentials: 'forbidden',
      cookies: 'forbidden',
    },
    actionPlan: [
      'revalidate exact PR, source revision, machine CI, merge policy, and live UI',
      'invoke only the visible native queue-enroll control',
      'capture screenshot and authoritative exact-head postcondition receipts',
      'return the controller incident to its original repair owner',
    ],
    executionAuthorized: state === 'preflight-passed',
    preflightScreenshot: screenshot,
    expiresAt: new Date(
      Date.parse(observedAt) + UI_FALLBACK_TTL_MS
    ).toISOString(),
    requiredPostcondition: {
      source: 'github-authoritative-queue-state',
      exactTarget: true,
      controllerReconciliation: true,
    },
    history: [
      { state: 'fallback-proposed', observedAt },
      { state, observedAt, evidence: reasons[0] || screenshot?.ref },
    ],
    ovieAttention:
      state === 'blocked'
        ? attentionFor(record, input.founderDecision, observedAt)
        : null,
    controllerRepairOwner: record?.owner || null,
    controllerReconciled: false,
    suppressed: controller?.repaired === true,
    externalMutations: 0,
  };
  return { status: state, reason: fallback.reason, fallback };
}

export function transitionComputerUseFallback(
  fallback,
  event = {},
  { now = new Date().toISOString() } = {}
) {
  const observedAt = iso(now);
  const type = text(event.type);
  const deny = reason => ({
    status: 'blocked',
    reason,
    fallback: {
      ...fallback,
      state: 'blocked',
      reason,
      executionAuthorized: false,
      history: [
        ...(fallback?.history || []),
        { state: 'blocked', observedAt, evidence: reason },
      ],
    },
  });
  if (fallback?.schema !== COMPUTER_USE_FALLBACK_SCHEMA)
    return deny('computer-use-fallback-receipt-required');
  if (fallback.state === 'blocked')
    return { status: 'duplicate', reason: fallback.reason, fallback };
  if (event.fallbackKey !== fallback.fallbackKey)
    return deny('computer-use-fallback-key-mismatch');
  if (event.writer !== fallback.writer || event.leaseKey !== fallback.leaseKey)
    return deny('single-writer-lease-conflict');
  if (event.controllerRepaired === true || type === 'controller-repaired') {
    if (
      event.receipt?.schema !== NO_UNATTENDED_RED_SCHEMA ||
      event.receipt?.rootLoopKey !== fallback.controllerLoopKey ||
      event.receipt?.stallClass !== fallback.controllerFailureClass ||
      prn(event.receipt?.pr) !== fallback.target.pr ||
      sha(event.receipt?.headSha) !== fallback.target.headSha ||
      event.receipt?.state !== 'resolved' ||
      event.receipt?.outcome !== 'healthy' ||
      !text(event.receipt?.lastProgressFingerprint)
    )
      return deny('controller-repair-proof-required');
    const blocked = deny('fallback-suppressed-controller-repaired');
    blocked.fallback.suppressed = true;
    blocked.fallback.controllerReconciled = true;
    return blocked;
  }
  if (
    fallback.state === 'ui-action-in-progress' &&
    type === 'ui-action-started' &&
    event.sessionId === fallback.session.sessionId
  )
    return {
      status: 'duplicate',
      reason: 'ui-action-already-started',
      fallback,
    };
  if (
    fallback.state === 'controller-repair-pending' &&
    type === 'ui-action-observed'
  )
    return {
      status: 'duplicate',
      reason: 'ui-postcondition-already-verified',
      fallback,
    };
  if (!exactTarget(event.live, fallback.target.pr, fallback.target.headSha))
    return deny('live-ui-target-or-revision-drift');
  if (!promptsClear(event.live))
    return deny('unexpected-auth-permission-or-dialog');
  const expiresAt = Date.parse(fallback.expiresAt);
  if (!Number.isFinite(expiresAt) || Date.parse(observedAt) > expiresAt)
    return deny('computer-use-preflight-expired');
  if (type === 'ui-action-started') {
    if (
      fallback.state !== 'preflight-passed' ||
      event.sessionId !== fallback.session.sessionId ||
      event.live?.actionAvailable !== true
    )
      return deny('preflight-or-scoped-session-required');
    const next = {
      ...fallback,
      state: 'ui-action-in-progress',
      history: [
        ...fallback.history,
        { state: 'ui-action-in-progress', observedAt },
      ],
    };
    return { status: next.state, fallback: next };
  }
  if (type === 'ui-action-observed') {
    const receiptRecord = {
      issueKey: `pr:${fallback.target.pr}`,
      loopKey: fallback.fallbackKey,
    };
    const screenshot = screenshotReceipt(
      receiptRecord,
      event.screenshot,
      'postcondition',
      fallback.target.pr,
      fallback.target.headSha,
      observedAt
    );
    const source = event.sourceReceipt;
    if (
      fallback.state !== 'ui-action-in-progress' ||
      !screenshot ||
      event.uiState !== 'queued' ||
      source?.number !== fallback.target.pr ||
      !canAcceptExactHeadQueueReceipt(source, fallback.target.headSha)
    )
      return deny('ui-authoritative-postcondition-discrepancy');
    const next = {
      ...fallback,
      state: 'controller-repair-pending',
      executionAuthorized: false,
      screenshot,
      authoritativeReceiptRef: ref(
        receiptRecord,
        source.mergeQueueEntry?.id,
        observedAt
      ),
      workaroundVerified: true,
      controllerReconciled: false,
      history: [
        ...fallback.history,
        {
          state: 'postcondition-verified',
          observedAt,
          evidence: screenshot.ref,
        },
        {
          state: 'controller-repair-pending',
          observedAt,
          evidence: source.mergeQueueEntry.id,
        },
      ],
    };
    return { status: next.state, fallback: next };
  }
  return deny('computer-use-fallback-transition-denied');
}
