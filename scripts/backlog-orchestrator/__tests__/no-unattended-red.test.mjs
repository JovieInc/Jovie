import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  ATTEMPT_BUDGET,
  advanceAttempt,
  assertNoUnattendedRed,
  buildEscalationHandoff,
  classifyAndOpenFromDelivery,
  classifyStall,
  DELEGATION_BUDGET,
  DELEGATION_RECEIPT_SCHEMA,
  dispatchOpenRecords,
  ESCALATION_HANDOFF_SCHEMA,
  ESCALATION_STATES,
  escalate,
  FOUNDER_CONTACT_PRIMARY_CHANNEL,
  FOUNDER_CONTACT_SCHEMA,
  inferStallClass,
  loopKeyFor,
  NO_UNATTENDED_RED_SCHEMA,
  NON_PROGRESS_BUDGET,
  openLoopRecord,
  persistDraftStackResolutions,
  persistLoopOutcome,
  planDelegatedDiagnosis,
  planFounderContact,
  prepareEscalation,
  projectSummerQueue,
  reconcileMissedEvents,
  requalifyExactHead,
  STALL_CLASSES,
  SUMMER_QUEUE_SCHEMA,
  splitSizeGuardChange,
  transitionFounderContact,
  withSummerQueueLock,
} from '../no-unattended-red.mjs';
import { OFFICIAL_ROUTING_RECEIPT_SCHEMA } from '../symphony-routing.mjs';

const HEAD = 'a'.repeat(40);
const NOW = '2026-08-28T22:00:00.000Z';
const MID = '2026-08-28T22:30:00.000Z';
const LATER = '2026-08-28T23:00:00.000Z';
const ROUTE = Object.freeze({
  schema: OFFICIAL_ROUTING_RECEIPT_SCHEMA,
  phase: 'prepared',
  attemptId: 'attempt-1',
  modelId: 'codex-terra',
  modelTier: 'standard',
  reasoningEffort: 'high',
  terminalOutcome: null,
  escalation: {
    status: 'escalated',
    fromTier: 'economical',
    toTier: 'standard',
  },
});
const REPO = 'JovieInc/Jovie';
const LYB_REPO = 'JovieInc/LogYourBody';
const signal = (stallClass, extra = {}) => ({
  repository: REPO,
  stallClass,
  issue: `JOV-${stallClass}`,
  pr: 5390,
  headSha: HEAD,
  ...extra,
});
const open = (stallClass, extra = {}) =>
  openLoopRecord(classifyStall(signal(stallClass, extra), { now: NOW }), {
    now: NOW,
  });
const founderInput = (extra = {}) => ({
  severity: 'production',
  recoveryExhausted: true,
  safeRollbackAvailable: false,
  featureFlagAvailable: false,
  founderReviewOpenedAt: NOW,
  ackWindowMs: 60_000,
  acknowledged: false,
  destination: 'ovie',
  destinationConsented: true,
  provider: FOUNDER_CONTACT_PRIMARY_CHANNEL,
  providerAllowed: true,
  ...extra,
});

// biome-ignore format: compact deliberate-red coverage for the PR size guard
describe('no unattended red loop', () => {
  it('deliberate red: every typed stall class is classified immediately', () => {
    const expected = {
      'size-guard': 'typed-remediation',
      'missing-failing-checks': 'typed-remediation',
      'stale-conflicted-head': 'typed-remediation',
      'queue-eviction': 'typed-remediation',
      'production-deployment-unbound': 'collect-evidence',
      'provider-unavailable': 'typed-remediation',
      'missing-owner-lease': 'typed-remediation',
      'dropped-controller-event': 'typed-remediation',
      'draft-stack-policy': 'typed-remediation',
      'fleet-observation-gap': 'typed-remediation',
      'base-not-main': 'typed-remediation',
      'not-proven': 'collect-evidence',
    };
    for (const stallClass of STALL_CLASSES) {
      const classified = classifyStall(
        signal(stallClass, {
          proven: stallClass !== 'not-proven',
          mechanical: stallClass === 'size-guard',
        }),
        { now: NOW }
      );
      assert.equal(classified.stallClass, stallClass);
      assert.equal(classified.mode, expected[stallClass]);
      assert.equal(classified.mergeQueueIndependent, true);
    }
  });

  it('maps event-local workflow failures without waiting on merge-queue state', () => {
    assert.equal(
      inferStallClass({ workflowName: 'PR Size Guard', conclusion: 'failure' }),
      'size-guard'
    );
    assert.equal(
      inferStallClass({ workflowName: 'CI', conclusion: 'failure' }),
      'missing-failing-checks'
    );
    assert.equal(
      inferStallClass({
        workflowName: 'PR targets main',
        conclusion: 'failure',
      }),
      'base-not-main'
    );
    assert.equal(
      inferStallClass({ baseRefName: 'feat/stacked' }),
      'base-not-main'
    );
    assert.equal(
      inferStallClass({ failure: 'main-unknown' }),
      'fleet-observation-gap'
    );
    assert.equal(
      inferStallClass({ observationGap: true }),
      'fleet-observation-gap'
    );
    const empty = dispatchOpenRecords([open('queue-eviction')], {
      capacity: 1,
      now: NOW,
      mergeQueueState: { count: 0 },
    });
    const full = dispatchOpenRecords([open('queue-eviction')], {
      capacity: 1,
      now: NOW,
      mergeQueueState: { count: 99 },
    });
    assert.equal(empty.dispatched[0].action, full.dispatched[0].action);
    assert.equal(empty.mergeQueueIndependent, true);
  });

  it('limits parallel dispatch to global measured capacity', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jovie-red-dedupe-'));
    try {
      const first = open('missing-failing-checks');
      const second = openLoopRecord(
        classifyStall(signal('missing-failing-checks'), { now: NOW }),
        { existing: first, now: NOW }
      );
      assert.equal(second.loopKey, first.loopKey);
      assert.equal(second.duplicate, true);
      const [created, duplicate] = await Promise.all([
        persistLoopOutcome(first, { stateDir: directory }),
        persistLoopOutcome(first, { stateDir: directory }),
      ]);
      assert.deepEqual(new Set([created.status, duplicate.status]), new Set(['created', 'duplicate']));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
    const records = ['size-guard', 'queue-eviction', 'provider-unavailable', 'missing-owner-lease'].map(
      (stallClass, index) =>
        open(stallClass, { issue: `JOV-${index}`, mechanical: stallClass === 'size-guard' })
    );
    assert.equal(dispatchOpenRecords(records, { capacity: 0, now: NOW }).dispatched.length, 0);
    const limited = dispatchOpenRecords(records, { capacity: 2, now: NOW });
    assert.equal(limited.dispatched.length, 2);
    assert.equal(limited.deferred.length, 2);
  });

  it('detects repeated no-progress before the retry budget is exhausted', () => {
    let record = open('provider-unavailable');
    record = advanceAttempt(record, { reason: 'still-unavailable' }, { now: NOW });
    assert.equal(record.attempt, 1);
    assert.equal(record.backoffMs, 60_000);
    assert.equal(record.state, 'retrying');
    record = advanceAttempt(record, { reason: 'still-unavailable' }, { now: NOW });
    assert.equal(record.nonProgressCount, NON_PROGRESS_BUDGET);
    assert.equal(record.state, 'escalation-pending');
    assert.equal(record.outcome, 'open');
    assert.equal(record.terminal, false);
    assert.match(record.reason, /nonprogress-budget-exhausted:provider-unavailable/);
    assert.equal(record.escalation.handoff.schema, ESCALATION_HANDOFF_SCHEMA);
    assert.equal(ATTEMPT_BUDGET, 3);
  });

  it('persists state transitions as idempotent append-only generations', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jovie-red-generations-'));
    try {
      const initial = open('dropped-controller-event', { issue: 'JOV-5169', pr: 16904 });
      const retrying = advanceAttempt(initial, { reason: 'same-controller-failure' }, { now: MID });
      const pending = advanceAttempt(retrying, { reason: 'same-controller-failure' }, { now: LATER });
      assert.notEqual(initial.loopKey, retrying.loopKey);
      assert.notEqual(retrying.loopKey, pending.loopKey);
      assert.equal(retrying.rootLoopKey, initial.loopKey);
      assert.equal(pending.rootLoopKey, initial.loopKey);
      assert.equal(retrying.supersedesLoopKey, initial.loopKey);
      assert.equal(pending.supersedesLoopKey, retrying.loopKey);
      for (const record of [initial, retrying, pending]) {
        assert.equal((await persistLoopOutcome(record, { stateDir: directory })).status, 'created');
      }
      assert.equal(
        (await persistLoopOutcome(pending, { stateDir: directory })).status,
        'duplicate'
      );
      assert.equal((await readdir(join(directory, 'red-loop'))).length, 3);
      const queue = JSON.parse(await readFile(join(directory, 'summer-queue.json'), 'utf8'));
      assert.equal(queue.items.length, 1);
      assert.equal(queue.items[0].state, 'escalation-pending');
      assert.equal(queue.items[0].issue, 'JOV-5169');
      const resolved = advanceAttempt(
        pending,
        {
          healthy: true,
          exitCode: 0,
          proof: { verified: true, ref: 'ci:repair-verified' },
        },
        { now: '2026-08-28T23:30:00.000Z' }
      );
      const completed = await persistLoopOutcome(resolved, { stateDir: directory });
      assert.equal(completed.queue.items.length, 0);
      assert.equal(completed.queue.terminalTombstones.length, 1);
      assert.equal(completed.queue.terminalTombstones[0].state, 'resolved');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('never infers success from a swallowed exit code without proof', () => {
    const first = advanceAttempt(
      open('dropped-controller-event'),
      { healthy: true, exitCode: 0 },
      { now: NOW }
    );
    assert.equal(first.outcome, 'open');
    assert.equal(first.state, 'retrying');
    assert.equal(first.reason, 'success-unproven');
    const second = advanceAttempt(
      first,
      { healthy: true, exitCode: 1, proof: { verified: true, ref: 'run:failed' } },
      { now: LATER }
    );
    assert.notEqual(second.outcome, 'healthy');
    const emptyProof = advanceAttempt(
      open('dropped-controller-event', { issue: 'JOV-EMPTY-PROOF' }),
      { healthy: true, exitCode: 0, proof: { verified: true } },
      { now: LATER }
    );
    assert.equal(emptyProof.outcome, 'open');
    assert.equal(emptyProof.reason, 'success-unproven');
  });

  it('redacts and deduplicates the bounded escalation handoff', () => {
    const record = open('dropped-controller-event');
    const input = {
      object: 'JOV-5169 token=ghs_supersecret',
      environment: 'production',
      revision: HEAD,
      phase: 'controller-observation',
      failure: 'HTTP 502 authorization=Bearer-secret',
      evidenceRefs: [
        'https://github.com/JovieInc/Jovie/actions/runs/1?token=github_pat_secret',
        '/Users/founder/private/controller.log',
      ],
      requiredScopes: ['pull_requests:read', 'api_key=lin_api_secret'],
      exactQuestion: 'Can the bounded REST snapshot replace secret=sk-private?',
    };
    const first = buildEscalationHandoff(record, input, { now: NOW });
    const duplicate = buildEscalationHandoff(record, input, { now: LATER });
    assert.equal(first.schema, ESCALATION_HANDOFF_SCHEMA);
    assert.equal(first.escalationKey, duplicate.escalationKey);
    assert.deepEqual(Object.keys(first).sort(), [
      'attempts',
      'createdAt',
      'environment',
      'escalationKey',
      'evidenceRefs',
      'exactQuestion',
      'failure',
      'object',
      'phase',
      'redaction',
      'requiredScopes',
      'revision',
      'schema',
    ]);
    const serialized = JSON.stringify(first);
    assert.doesNotMatch(serialized, /supersecret|github_pat_secret|lin_api_secret|sk-private|\/Users\/founder/);
    assert.match(serialized, /REDACTED|~\/private/);
  });

  it('delegates only through the canonical bounded model route and preserves one writer', () => {
    const pending = prepareEscalation(
      open('dropped-controller-event'),
      'nonprogress-budget-exhausted:dropped-controller-event',
      NOW
    );
    const allowed = planDelegatedDiagnosis(
      pending,
      { target: 'symphony', deterministicExhausted: true, route: ROUTE, routeVerified: true },
      { now: NOW }
    );
    assert.equal(allowed.status, 'delegated');
    assert.equal(allowed.record.state, 'delegated-diagnosis');
    assert.equal(allowed.record.writer, pending.writer);
    assert.equal(allowed.record.owner, pending.owner);
    assert.equal(allowed.record.delegation.schema, DELEGATION_RECEIPT_SCHEMA);
    assert.equal(allowed.record.delegation.reconcileOwner, 'gem');
    assert.equal(allowed.record.delegationBudget, DELEGATION_BUDGET - 1);
    const alternate = planDelegatedDiagnosis(
      pending,
      {
        target: 'symphony',
        deterministicExhausted: true,
        routeVerified: true,
        route: {
          schema_version: 1,
          deterministic_first: true,
          workflow: 'remediation',
          capability: 'code',
          selected: {
            id: 'grok-code-fast-1',
            provider: 'grok',
            model: 'grok-code-fast-1',
            channel: 'subscription',
          },
          candidates: [{ id: 'grok-code-fast-1', status: 'ready' }],
        },
      },
      { now: NOW }
    );
    assert.equal(alternate.status, 'delegated');
    assert.equal(alternate.record.delegation.route.provider, 'grok');
    assert.equal(alternate.record.delegation.route.escalation.status, 'alternate-provider');
    assert.equal(
      planDelegatedDiagnosis(
        allowed.record,
        { target: 'symphony', deterministicExhausted: true, route: ROUTE, routeVerified: true },
        { now: LATER }
      ).status,
      'duplicate'
    );

    const self = planDelegatedDiagnosis(
      pending,
      { target: 'gem', deterministicExhausted: true, route: ROUTE, routeVerified: true },
      { now: NOW }
    );
    assert.equal(self.status, 'denied');
    assert.ok(self.record.delegation.reasons.includes('self-or-loop-delegation-denied'));
    const unqualified = planDelegatedDiagnosis(
      pending,
      { target: 'symphony', deterministicExhausted: false, route: { modelId: 'other' } },
      { now: NOW }
    );
    assert.equal(unqualified.status, 'denied');
    assert.ok(unqualified.record.delegation.reasons.includes('deterministic-remediation-not-exhausted'));
    assert.ok(unqualified.record.delegation.reasons.includes('verified-canonical-model-route-required'));
    const recovery = planDelegatedDiagnosis(
      pending,
      { target: 'symphony', deterministicExhausted: false, route: ROUTE, routeVerified: true },
      { now: NOW }
    );
    assert.equal(recovery.status, 'denied');
    assert.equal(planDelegatedDiagnosis(recovery.record, { target: 'symphony', deterministicExhausted: true, route: ROUTE, routeVerified: true }, { now: LATER }).status, 'delegated');
    const noBudget = planDelegatedDiagnosis(
      { ...pending, delegationBudget: 0 },
      { target: 'symphony', deterministicExhausted: true, route: ROUTE, routeVerified: true },
      { now: NOW }
    );
    assert.equal(noBudget.reason, 'delegation-budget-exhausted');
    const malformedRegistry = planDelegatedDiagnosis(
      pending,
      {
        target: 'symphony',
        deterministicExhausted: true,
        routeVerified: true,
        route: {
          schema_version: 1,
          deterministic_first: true,
          workflow: 'remediation',
          selected: { id: 'grok-code-fast-1', provider: 'grok', model: 'grok-code-fast-1' },
          candidates: 'ready',
        },
      },
      { now: NOW }
    );
    assert.equal(malformedRegistry.status, 'denied');
    assert.equal(malformedRegistry.reason, 'verified-canonical-model-route-required');
  });

  it('moves delegated helper output through verification, resolution, and timeout escalation', () => {
    const pending = prepareEscalation(open('dropped-controller-event'), 'needs-helper', NOW);
    const delegated = planDelegatedDiagnosis(
      pending,
      { target: 'symphony', deterministicExhausted: true, route: ROUTE, routeVerified: true },
      { now: NOW }
    ).record;
    const verifying = advanceAttempt(
      delegated,
      {
        phase: 'repair-verifying',
        proof: { verified: true, ref: 'workspace:repair-diff', phase: 'helper-repair' },
        reason: 'helper-repair-produced',
      },
      { now: NOW }
    );
    assert.equal(verifying.state, 'repair-verifying');
    assert.equal(verifying.nonProgressCount, 0);
    const resolved = advanceAttempt(
      verifying,
      {
        healthy: true,
        exitCode: 0,
        proof: { verified: true, ref: 'ci:focused-tests', phase: 'verification' },
        reason: 'repair-verified',
      },
      { now: LATER }
    );
    assert.equal(resolved.state, 'resolved');
    assert.equal(resolved.outcome, 'healthy');
    assert.equal(resolved.terminal, true);

    const timeout = advanceAttempt(delegated, { timedOut: true }, { now: NOW });
    assert.equal(timeout.state, 'retrying');
    assert.match(timeout.reason, /repair-timeout/);
    const exhausted = advanceAttempt(timeout, { timedOut: true }, { now: LATER });
    assert.equal(exhausted.state, 'escalation-pending');
    assert.match(exhausted.reason, /nonprogress-budget-exhausted/);
  });

  it('plans Ovie-first founder contact only after every conservative gate passes', () => {
    const blocked = escalate(
      open('production-deployment-unbound'),
      'recovery-exhausted:production-deployment-unbound',
      NOW,
      {
        environment: 'production',
        evidenceRefs: ['https://github.com/JovieInc/Jovie/actions/runs/2?token=ghs_hidden'],
        exactQuestion: 'Approve rollback boundary; api_key=sk-hidden',
      }
    );
    const planned = planFounderContact(blocked, founderInput(), { now: LATER });
    assert.equal(planned.status, 'planned');
    assert.equal(planned.contact.schema, FOUNDER_CONTACT_SCHEMA);
    assert.equal(planned.contact.channel, FOUNDER_CONTACT_PRIMARY_CHANNEL);
    assert.equal(planned.contact.dispatchAuthorized, false);
    assert.equal(planned.contact.fallbacks.text.status, 'inactive');
    assert.equal(planned.contact.fallbacks.call.status, 'inactive');
    assert.deepEqual(planned.contact.allowedActions, ['ack', 'snooze', 'resolve']);
    assert.equal(planned.record.escalation.founderContact.contactKey, planned.contact.contactKey);
    assert.doesNotMatch(JSON.stringify(planned.contact), /ghs_hidden|sk-hidden/);
    const duplicate = planFounderContact(blocked, founderInput(), {
      existing: planned.contact,
      now: LATER,
    });
    assert.equal(duplicate.status, 'duplicate');
    const cooldown = planFounderContact(
      escalate(
        open('production-deployment-unbound', { issue: 'JOV-OTHER', pr: 9999 }),
        'different-critical-block',
        NOW
      ),
      founderInput(),
      { existing: planned.contact, now: LATER }
    );
    assert.equal(cooldown.status, 'blocked');
    assert.ok(cooldown.contact.reasons.includes('founder-contact-cooldown-active'));

    const lowSeverity = planFounderContact(
      blocked,
      founderInput({ severity: 'routine' }),
      { now: LATER }
    );
    assert.equal(lowSeverity.status, 'blocked');
    assert.ok(lowSeverity.contact.reasons.includes('critical-severity-not-proven'));
    const noDestination = planFounderContact(
      blocked,
      founderInput({ destination: null, destinationConsented: false }),
      { now: LATER }
    );
    assert.equal(noDestination.status, 'blocked');
    assert.ok(noDestination.contact.reasons.includes('ovie-destination-or-consent-unavailable'));
    const providerDenied = planFounderContact(
      blocked,
      founderInput({ providerAllowed: false }),
      { now: LATER }
    );
    assert.equal(providerDenied.status, 'blocked');
    assert.ok(providerDenied.contact.reasons.includes('ovie-push-provider-denied'));
    const recovered = planFounderContact(blocked, founderInput(), {
      existing: providerDenied.contact,
      now: LATER,
    });
    assert.equal(recovered.status, 'planned');
    assert.equal(
      planFounderContact(blocked, founderInput({ ackWindowMs: -1 }), { now: LATER }).status,
      'blocked'
    );
  });

  it('records planned, dispatched, delivered, and acknowledged Ovie receipts without sending', () => {
    const blocked = escalate(open('provider-unavailable'), 'critical-runtime-blocked', NOW);
    const planned = planFounderContact(
      blocked,
      founderInput({ severity: 'security' }),
      { now: LATER }
    ).contact;
    const dispatched = transitionFounderContact(
      planned,
      {
        type: 'dispatched',
        observed: true,
        receipt: 'ovie-push:dispatch:1 token=ghs_hidden',
      },
      { now: LATER }
    );
    assert.equal(dispatched.status, 'dispatched');
    assert.doesNotMatch(dispatched.contact.dispatchReceipt, /ghs_hidden/);
    const delivered = transitionFounderContact(
      dispatched.contact,
      { type: 'delivered', observed: true, receipt: 'ovie-push:delivery:1' },
      { now: LATER }
    );
    assert.equal(delivered.status, 'delivered');
    const acknowledged = transitionFounderContact(
      delivered.contact,
      { type: 'ack', observed: true, receipt: 'ovie-push:ack:1' },
      { now: LATER }
    );
    assert.equal(acknowledged.status, 'acknowledged');
    assert.equal(acknowledged.contact.acknowledgement.action, 'ack');
    assert.equal(
      transitionFounderContact(acknowledged.contact, { type: 'ack' }, { now: LATER }).status,
      'duplicate'
    );
    assert.deepEqual(
      acknowledged.contact.receipts.map(receipt => receipt.status),
      ['planned', 'dispatched', 'delivered', 'acknowledged']
    );
    assert.equal(
      transitionFounderContact(
        dispatched.contact,
        { type: 'delivered', receipt: 'unobserved-delivery' },
        { now: LATER }
      ).reason,
      'delivery-observation-proof-required'
    );
    assert.equal(
      transitionFounderContact(delivered.contact, { type: 'ack' }, { now: LATER }).reason,
      'founder-ack-observation-proof-required'
    );
    assert.equal(
      transitionFounderContact(planned, { type: 'call-escalation', explicitActivation: true }, { now: LATER }).reason,
      'call-fallback-not-activated'
    );
    assert.equal(
      transitionFounderContact(
        planned,
        { type: 'dispatched', receipt: 'unobserved-dispatch' },
        { now: LATER }
      ).reason,
      'dispatch-observation-proof-required'
    );
    const callReady = {
      ...planned,
      fallbacks: { ...planned.fallbacks, call: { status: 'active', activation: 'explicit' } },
    };
    assert.equal(
      transitionFounderContact(
        callReady,
        { type: 'call-escalation', explicitActivation: true },
        { now: LATER }
      ).status,
      'call-escalation'
    );
    assert.equal(
      transitionFounderContact(planned, { type: 'unknown' }, { now: LATER }).reason,
      'founder-contact-transition-denied'
    );
    assert.equal(
      transitionFounderContact({}, { type: 'ack' }, { now: LATER }).reason,
      'founder-contact-receipt-required'
    );
    for (const action of ['snooze', 'resolve']) {
      const result = transitionFounderContact(
        planned,
        {
          type: action,
          observed: true,
          receipt: `ovie-push:${action}:1`,
          snoozeUntil: action === 'snooze' ? '2026-08-29T00:00:00.000Z' : null,
        },
        { now: LATER }
      );
      assert.equal(result.status, 'acknowledged');
      assert.equal(result.contact.acknowledgement.action, action);
    }
    assert.ok(ESCALATION_STATES.includes('hard-blocked'));
  });

  it('deliberate red: not-proven never becomes a repair claim', () => {
    const missing = classifyStall(
      { issue: 'JOV-2', pr: 2, checksMissing: true, proven: false, failure: 'missing-failing-checks' },
      { now: NOW }
    );
    assert.equal(missing.stallClass, 'not-proven');
    assert.equal(missing.mode, 'collect-evidence');
    assert.notEqual(missing.action, 'create-bounded-ci-repair-pr');
    assert.equal(
      classifyStall(signal('production-deployment-unbound'), { now: NOW }).mode,
      'collect-evidence'
    );
    const requalified = requalifyExactHead(open('missing-failing-checks'), 'b'.repeat(40), {
      now: NOW,
    });
    assert.equal(requalified.stallClass, 'not-proven');
    assert.equal(requalified.reason, 'exact-head-changed-requalify');
    const receipt = classifyAndOpenFromDelivery(
      { repository: REPO, delivery_key: 'unknown-1', issue: 'JOV-20' },
      { now: NOW }
    );
    assert.equal(receipt.mode, 'collect-evidence');
    assert.equal(receipt.externalMutations, 0);
  });

  it('splits verified mechanical size-guard failures and recovers only missed events', () => {
    const splits = splitSizeGuardChange(
      ['apps/web/app/page.tsx', 'scripts/symphony/gem-ops-hud.py', 'canon/invariants.jsonl'],
      { mechanical: true }
    );
    assert.deepEqual(splits.map(item => item.alignment), ['apps/web', 'canon', 'scripts/symphony']);
    assert.ok(splits.every(item => item.preserveBehavior && item.requalify && item.proven === false));
    assert.throws(() => splitSizeGuardChange(['apps/web/app/page.tsx']), /verified mechanical failure/);
    const recovered = reconcileMissedEvents(
      [open('queue-eviction', { issue: 'JOV-11' })],
      [signal('queue-eviction', { issue: 'JOV-11' }), signal('missing-owner-lease', { issue: 'JOV-12' })],
      { now: NOW }
    );
    assert.equal(recovered.length, 1);
    assert.equal(recovered[0].issue, 'JOV-12');
  });

  it('deliberate red: exhausted retry budget escalates with the exact reason', () => {
    const escalated = escalate(
      open('dropped-controller-event'),
      'authority-budget-exhausted:dropped-controller-event',
      NOW
    );
    assert.equal(escalated.outcome, 'escalated');
    assert.equal(escalated.state, 'hard-blocked');
    assert.equal(escalated.reason, 'authority-budget-exhausted:dropped-controller-event');
    assert.equal(escalated.owner, 'gem');
    assert.equal(escalated.writer, 'gem');
    assert.equal(escalated.escalation.leaseKey, escalated.leaseKey);
  });

  it('persists a canonical Summer queue and rejects silent unattended red', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jovie-red-queue-'));
    try {
      const record = open('size-guard', { mechanical: true });
      const persisted = await persistLoopOutcome(record, { stateDir: directory });
      assert.equal(persisted.queue.schema, SUMMER_QUEUE_SCHEMA);
      assert.equal(persisted.queue.items[0].stallClass, 'size-guard');
      const onDisk = JSON.parse(await readFile(persisted.queuePath, 'utf8'));
      assert.deepEqual(projectSummerQueue([record], { now: NOW }).items, onDisk.items);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
    assert.equal(assertNoUnattendedRed([open('not-proven', { proven: false })]), true);
  });

  it('deliberate red: Summer queue tombstones healthy artifacts and timestamps active items', () => {
    const active = open('queue-eviction', { issue: 'JOV-5400', pr: 16599 });
    const merged = advanceAttempt(
      open('missing-failing-checks', { issue: 'JOV-5335', pr: 16423 }),
      {
        healthy: true,
        exitCode: 0,
        proof: { verified: true, ref: 'github:pr:16423:merged' },
        reason: 'linked-pr-merged-and-linear-done',
      },
      { now: NOW }
    );
    const escalated = escalate(
      open('provider-unavailable', { issue: 'JOV-5401' }),
      'founder-action-required',
      NOW
    );

    /** @type {any} The runtime queue schema is validated by the assertions below. */
    const queue = projectSummerQueue([merged, active, escalated], { now: NOW });

    assert.deepEqual(queue.items.map(item => item.issue), ['JOV-5400', 'JOV-5401']);
    assert.equal(queue.items[0].observedAt, NOW);
    assert.equal(queue.items[0].terminal, false);
    assert.equal(queue.items[1].terminal, true);
    assert.equal(queue.counts.terminalHidden, 1);
    assert.equal(queue.counts.healthy, 0);
    assert.equal(queue.terminalTombstones[0].issue, 'JOV-5335');
    assert.equal(queue.terminalTombstones[0].pr, 16423);
    assert.equal(queue.terminalTombstones[0].observedAt, NOW);
    assert.equal(queue.terminalTombstones[0].reason, 'linked-pr-merged-and-linear-done');
  });

  it('deliberate red: anonymous stall identity ignores observation time', async () => {
    const anonymous = (stallClass, extra = {}) => ({
      repository: extra.repository ?? REPO,
      stallClass,
      workflowName: extra.workflowName ?? 'CI',
      headSha: extra.headSha ?? HEAD,
      proven: true,
      ...extra,
    });
    const first = classifyStall(anonymous('missing-failing-checks'), { now: NOW });
    const later = classifyStall(anonymous('missing-failing-checks'), {
      now: '2026-08-29T01:00:00.000Z',
    });
    assert.equal(first.deliveryKey, later.deliveryKey);
    assert.equal(first.issueKey, later.issueKey);
    assert.equal(loopKeyFor(first), loopKeyFor(later));
    assert.notEqual(first.observedAt, later.observedAt);
    assert.equal(
      classifyStall(anonymous('missing-failing-checks', { event_id: 'evt-1' }), { now: NOW })
        .deliveryKey,
      'evt-1'
    );
    assert.notEqual(
      first.deliveryKey,
      classifyStall(
        anonymous('missing-failing-checks', { workflowName: 'Production Controller' }),
        { now: NOW }
      ).deliveryKey
    );
    assert.notEqual(
      first.deliveryKey,
      classifyStall(anonymous('missing-failing-checks', { headSha: 'b'.repeat(40) }), {
        now: NOW,
      }).deliveryKey
    );
    assert.notEqual(
      first.deliveryKey,
      classifyStall(anonymous('dropped-controller-event'), { now: NOW }).deliveryKey
    );
    assert.notEqual(first.issueKey, classifyStall(signal('missing-failing-checks'), { now: NOW }).issueKey);
    assert.equal(
      reconcileMissedEvents(
        [openLoopRecord(first, { now: NOW })],
        [anonymous('missing-failing-checks')],
        { now: '2026-08-29T01:00:00.000Z' }
      ).length,
      0
    );
    const directory = await mkdtemp(join(tmpdir(), 'jovie-red-anonymous-'));
    try {
      const [created, duplicate] = await Promise.all([
        persistLoopOutcome(openLoopRecord(first, { now: NOW }), { stateDir: directory }),
        persistLoopOutcome(openLoopRecord(later, { now: later.observedAt }), {
          stateDir: directory,
        }),
      ]);
      assert.deepEqual(new Set([created.status, duplicate.status]), new Set(['created', 'duplicate']));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('deliberate red: identical PR numbers in different repositories use different loop keys', () => {
    const jovie = classifyStall(
      signal('queue-eviction', {
        issue: null,
        pr: 42,
        repository: REPO,
      }),
      { now: NOW }
    );
    const logYourBody = classifyStall(
      signal('queue-eviction', {
        issue: null,
        pr: 42,
        repository: LYB_REPO,
      }),
      { now: NOW }
    );
    assert.notEqual(jovie.issueKey, logYourBody.issueKey);
    assert.notEqual(loopKeyFor(jovie), loopKeyFor(logYourBody));
  });

  it('deliberate red: legacy anonymous duplicate projection without repository is omitted', () => {
    const later = '2026-08-29T01:00:00.000Z';
    const legacy = (observedAt, extra = {}) => ({
      schema: NO_UNATTENDED_RED_SCHEMA,
      outcome: extra.outcome ?? 'open',
      stallClass: extra.stallClass ?? 'dropped-controller-event',
      issue: extra.issue ?? null,
      pr: extra.pr ?? null,
      headSha: extra.headSha ?? HEAD,
      workflow: extra.workflow ?? null,
      issueKey: extra.issueKey ?? `legacy:${observedAt}`,
      deliveryKey: extra.deliveryKey ?? `legacy:${observedAt}`,
      owner: extra.owner ?? 'gem',
      writer: extra.writer ?? 'gem',
      action: extra.action ?? 'restore-event-trigger-and-reconcile',
      leaseKey: extra.leaseKey ?? 'lease',
      nextProofAt: observedAt,
      dispatchState: extra.dispatchState ?? 'classified',
      mode: extra.mode ?? 'typed-remediation',
      observedAt,
      terminal: extra.terminal ?? false,
      reason: extra.reason ?? 'dropped-controller-event:restore-event-trigger-and-reconcile',
      escalation: extra.escalation ?? null,
    });
    const identified = open('queue-eviction', { issue: 'JOV-5400', pr: 16599 });
    const otherHead = legacy(NOW, {
      stallClass: 'dropped-controller-event',
      headSha: 'b'.repeat(40),
      issueKey: 'legacy-other-head',
    });
    const otherClass = legacy(NOW, {
      stallClass: 'missing-failing-checks',
      workflow: 'CI',
      issueKey: 'legacy-other-class',
      action: 'create-bounded-ci-repair-pr',
    });
    /** @type {any} The runtime queue schema is validated by the assertions below. */
    const queue = projectSummerQueue(
      [
        legacy('2026-08-28T21:00:00.000Z'),
        legacy(later),
        legacy(NOW, {
          outcome: 'escalated',
          terminal: true,
          issueKey: 'legacy-escalated',
          reason: 'retry-budget-exhausted:dropped-controller-event',
          escalation: { reason: 'retry-budget-exhausted:dropped-controller-event' },
        }),
        otherHead,
        otherClass,
        identified,
      ],
      { now: NOW }
    );
    const dropped = queue.items.filter(item => item.stallClass === 'dropped-controller-event');
    assert.equal(dropped.filter(item => item.headSha === HEAD && !item.issue).length, 0);
    assert.equal(dropped.filter(item => item.headSha === 'b'.repeat(40)).length, 0);
    assert.equal(queue.items.filter(item => item.stallClass === 'missing-failing-checks').length, 0);
    assert.equal(queue.items.filter(item => item.issue === 'JOV-5400').length, 1);
    assert.equal(queue.items.every(item => item.repository), true);
    assert.equal(projectSummerQueue([], { now: NOW }).items.length, 0);
  });

  it('emits a current-generation tombstone when a stale partial draft-stack tombstone is invisible', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jovie-red-partial-tombstone-'));
    try {
      const root = 16606;
      const resolvedAt = '2026-08-28T23:00:00.000Z';
      const abandonedKey = '2'.repeat(64);
      const currentKey = '3'.repeat(64);
      const authority = { schema: 'jovie-draft-stack-authority/v1', snapshotKey: currentKey, observedAt: resolvedAt };
      const legacy = {
        ...open('draft-stack-policy', { issue: null, pr: root, delivery_key: `stack-${root}` }),
        draftStackGeneration: null,
      };
      const partial = {
        ...legacy,
        loopKey: 'f'.repeat(64),
        issueKey: `draft-stack-resolved:${root}:${resolvedAt}`,
        outcome: 'healthy',
        terminal: true,
        dispatchState: 'complete',
        observedAt: resolvedAt,
        reason: 'draft-stack-policy-current-action-absent',
        supersedesLoopKey: legacy.loopKey,
        draftStackGeneration: abandonedKey,
      };
      await persistLoopOutcome(legacy, { stateDir: directory });
      await withSummerQueueLock(directory, () => persistLoopOutcome(partial, { stateDir: directory, queueLockHeld: true }));

      const recovered = await persistDraftStackResolutions([], {
        stateDir: directory,
        now: resolvedAt,
        draftStackAuthority: authority,
      });

      assert.equal(recovered.status, 'resolved');
      assert.equal(recovered.resolved[0].record.draftStackGeneration, currentKey);
      assert.equal(recovered.resolved[0].record.supersedesLoopKey, legacy.loopKey);
      assert.equal(recovered.queue.items.some(item => item.pr === root), false);
      assert.equal(recovered.queue.terminalTombstones.some(item => item.pr === root), true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('serializes queue generations and recovers after a dead writer', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jovie-red-queue-lock-'));
    /** @type {((value?: unknown) => void) | undefined} */
    let releaseFirst;
    /** @type {((value?: unknown) => void) | undefined} */
    let markFirstEntered;
    /** @type {import('node:child_process').ChildProcess | undefined} */
    let holder;
    const firstEntered = new Promise(resolve => { markFirstEntered = resolve; });
    const holdFirst = new Promise(resolve => { releaseFirst = resolve; });
    try {
      const first = persistLoopOutcome(open('queue-eviction', { issue: 'JOV-LOCK-1', pr: 16601 }), {
        stateDir: directory,
        beforeProject: async () => { markFirstEntered(); await holdFirst; },
      });
      await firstEntered;
      let secondCompleted = false;
      const second = persistLoopOutcome(
        open('missing-failing-checks', { issue: 'JOV-LOCK-2', pr: 16602 }),
        { stateDir: directory }
      ).then(result => { secondCompleted = true; return result; });
      await new Promise(resolve => setTimeout(resolve, 75));
      assert.equal(secondCompleted, false);
      releaseFirst(); await Promise.all([first, second]);
      const queue = JSON.parse(await readFile(join(directory, 'summer-queue.json'), 'utf8'));
      assert.deepEqual(queue.items.map(item => item.pr).sort(), [16601, 16602]);
      const oldKey = '1'.repeat(64); const newKey = '2'.repeat(64); const later = '2026-08-28T23:00:00.000Z';
      const authority = (snapshotKey, observedAt) => ({ schema: 'jovie-draft-stack-authority/v1', snapshotKey, observedAt });
      const draft = { ...open('draft-stack-policy', { issue: null, pr: 16603, delivery_key: 'stack-16603' }), draftStackGeneration: oldKey };
      await withSummerQueueLock(directory, async () => {
        await persistLoopOutcome(draft, { stateDir: directory, queueLockHeld: true });
        await persistDraftStackResolutions([16603], { stateDir: directory, now: NOW, queueLockHeld: true, draftStackAuthority: authority(oldKey, NOW) });
      });
      const partial = { ...draft, loopKey: 'f'.repeat(64), outcome: 'healthy', terminal: true, observedAt: later, draftStackGeneration: newKey };
      await withSummerQueueLock(directory, () => persistLoopOutcome(partial, { stateDir: directory, queueLockHeld: true }));
      const afterCrash = await persistLoopOutcome(open('queue-eviction', { issue: 'JOV-LOCK-4', pr: 16604 }), { stateDir: directory });
      assert.equal(afterCrash.queue.items.find(item => item.pr === 16603).outcome, 'open');
      const recovered = await withSummerQueueLock(directory, () => persistDraftStackResolutions([], { stateDir: directory, now: later, queueLockHeld: true, draftStackAuthority: authority(newKey, later) }));
      assert.equal(recovered.queue.items.some(item => item.pr === 16603), false);
      const equalLegacy = { ...draft, loopKey: 'e'.repeat(64), observedAt: later, draftStackGeneration: null };
      assert.equal((await persistLoopOutcome(equalLegacy, { stateDir: directory })).queue.items.some(item => item.pr === 16603), false);
      holder = spawn('python3', ['-c', "import fcntl,sys,time; f=open(sys.argv[1],'a+'); fcntl.flock(f,fcntl.LOCK_EX); print('locked',flush=True); time.sleep(30)", join(directory, '.summer-queue.lock')], { stdio: ['ignore', 'pipe', 'pipe'] });
      await once(holder.stdout, 'data');
      let completed = false;
      const pending = persistLoopOutcome(open('queue-eviction', { issue: 'JOV-DEAD', pr: 16605 }), { stateDir: directory }).then(result => { completed = true; return result; });
      await new Promise(resolve => setTimeout(resolve, 75)); assert.equal(completed, false);
      holder.kill('SIGKILL'); await once(holder, 'exit');
      assert.equal((await pending).queue.items.some(item => item.pr === 16605), true);
    } finally {
      releaseFirst?.(); holder?.kill('SIGKILL');
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('deliberate red: silent or unattended red is rejected', () => {
    assert.throws(
      () =>
        assertNoUnattendedRed([
          { schema: 'jovie-no-unattended-red/v1', outcome: 'open', issueKey: 'silent' },
        ]),
      /unattended red: silent/
    );
  });
});
