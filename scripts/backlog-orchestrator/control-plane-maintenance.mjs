#!/usr/bin/env node

/**
 * Read-only maintenance contract for the Gem-owned delivery control plane.
 *
 * The evaluator receives attested observations and emits one durable,
 * idempotent maintenance receipt. It deliberately does not reload a service,
 * remove a worktree, replay a provider event, or change any delivery gate.
 * An executor may act only on the bounded next action recorded here and must
 * subsequently emit a new observation proving its postcondition.
 */

import { createHash } from 'node:crypto';

import { buildDeliveryReceipt } from './delivery-state-machine.mjs';

export const CONTROL_PLANE_MAINTENANCE_SCHEMA =
  'jovie-control-plane-maintenance/v1';
export const CONTROL_PLANE_SUMMARY_SCHEMA = 'jovie-control-plane-summary/v1';
export const DEFAULT_LIVENESS_SLO_MS = 5 * 60 * 1000;
export const DEFAULT_MAX_DELIVERY_ATTEMPTS = 3;

const AUTOMATED_ACTIONS = Object.freeze({
  'stale-config': 'reload-from-attested-source-then-postcheck',
  'missing-trigger': 'restore-trigger-then-reconcile-missed-events',
  'restart-failed': 'rollback-last-attested-service-then-open-repair-task',
  'lease-ambiguous': 'reconcile-lease-and-audit-safe-cleanup-candidates',
  'toolchain-degraded': 'degrade-to-safe-mode-and-open-toolchain-repair-task',
  'capacity-saturated': 'apply-backpressure-and-recalculate-lane-capacity',
  'delivery-dead-letter': 'route-poison-event-to-bounded-repair-task',
});

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function exactSha(value) {
  const normalized = text(value)?.toLowerCase();
  return normalized && /^[0-9a-f]{40}$/.test(normalized) ? normalized : null;
}

function observationAgeMs(observedAt, now) {
  const timestamp = text(observedAt);
  const parsed = timestamp ? Date.parse(timestamp) : Number.NaN;
  return Number.isFinite(parsed) ? Math.max(0, Date.parse(now) - parsed) : null;
}

function liveness(name, observation, now, maxAgeMs) {
  const value = asRecord(observation);
  const ageMs = observationAgeMs(value.observedAt, now);
  const healthy = value.healthy === true && ageMs !== null && ageMs <= maxAgeMs;
  return {
    name,
    healthy,
    observedAt: text(value.observedAt),
    ageMs,
    maxAgeMs,
    reason: healthy
      ? 'fresh'
      : value.healthy !== true
        ? 'reported-unhealthy'
        : ageMs === null
          ? 'missing-or-invalid-observation'
          : 'stale-observation',
  };
}

function findFailure(input, now, maxAgeMs) {
  const source = asRecord(input.source);
  const runtime = asRecord(input.runtime);
  const liveness = asRecord(input.liveness);
  const toolchain = asRecord(input.toolchain);
  const resources = asRecord(input.resources);
  const delivery = asRecord(input.delivery);
  const leases = asRecord(input.leases);

  if (
    !exactSha(source.sourceSha) ||
    source.sourceSha !== source.installedSha ||
    !text(source.configSha) ||
    source.configSha !== source.loadedConfigSha
  ) {
    return {
      failure: 'stale-config',
      reason: 'source-or-loaded-config-attestation-mismatch',
    };
  }
  if (runtime.restartAttempted === true && runtime.postcheckHealthy !== true) {
    return {
      failure: 'restart-failed',
      reason: 'bounded-restart-postcheck-failed',
    };
  }
  for (const name of ['scheduler', 'eventReceiver', 'heartbeat']) {
    const check = livenessCheck(name, liveness[name], now, maxAgeMs);
    if (!check.healthy) {
      return { failure: 'missing-trigger', reason: `${name}:${check.reason}` };
    }
  }
  if (toolchain.ready !== true) {
    return {
      failure: 'toolchain-degraded',
      reason: 'dependency-or-toolchain-preflight-failed',
    };
  }
  if (resources.saturated === true || resources.creditsAvailable === false) {
    return {
      failure: 'capacity-saturated',
      reason: 'resource-or-credit-saturation',
    };
  }
  if (
    leases.ambiguous === true ||
    leases.staleCount > 0 ||
    leases.worktreeAuditRequired === true
  ) {
    return {
      failure: 'lease-ambiguous',
      reason: 'stale-or-ambiguous-lease-worktree-audit-required',
    };
  }
  const attempts = finite(delivery.attempts) ?? 0;
  const maxAttempts =
    finite(delivery.maxAttempts) ?? DEFAULT_MAX_DELIVERY_ATTEMPTS;
  if (delivery.poison === true || attempts >= maxAttempts) {
    return {
      failure: 'delivery-dead-letter',
      reason: 'bounded-delivery-replay-exhausted',
    };
  }
  return null;
}

function livenessCheck(name, observation, now, maxAgeMs) {
  return liveness(name, observation, now, maxAgeMs);
}

function buildLiveness(input, now, maxAgeMs) {
  const livenessInput = asRecord(input.liveness);
  return ['scheduler', 'eventReceiver', 'heartbeat'].map(name =>
    livenessCheck(name, livenessInput[name], now, maxAgeMs)
  );
}

/**
 * Return an evidence-only receipt. `next` is always a bounded machine action
 * unless callers explicitly declare one verified external action.
 */
export function evaluateControlPlaneMaintenance(input = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_LIVENESS_SLO_MS;
  const normalized = asRecord(input);
  const failure = findFailure(normalized, now, maxAgeMs);
  const delivery = asRecord(normalized.delivery);
  const deliveryKey =
    text(delivery.id) ||
    digest({
      source: normalized.source,
      runtime: normalized.runtime,
      liveness: normalized.liveness,
      toolchain: normalized.toolchain,
      resources: normalized.resources,
      leases: normalized.leases,
      delivery,
    });
  const maintenanceReceipt = buildDeliveryReceipt(
    failure
      ? {
          delivery_key: `maintenance:${deliveryKey}:${failure.failure}`,
          source: 'gem',
          event: 'maintenance-evaluation',
          failure: failure.failure,
          evidence: { reason: failure.reason },
        }
      : {
          delivery_key: `maintenance:${deliveryKey}:healthy`,
          source: 'gem',
          event: 'maintenance-evaluation',
        },
    { now }
  );
  const checks = buildLiveness(normalized, now, maxAgeMs);
  const resources = asRecord(normalized.resources);
  const leases = asRecord(normalized.leases);
  return {
    schema: CONTROL_PLANE_MAINTENANCE_SCHEMA,
    receiptKey: digest({
      maintenanceReceipt: maintenanceReceipt.receiptKey,
      checks,
    }),
    observedAt: now,
    status: failure ? 'repair-pending' : 'healthy',
    maintenanceReceipt,
    checks: {
      sourceAttested:
        exactSha(normalized.source?.sourceSha) ===
          normalized.source?.installedSha &&
        text(normalized.source?.configSha) ===
          normalized.source?.loadedConfigSha,
      liveness: checks,
      toolchainReady: normalized.toolchain?.ready === true,
      resources: {
        saturated: resources.saturated === true,
        creditsAvailable: resources.creditsAvailable !== false,
        constraint: text(resources.constraint) || null,
      },
      cleanup: {
        staleLeaseCount: finite(leases.staleCount) ?? 0,
        worktreeAuditRequired: leases.worktreeAuditRequired === true,
        mutationAuthority: 'audit-only-no-destructive-cleanup',
      },
    },
    next: failure
      ? {
          owner: maintenanceReceipt.next.owner,
          action: AUTOMATED_ACTIONS[failure.failure],
          mode: 'automated',
          requiresPostcheck: true,
        }
      : {
          owner: 'gem',
          action: 'continue-observing',
          mode: 'automated',
          requiresPostcheck: false,
        },
    externalMutations: 0,
  };
}

/** Small truthful operator surface. Human action appears only at a real external block. */
export function summarizeControlPlane(receipts = []) {
  const normalized = receipts.filter(
    receipt => receipt?.schema === CONTROL_PLANE_MAINTENANCE_SCHEMA
  );
  const latest = normalized.at(-1) || null;
  const external = normalized.filter(
    receipt => receipt.maintenanceReceipt?.stage === 'external-blocked'
  );
  return {
    schema: CONTROL_PLANE_SUMMARY_SCHEMA,
    observedAt: latest?.observedAt || null,
    status: latest?.status || 'unknown',
    activeRepair: latest?.status === 'repair-pending' ? latest.next : null,
    saturation: latest?.checks?.resources ?? null,
    staleCleanup: latest?.checks?.cleanup ?? null,
    humanAction: external.length
      ? external.at(-1).maintenanceReceipt.next.action
      : null,
    externalMutations: 0,
  };
}
