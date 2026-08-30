import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  ATTEMPT_BUDGET,
  advanceAttempt,
  assertNoUnattendedRed,
  classifyAndOpenFromDelivery,
  classifyStall,
  dispatchOpenRecords,
  escalate,
  inferStallClass,
  loopKeyFor,
  NO_UNATTENDED_RED_SCHEMA,
  openLoopRecord,
  persistLoopOutcome,
  projectSummerQueue,
  reconcileMissedEvents,
  requalifyExactHead,
  STALL_CLASSES,
  SUMMER_QUEUE_SCHEMA,
  splitSizeGuardChange,
} from '../no-unattended-red.mjs';

const HEAD = 'a'.repeat(40);
const NOW = '2026-08-28T22:00:00.000Z';
const signal = (stallClass, extra = {}) => ({
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

  it('bounds retry with exponential backoff then escalates', () => {
    let record = open('provider-unavailable');
    record = advanceAttempt(record, { reason: 'still-unavailable' }, { now: NOW });
    assert.equal(record.attempt, 1);
    assert.equal(record.backoffMs, 60_000);
    record = advanceAttempt(record, { reason: 'still-unavailable' }, { now: NOW });
    assert.equal(record.backoffMs, 120_000);
    const terminal = advanceAttempt(record, { reason: 'still-unavailable' }, { now: NOW });
    assert.equal(terminal.outcome, 'escalated');
    assert.match(terminal.reason, /retry-budget-exhausted:provider-unavailable/);
    assert.ok(terminal.attempt + 1 >= ATTEMPT_BUDGET);
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
    const receipt = classifyAndOpenFromDelivery({ delivery_key: 'unknown-1', issue: 'JOV-20' }, { now: NOW });
    assert.equal(receipt.mode, 'collect-evidence');
    assert.equal(receipt.externalMutations, 0);
  });

  it('splits verified mechanical size-guard failures and recovers only missed events', () => {
    const splits = splitSizeGuardChange(
      ['apps/web/app/page.tsx', 'scripts/hermes/gem-ops-hud.py', 'canon/invariants.jsonl'],
      { mechanical: true }
    );
    assert.deepEqual(splits.map(item => item.alignment), ['apps/web', 'canon', 'scripts/hermes']);
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
    assert.equal(escalated.reason, 'authority-budget-exhausted:dropped-controller-event');
    assert.equal(escalated.owner, 'human');
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
      { healthy: true, reason: 'linked-pr-merged-and-linear-done' },
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

  it('deliberate red: legacy anonymous duplicate projection emits one active queue item', () => {
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
    assert.equal(dropped.filter(item => item.headSha === HEAD && !item.issue).length, 1);
    assert.equal(dropped.find(item => item.headSha === HEAD && !item.issue).outcome, 'escalated');
    assert.equal(dropped.find(item => item.headSha === HEAD && !item.issue).observedAt, NOW);
    assert.equal(dropped.filter(item => item.headSha === 'b'.repeat(40)).length, 1);
    assert.equal(queue.items.filter(item => item.stallClass === 'missing-failing-checks').length, 1);
    assert.equal(queue.items.filter(item => item.issue === 'JOV-5400').length, 1);
    assert.equal(projectSummerQueue([], { now: NOW }).items.length, 0);
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
