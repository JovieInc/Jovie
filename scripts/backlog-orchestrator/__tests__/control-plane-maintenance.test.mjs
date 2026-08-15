import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CONTROL_PLANE_MAINTENANCE_SCHEMA,
  evaluateControlPlaneMaintenance,
  summarizeControlPlane,
} from '../control-plane-maintenance.mjs';

const HEAD = 'a'.repeat(40);
const NOW = '2026-08-15T23:30:00.000Z';

function healthyInput() {
  return {
    source: {
      sourceSha: HEAD,
      installedSha: HEAD,
      configSha: 'source-config',
      loadedConfigSha: 'source-config',
    },
    runtime: { restartAttempted: false, postcheckHealthy: true },
    liveness: {
      scheduler: { healthy: true, observedAt: NOW },
      eventReceiver: { healthy: true, observedAt: NOW },
      heartbeat: { healthy: true, observedAt: NOW },
    },
    toolchain: { ready: true },
    resources: { saturated: false, creditsAvailable: true },
    leases: { staleCount: 0, ambiguous: false, worktreeAuditRequired: false },
    delivery: { id: 'delivery-1', attempts: 0, maxAttempts: 3 },
  };
}

function evaluate(input) {
  return evaluateControlPlaneMaintenance(input, { now: NOW });
}

describe('Gem control-plane maintenance', () => {
  it('emits a healthy receipt only with attested config, fresh liveness, and a ready toolchain', () => {
    const receipt = evaluate(healthyInput());
    assert.equal(receipt.schema, CONTROL_PLANE_MAINTENANCE_SCHEMA);
    assert.equal(receipt.status, 'healthy');
    assert.equal(receipt.externalMutations, 0);
    assert.equal(receipt.next.action, 'continue-observing');
  });

  it('turns config drift into an attested reload and postcheck repair route', () => {
    const input = healthyInput();
    input.source.loadedConfigSha = 'stale-config';
    const receipt = evaluate(input);
    assert.equal(receipt.maintenanceReceipt.event.failure, 'stale-config');
    assert.equal(
      receipt.next.action,
      'reload-from-attested-source-then-postcheck'
    );
  });

  it('turns a dead scheduler and a missed event receiver heartbeat into trigger recovery', () => {
    for (const name of ['scheduler', 'eventReceiver']) {
      const input = healthyInput();
      input.liveness[name].healthy = false;
      const receipt = evaluate(input);
      assert.equal(receipt.maintenanceReceipt.event.failure, 'missing-trigger');
      assert.match(
        receipt.maintenanceReceipt.event.evidence.reason,
        new RegExp(`^${name}:`)
      );
      assert.equal(
        receipt.next.action,
        'restore-trigger-then-reconcile-missed-events'
      );
    }
  });

  it('treats a failed bounded restart as rollback plus a repair task, not passive waiting', () => {
    const input = healthyInput();
    input.runtime = { restartAttempted: true, postcheckHealthy: false };
    const receipt = evaluate(input);
    assert.equal(receipt.maintenanceReceipt.event.failure, 'restart-failed');
    assert.equal(
      receipt.next.action,
      'rollback-last-attested-service-then-open-repair-task'
    );
  });

  it('audits stale leases and worktrees without granting destructive cleanup authority', () => {
    const input = healthyInput();
    input.leases = {
      staleCount: 1,
      ambiguous: false,
      worktreeAuditRequired: true,
    };
    const receipt = evaluate(input);
    assert.equal(receipt.maintenanceReceipt.event.failure, 'lease-ambiguous');
    assert.equal(
      receipt.checks.cleanup.mutationAuthority,
      'audit-only-no-destructive-cleanup'
    );
    assert.equal(
      receipt.next.action,
      'reconcile-lease-and-audit-safe-cleanup-candidates'
    );
  });

  it('degrades safely for toolchain and capacity pressure without changing a promotion gate', () => {
    const toolchain = healthyInput();
    toolchain.toolchain.ready = false;
    assert.equal(
      evaluate(toolchain).maintenanceReceipt.event.failure,
      'toolchain-degraded'
    );

    const capacity = healthyInput();
    capacity.resources = {
      saturated: true,
      creditsAvailable: true,
      constraint: 'ci-capacity',
    };
    const receipt = evaluate(capacity);
    assert.equal(
      receipt.maintenanceReceipt.event.failure,
      'capacity-saturated'
    );
    assert.equal(
      receipt.next.action,
      'apply-backpressure-and-recalculate-lane-capacity'
    );
  });

  it('sends poison delivery only to a bounded dead-letter repair task', () => {
    const input = healthyInput();
    input.delivery = { id: 'poison-1', attempts: 3, maxAttempts: 3 };
    const receipt = evaluate(input);
    assert.equal(
      receipt.maintenanceReceipt.event.failure,
      'delivery-dead-letter'
    );
    assert.equal(receipt.maintenanceReceipt.next.owner, 'symphony');
    assert.equal(receipt.externalMutations, 0);
  });

  it('keeps the operator summary truthful and does not surface a human action for machine repair', () => {
    const summary = summarizeControlPlane([evaluate(healthyInput())]);
    assert.equal(summary.status, 'healthy');
    assert.equal(summary.humanAction, null);
    assert.equal(summary.externalMutations, 0);
  });
});
