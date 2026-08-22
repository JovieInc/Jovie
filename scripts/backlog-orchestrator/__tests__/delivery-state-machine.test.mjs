import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  attestGemService,
  buildDeliveryReceipt,
  DELIVERY_RECEIPT_SCHEMA,
  persistDeliveryOutcome,
  reconcileDeliveryHeartbeat,
  transitionDeliveryReceipt,
} from '../delivery-state-machine.mjs';

const HEAD = 'a'.repeat(40);

describe('delivery state machine', () => {
  it('turns every machine-owned failure into one bounded repair route', () => {
    for (const [failure, action] of [
      ['workflow-cancelled', 'reconcile-cancelled-workflow'],
      ['queue-noop', 'reconcile-exact-head-queue-admission'],
      ['ci-failed', 'create-bounded-ci-repair-pr'],
      ['lease-ambiguous', 'reconcile-exact-head-lease'],
      ['stale-config', 'reload-and-attest-controller-service'],
      ['missing-trigger', 'restore-event-trigger-and-reconcile'],
    ]) {
      const receipt = buildDeliveryReceipt({ delivery_key: failure, failure });
      assert.equal(receipt.schema, DELIVERY_RECEIPT_SCHEMA);
      assert.equal(receipt.stage, 'repair-pending');
      assert.equal(receipt.next.action, action);
      assert.equal(receipt.next.mode, 'automated');
      assert.equal(receipt.externalMutations, 0);
    }
  });

  it('requires exactly one explicit human action for a true external block', () => {
    assert.throws(
      () =>
        buildDeliveryReceipt({
          delivery_key: 'external',
          failure: 'external-blocked',
        }),
      /exactly one external action/
    );
    const receipt = buildDeliveryReceipt({
      delivery_key: 'external',
      failure: 'external-blocked',
      external_action: 'approve the required production permission',
    });
    assert.equal(receipt.stage, 'external-blocked');
    assert.equal(receipt.terminal, true);
    assert.equal(receipt.next.owner, 'human');
  });

  it('makes duplicate delivery idempotent and cannot mint a second repair task', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jovie-delivery-state-'));
    try {
      const receipt = buildDeliveryReceipt({
        delivery_key: 'queue-cancelled-1',
        failure: 'workflow-cancelled',
        pr_number: 16019,
        head_sha: HEAD,
      });
      const [first, duplicate] = await Promise.all([
        persistDeliveryOutcome(receipt, { stateDir: directory }),
        persistDeliveryOutcome(receipt, { stateDir: directory }),
      ]);
      assert.deepEqual(
        new Set([first.status, duplicate.status]),
        new Set(['created', 'duplicate'])
      );
      assert.equal(first.task.taskKey, duplicate.task.taskKey);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('keeps CI/queue races pending until an exact-head event advances them', () => {
    const received = buildDeliveryReceipt({
      delivery_key: 'ci-1',
      pr_number: 16019,
      head_sha: HEAD,
    });
    const pending = transitionDeliveryReceipt(received, {
      stage: 'queue-pending',
      event: 'ci-completed',
    });
    const queued = transitionDeliveryReceipt(pending, {
      stage: 'queued',
      event: 'native-queue-confirmed',
    });
    assert.equal(pending.terminal, false);
    assert.equal(queued.stage, 'queued');
    assert.equal(queued.event.headSha, HEAD);
  });

  it('refuses a production claim without a matching exact deployed SHA', () => {
    const receipt = buildDeliveryReceipt({
      delivery_key: 'deploy-1',
      pr_number: 16019,
      head_sha: HEAD,
    });
    assert.throws(
      () =>
        transitionDeliveryReceipt(receipt, {
          stage: 'production-proven',
          deployedSha: 'b'.repeat(40),
        }),
      /exact deployed SHA/
    );
    const proven = transitionDeliveryReceipt(receipt, {
      stage: 'production-proven',
      deployedSha: HEAD,
    });
    assert.equal(proven.terminal, true);
  });

  it('classifies a failed queue workflow as a queue reconciliation task', () => {
    const receipt = buildDeliveryReceipt({
      workflow_run: {
        id: 99,
        conclusion: 'failure',
        name: 'Merge Queue Auto-Enroll',
      },
    });
    assert.equal(receipt.event.failure, 'queue-noop');
    assert.equal(receipt.next.owner, 'gem');
  });

  it('routes stale Gem service/config evidence to reload plus post-reload attestation', () => {
    const receipt = attestGemService({
      sourceSha: HEAD,
      installedSha: 'b'.repeat(40),
      configSha: 'config-a',
      loadedConfigSha: 'config-b',
      active: true,
      healthy: true,
    });
    assert.equal(receipt.event.failure, 'stale-config');
    assert.equal(receipt.next.owner, 'gem');
  });

  it('writes CI repair work as a formal Gem-to-Symphony task', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jovie-delivery-route-'));
    try {
      const receipt = buildDeliveryReceipt({
        delivery_key: 'ci-failed-1',
        failure: 'ci-failed',
        pr_number: 16019,
        head_sha: HEAD,
      });
      const result = await persistDeliveryOutcome(receipt, {
        stateDir: directory,
      });
      assert.equal(result.task.owner, 'symphony');
      assert.equal(result.task.route, 'gem-to-symphony');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('uses reconciliation only to route a stale/missing heartbeat, never to replay work', () => {
    const receipt = reconcileDeliveryHeartbeat(null, {
      now: '2026-08-15T23:30:00.000Z',
      maxAgeMs: 60_000,
    });
    assert.equal(receipt.event.failure, 'missing-trigger');
    assert.equal(receipt.next.action, 'restore-event-trigger-and-reconcile');
    assert.equal(receipt.externalMutations, 0);
  });
});
