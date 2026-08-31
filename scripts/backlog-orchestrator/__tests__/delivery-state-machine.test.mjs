import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  attestGemService,
  buildDeliveryReceipt,
  DELIVERY_RECEIPT_SCHEMA,
  persistClosureHealthActions,
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
      ['ci-failed-after-handoff', 'repair-current-pr-exact-head'],
      ['fx-auth-missing', 'restore-fx-adapter-authentication'],
      ['lease-ambiguous', 'reconcile-exact-head-lease'],
      ['stale-config', 'reload-and-attest-controller-service'],
      ['missing-trigger', 'restore-event-trigger-and-reconcile'],
      ['size-guard', 'split-source-aligned-size-guard'],
      ['missing-failing-checks', 'create-bounded-ci-repair-pr'],
      ['stale-conflicted-head', 'exact-head-branch-update'],
      ['queue-eviction', 'reconcile-exact-head-queue-admission'],
      ['provider-unavailable', 'restore-provider-availability'],
      ['missing-owner-lease', 'reconcile-exact-head-lease'],
      ['dropped-controller-event', 'restore-event-trigger-and-reconcile'],
      ['draft-stack-policy', 'split-or-retarget-draft-stack'],
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

  it('classifies a suppressed product PR queue failure dispatch as exact-head queue repair', () => {
    const receipt = buildDeliveryReceipt({
      action: 'delivery-control-failure',
      client_payload: {
        source: 'merge-queue-autoenroll',
        event: 'suppressed-product-pr-check-failure',
        failure: 'queue-noop',
        delivery_key: `merge-queue-autoenroll:99:1:16376:${HEAD}:3`,
        pr_number: 16376,
        head_sha: HEAD,
        evidence: {
          workflow: 'Merge Queue Auto-Enroll',
          exit_code: '3',
        },
      },
    });

    assert.equal(receipt.event.failure, 'queue-noop');
    assert.equal(receipt.event.pr, 16376);
    assert.equal(receipt.event.headSha, HEAD);
    assert.equal(receipt.next.action, 'reconcile-exact-head-queue-admission');
  });

  it('classifies a suppressed non-queue product PR drain failure as a dropped controller event', () => {
    const receipt = buildDeliveryReceipt({
      action: 'delivery-control-failure',
      client_payload: {
        source: 'merge-queue-autoenroll',
        event: 'suppressed-product-pr-check-failure',
        failure: 'dropped-controller-event',
        delivery_key: `merge-queue-autoenroll:99:1:16376:${HEAD}:1`,
        pr_number: 16376,
        head_sha: HEAD,
        evidence: {
          workflow: 'Merge Queue Auto-Enroll',
          exit_code: '1',
        },
      },
    });

    assert.equal(receipt.event.failure, 'dropped-controller-event');
    assert.equal(receipt.event.pr, 16376);
    assert.equal(receipt.event.headSha, HEAD);
    assert.equal(receipt.next.action, 'restore-event-trigger-and-reconcile');
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

  it('consumes one bounded stack repair action per root idempotently and refuses a stack action without exact root-head evidence', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jovie-stack-repair-'));
    try {
      const action = {
        schema: 'jovie-stack-health-action/v1',
        taskKey: 'b'.repeat(64),
        deliveryKey: 'closure-stack:test-root',
        action: 'split-or-retarget-draft-stack',
        owner: 'symphony',
        writer: 'symphony',
        issue: 'JOV-5362',
        rootPr: 16510,
        rootHeadSha: HEAD,
        prNumbers: [16510, 16511],
        maxDepth: 5,
        promotionPath: [
          { pr: 16510, base: 'main', head: 'stack/root' },
          { pr: 16511, base: 'stack/root', head: 'stack/child' },
        ],
        integrator: null,
        deadline: null,
        violations: ['stack-depth-over-4', 'missing-stack-integrator'],
        safety: 'receipt-only; requalify exact heads before split-or-retarget',
      };
      const source = {
        schema: 'jovie-closure-health/v1',
        observedAt: '2026-08-28T22:00:00.000Z',
        repairActions: [action],
      };
      const first = await persistClosureHealthActions(source, {
        stateDir: directory,
      });
      const duplicate = await persistClosureHealthActions(source, {
        stateDir: directory,
      });
      assert.equal(first.status, 'created');
      assert.equal(duplicate.status, 'duplicate');
      assert.equal(
        first.actions[0].task.action,
        'split-or-retarget-draft-stack'
      );
      const task = JSON.parse(
        await readFile(first.actions[0].taskPath, 'utf8')
      );
      assert.deepEqual(task.evidence.prNumbers, [16510, 16511]);
      assert.equal(task.evidence.rootHeadSha, HEAD);
      await assert.rejects(
        persistClosureHealthActions(
          { ...source, repairActions: [{ ...action, rootHeadSha: null }] },
          { stateDir: directory }
        ),
        /exact root PR head SHA/
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('writes handed-off repair work as one exact-head Gem-to-FX task', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jovie-delivery-fx-'));
    try {
      const receipt = buildDeliveryReceipt({
        delivery_key: 'ci-fx-1',
        failure: 'ci-failed-after-handoff',
        pr_number: 16019,
        head_sha: HEAD,
      });
      const result = await persistDeliveryOutcome(receipt, {
        stateDir: directory,
      });
      assert.equal(result.task.owner, 'fx');
      assert.equal(result.task.route, 'gem-to-fx');
      assert.equal(result.task.headSha, HEAD);
      assert.equal(result.task.action, 'repair-current-pr-exact-head');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('keeps missing FX auth as a Gem-local configuration incident', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jovie-delivery-fx-auth-'));
    try {
      const receipt = buildDeliveryReceipt({
        delivery_key: 'fx-auth-1',
        failure: 'fx-auth-missing',
        pr_number: 16019,
        head_sha: HEAD,
      });
      const result = await persistDeliveryOutcome(receipt, {
        stateDir: directory,
      });
      assert.equal(result.task.owner, 'gem');
      assert.equal(result.task.route, 'gem-local');
      assert.equal(result.task.action, 'restore-fx-adapter-authentication');
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

  it('keeps not-proven and unbound production as evidence, never a repair claim', () => {
    const missing = buildDeliveryReceipt({
      delivery_key: 'not-proven-1',
      failure: 'not-proven',
    });
    assert.equal(missing.stage, 'evidence-pending');
    assert.equal(missing.next.action, 'collect-missing-evidence');
    const unbound = buildDeliveryReceipt({
      delivery_key: 'prod-unbound-1',
      failure: 'production-deployment-unbound',
    });
    assert.equal(unbound.stage, 'evidence-pending');
    assert.equal(unbound.next.mode, 'evidence');
  });

  it('classifies CI and size-guard workflow failures without treating them as queue-noop', async () => {
    const ci = buildDeliveryReceipt({
      workflow_run: { id: 7, conclusion: 'failure', name: 'CI' },
    });
    assert.equal(ci.event.failure, 'missing-failing-checks');
    const size = buildDeliveryReceipt({
      workflow_run: { id: 8, conclusion: 'failure', name: 'PR Size Guard' },
    });
    assert.equal(size.next.action, 'split-source-aligned-size-guard');
    const directory = await mkdtemp(join(tmpdir(), 'jovie-delivery-red-'));
    try {
      const result = await persistDeliveryOutcome(
        buildDeliveryReceipt({
          delivery_key: 'ci-failed-loop',
          failure: 'ci-failed',
          issue: 'JOV-5390',
          pr_number: 16019,
          head_sha: HEAD,
        }),
        { stateDir: directory }
      );
      assert.equal(result.loop.stallClass, 'missing-failing-checks');
      assert.equal(result.queue.items[0].issue, 'JOV-5390');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
