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
