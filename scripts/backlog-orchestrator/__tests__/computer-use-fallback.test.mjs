import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { REQUIRED_MERGE_STATUSES } from '../../lib/merge-queue-guard.mjs';
import {
  AUTO_LAND_ELIGIBILITY_SCHEMA,
  COMPUTER_USE_FALLBACK_SCHEMA,
  COMPUTER_USE_FALLBACK_STATES,
  COMPUTER_USE_SCREENSHOT_SCHEMA,
  FOUNDER_DECISION_RECEIPT_SCHEMA,
  planComputerUseFallback,
  transitionComputerUseFallback,
} from '../computer-use-fallback.mjs';
import {
  advanceAttempt,
  classifyStall,
  openLoopRecord,
  prepareEscalation,
} from '../no-unattended-red.mjs';

const NOW = '2026-09-01T20:00:00.000Z';
const LATER = '2026-09-01T20:05:00.000Z';
const HEAD = 'a'.repeat(40);
const PR = 16958;
const open = () =>
  openLoopRecord(
    classifyStall(
      {
        stallClass: 'dropped-controller-event',
        proven: true,
        issue: 'JOV-5169',
        pr: PR,
        headSha: HEAD,
      },
      { now: NOW }
    ),
    { now: NOW }
  );
const record = () =>
  prepareEscalation(open(), 'api-recovery-exhausted', NOW, {
    object: `pr:${PR}`,
    environment: 'github',
    revision: HEAD,
  });
// biome-ignore format: compact typed receipt fixtures keep the PR under the size guard
const input = (extra = {}) => ({
  pr: PR, headSha: HEAD, action: 'queue-enroll', writer: 'gem', leaseKey: record().leaseKey,
  controller: { typedFailure: true, failureClass: 'dropped-controller-event', apiRecoveryExhausted: true, repaired: false },
  policy: {
    schema: AUTO_LAND_ELIGIBILITY_SCHEMA, source: 'merge-queue-guard', eligible: true,
    action: 'queue-enroll', pr: PR, headSha: HEAD, draft: false, base: 'main',
    mergeable: 'MERGEABLE', riskClass: 'ordinary', hardHolds: [],
    humanReviewRequired: false, externalConsentRequired: false, protectedOperation: false,
  },
  ci: { pr: PR, headSha: HEAD, machineCertified: true, allPassed: true, terminalRed: false, requiredStatuses: [...REQUIRED_MERGE_STATUSES] },
  capability: {
    name: 'computer-use', approved: true, scopedSession: true, target: 'github-pr',
    sessionId: 'session-1', allowedActions: ['queue-enroll'], readsCredentials: false,
    readsCookies: false, privateUnrelatedScope: false,
  },
  live: {
    pr: PR, headSha: HEAD, draft: false, actionAvailable: true, authPrompt: false,
    mfaPrompt: false, permissionPrompt: false, unexpectedDialog: false,
  },
  preflightScreenshot: { schema: COMPUTER_USE_SCREENSHOT_SCHEMA, verified: true, kind: 'preflight', pr: PR, headSha: HEAD, ref: 'computer-use:screenshot:preflight-1' },
  ...extra,
});
// biome-ignore format: compact event fixture
const event = (fallback, extra = {}) => ({ fallbackKey: fallback.fallbackKey, writer: fallback.writer, leaseKey: fallback.leaseKey, live: { ...input().live }, ...extra });

describe('bounded computer-use fallback', () => {
  it('authorizes one exact eligible UI fallback and returns controller repair ownership', () => {
    const planned = planComputerUseFallback(record(), input(), { now: NOW });
    assert.equal(planned.status, 'preflight-passed');
    assert.equal(planned.fallback.schema, COMPUTER_USE_FALLBACK_SCHEMA);
    assert.equal(planned.fallback.executionAuthorized, true);
    assert.equal(planned.fallback.externalMutations, 0);
    assert.equal(planned.fallback.session.credentials, 'forbidden');
    assert.deepEqual(
      planned.fallback.history.map(item => item.state),
      ['fallback-proposed', 'preflight-passed']
    );
    const started = transitionComputerUseFallback(
      planned.fallback,
      event(planned.fallback, {
        type: 'ui-action-started',
        sessionId: 'session-1',
      }),
      { now: NOW }
    );
    assert.equal(started.status, 'ui-action-in-progress');
    assert.equal(
      transitionComputerUseFallback(
        started.fallback,
        event(started.fallback, {
          type: 'ui-action-started',
          sessionId: 'session-1',
        }),
        { now: NOW }
      ).status,
      'duplicate'
    );
    const observed = transitionComputerUseFallback(
      started.fallback,
      event(started.fallback, {
        type: 'ui-action-observed',
        uiState: 'queued',
        screenshot: {
          schema: COMPUTER_USE_SCREENSHOT_SCHEMA,
          verified: true,
          kind: 'postcondition',
          pr: PR,
          headSha: HEAD,
          ref: 'computer-use:screenshot:postcondition-1',
        },
        sourceReceipt: {
          number: PR,
          state: 'OPEN',
          isDraft: false,
          headRefOid: HEAD,
          isInMergeQueue: true,
          mergeQueueEntry: {
            id: 'queue-entry-16958',
            state: 'QUEUED',
            position: 1,
          },
          labels: { nodes: [] },
        },
      }),
      { now: LATER }
    );
    assert.equal(observed.status, 'controller-repair-pending');
    assert.equal(observed.fallback.workaroundVerified, true);
    assert.equal(observed.fallback.controllerReconciled, false);
    assert.equal(
      transitionComputerUseFallback(
        observed.fallback,
        event(observed.fallback, { type: 'ui-action-observed' }),
        { now: LATER }
      ).status,
      'duplicate'
    );
    assert.deepEqual(
      observed.fallback.history.slice(-2).map(item => item.state),
      ['postcondition-verified', 'controller-repair-pending']
    );
  });

  it('fails closed on target mismatch, stale revision, or missing machine CI', () => {
    const cases = [
      input({ live: { ...input().live, pr: PR + 1 } }),
      input({ live: { ...input().live, headSha: 'b'.repeat(40) } }),
      input({
        pr: PR + 1,
        policy: { ...input().policy, pr: PR + 1 },
        ci: { ...input().ci, pr: PR + 1 },
        live: { ...input().live, pr: PR + 1 },
      }),
      input({ ci: { ...input().ci, machineCertified: false } }),
      input({ ci: { ...input().ci, requiredStatuses: ['PR Ready'] } }),
      input({ ci: { ...input().ci, requiredStatuses: 'PR Ready' } }),
    ];
    for (const candidate of cases) {
      const result = planComputerUseFallback(record(), candidate, { now: NOW });
      assert.equal(result.status, 'blocked');
      assert.equal(result.fallback.executionAuthorized, false);
    }
  });

  it('deduplicates one action and rejects a conflicting writer or lease', () => {
    const planned = planComputerUseFallback(record(), input(), { now: NOW });
    assert.equal(
      planComputerUseFallback(record(), input(), {
        existing: planned.fallback,
        now: LATER,
      }).status,
      'duplicate'
    );
    const conflict = planComputerUseFallback(
      record(),
      input({ writer: 'symphony', leaseKey: 'other' }),
      { now: NOW }
    );
    assert.equal(conflict.status, 'blocked');
    assert.ok(
      conflict.fallback.reasons.includes('single-writer-lease-conflict')
    );
    assert.equal(
      planComputerUseFallback(
        record(),
        input({
          capability: {
            ...input().capability,
            allowedActions: 'queue-enroll',
          },
        }),
        { now: NOW }
      ).status,
      'blocked'
    );
  });

  it('denies drafts, direct merge, human review, consent, and protected operations', () => {
    const deniedPolicies = [
      { draft: true },
      { action: 'direct-merge' },
      { humanReviewRequired: true },
      { externalConsentRequired: true },
      { protectedOperation: true },
    ];
    for (const policyPatch of deniedPolicies) {
      const candidate = input({
        action: policyPatch.action || 'queue-enroll',
        policy: { ...input().policy, ...policyPatch },
      });
      const result = planComputerUseFallback(record(), candidate, { now: NOW });
      assert.equal(result.status, 'blocked');
      assert.equal(result.fallback.ovieAttention, null);
    }
    const decision = planComputerUseFallback(
      record(),
      input({
        policy: { ...input().policy, humanReviewRequired: true },
        founderDecision: {
          schema: FOUNDER_DECISION_RECEIPT_SCHEMA,
          verified: true,
          required: true,
          exactQuestion: 'Choose the protected landing boundary.',
        },
      }),
      { now: NOW }
    );
    assert.equal(decision.fallback.ovieAttention.status, 'decision-required');
  });

  it('stops on auth, MFA, permission, unexpected dialog, or credential scope', () => {
    for (const prompt of [
      'authPrompt',
      'mfaPrompt',
      'permissionPrompt',
      'unexpectedDialog',
    ]) {
      const result = planComputerUseFallback(
        record(),
        input({ live: { ...input().live, [prompt]: true } }),
        { now: NOW }
      );
      assert.equal(result.reason, 'unexpected-auth-permission-or-dialog');
    }
    assert.equal(
      planComputerUseFallback(
        record(),
        input({ capability: { ...input().capability, readsCookies: true } }),
        { now: NOW }
      ).status,
      'blocked'
    );
    const planned = planComputerUseFallback(record(), input(), { now: NOW });
    const stopped = transitionComputerUseFallback(
      planned.fallback,
      event(planned.fallback, {
        type: 'ui-action-started',
        sessionId: 'session-1',
        live: { ...input().live, authPrompt: true },
      }),
      { now: LATER }
    );
    assert.equal(stopped.reason, 'unexpected-auth-permission-or-dialog');
    assert.equal(
      transitionComputerUseFallback(
        planned.fallback,
        event(planned.fallback, {
          type: 'ui-action-started',
          sessionId: 'session-1',
        }),
        { now: '2026-09-01T20:06:00.000Z' }
      ).reason,
      'computer-use-preflight-expired'
    );
  });

  it('blocks target drift and UI/source postcondition disagreement', () => {
    const planned = planComputerUseFallback(record(), input(), { now: NOW });
    const drift = transitionComputerUseFallback(
      planned.fallback,
      event(planned.fallback, {
        type: 'ui-action-started',
        sessionId: 'session-1',
        live: { ...input().live, headSha: 'b'.repeat(40) },
      }),
      { now: LATER }
    );
    assert.equal(drift.reason, 'live-ui-target-or-revision-drift');
    const started = transitionComputerUseFallback(
      planned.fallback,
      event(planned.fallback, {
        type: 'ui-action-started',
        sessionId: 'session-1',
      }),
      { now: NOW }
    );
    const discrepancy = transitionComputerUseFallback(
      started.fallback,
      event(started.fallback, {
        type: 'ui-action-observed',
        uiState: 'queued',
        screenshot: {
          schema: COMPUTER_USE_SCREENSHOT_SCHEMA,
          verified: true,
          kind: 'postcondition',
          pr: PR,
          headSha: HEAD,
          ref: 'computer-use:screenshot:postcondition-2',
        },
        sourceReceipt: {
          number: PR,
          state: 'OPEN',
          isDraft: false,
          headRefOid: HEAD,
          isInMergeQueue: false,
          mergeQueueEntry: null,
          labels: { nodes: [] },
        },
      }),
      { now: LATER }
    );
    assert.equal(
      discrepancy.reason,
      'ui-authoritative-postcondition-discrepancy'
    );
  });

  it('suppresses fallback after authoritative controller repair', () => {
    const preflightSuppressed = planComputerUseFallback(
      record(),
      input({ controller: { ...input().controller, repaired: true } }),
      { now: NOW }
    );
    assert.equal(preflightSuppressed.status, 'blocked');
    assert.equal(preflightSuppressed.fallback.suppressed, true);
    const planned = planComputerUseFallback(record(), input(), { now: NOW });
    assert.equal(
      planComputerUseFallback(
        record(),
        input({ controller: { ...input().controller, repaired: true } }),
        { existing: planned.fallback, now: LATER }
      ).status,
      'blocked'
    );
    const resolvedController = advanceAttempt(
      record(),
      {
        healthy: true,
        exitCode: 0,
        proof: { verified: true, ref: 'controller:repair:verified' },
      },
      { now: LATER }
    );
    const suppressed = transitionComputerUseFallback(
      planned.fallback,
      event(planned.fallback, {
        type: 'controller-repaired',
        controllerRepaired: true,
        receipt: resolvedController,
      }),
      { now: LATER }
    );
    assert.equal(suppressed.reason, 'fallback-suppressed-controller-repaired');
    assert.equal(suppressed.fallback.suppressed, true);
    assert.equal(suppressed.fallback.controllerReconciled, true);
    assert.equal(
      transitionComputerUseFallback(
        planned.fallback,
        event(planned.fallback, {
          type: 'controller-repaired',
          controllerRepaired: true,
          receipt: { ...resolvedController, headSha: 'b'.repeat(40) },
        }),
        { now: LATER }
      ).reason,
      'controller-repair-proof-required'
    );
    assert.ok(COMPUTER_USE_FALLBACK_STATES.includes(suppressed.fallback.state));
  });
});
