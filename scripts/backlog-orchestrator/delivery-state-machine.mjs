#!/usr/bin/env node

/**
 * The single receipt contract for delivery-control events.
 *
 * This module deliberately creates evidence and bounded repair tasks only. It
 * never changes Linear, a pull request, a merge-queue entry, or a deployment.
 * Those mutations remain owned by their existing guarded controllers.
 */

import { createHash } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export const DELIVERY_RECEIPT_SCHEMA = 'jovie-delivery-receipt/v1';
export const REPAIR_TASK_SCHEMA = 'jovie-symphony-repair-task/v1';
export const DEFAULT_DELIVERY_STATE_DIR = resolve(
  process.env.GEM_WORKSPACE || '/home/timwhite/gem-workspace',
  'state/jovie-delivery-controller'
);

const AUTOMATED_FAILURES = Object.freeze({
  'workflow-cancelled': {
    owner: 'gem',
    action: 'reconcile-cancelled-workflow',
  },
  'queue-noop': {
    owner: 'gem',
    action: 'reconcile-exact-head-queue-admission',
  },
  'ci-failed': {
    owner: 'symphony',
    action: 'create-bounded-ci-repair-pr',
  },
  'lease-ambiguous': {
    owner: 'symphony',
    action: 'reconcile-exact-head-lease',
  },
  'stale-config': {
    owner: 'gem',
    action: 'reload-and-attest-controller-service',
  },
  'missing-trigger': {
    owner: 'gem',
    action: 'restore-event-trigger-and-reconcile',
  },
});

const STAGES = new Set([
  'received',
  'classified',
  'held',
  'leased',
  'draft-pr',
  'ci-pending',
  'queue-pending',
  'queued',
  'merged',
  'deployment-pending',
  'production-proven',
  'repair-pending',
  'external-blocked',
]);

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function exactSha(value) {
  const normalized = nonEmpty(value)?.toLowerCase();
  return normalized && /^[0-9a-f]{40}$/.test(normalized) ? normalized : null;
}

function exactPositiveInteger(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function failureRoute(failure, externalAction) {
  if (failure === 'external-blocked') {
    const action = nonEmpty(externalAction);
    if (!action) {
      throw new Error('external-blocked requires exactly one external action');
    }
    return { owner: 'human', action, mode: 'external' };
  }
  const route = AUTOMATED_FAILURES[failure];
  if (!route) throw new Error(`unsupported delivery failure: ${failure}`);
  return { ...route, mode: 'automated' };
}

/**
 * Build a stable input from a native controller event. Inputs are intentionally
 * narrow: a receipt is invalid without a delivery key and an exact source head
 * when the event claims to concern a PR.
 */
export function normalizeDeliveryEvent(raw = {}) {
  const payload = raw.client_payload || raw.payload || raw;
  const workflow = raw.workflow_run || payload.workflow_run || {};
  const failure =
    nonEmpty(payload.failure) ||
    (workflow.conclusion === 'cancelled'
      ? 'workflow-cancelled'
      : workflow.conclusion === 'failure'
        ? 'queue-noop'
        : null);
  const pr = exactPositiveInteger(payload.pr_number ?? payload.pr);
  const headSha = exactSha(
    payload.head_sha ?? payload.head ?? workflow.head_sha
  );
  const deliveryKey =
    nonEmpty(payload.delivery_key) ||
    nonEmpty(payload.event_id) ||
    nonEmpty(raw.delivery_id) ||
    nonEmpty(workflow.id && String(workflow.id)) ||
    digest({
      workflow: nonEmpty(workflow.name),
      status: nonEmpty(workflow.status),
      conclusion: nonEmpty(workflow.conclusion),
      pr,
      headSha,
      failure,
    });

  if (pr && !headSha) {
    throw new Error(
      'PR-scoped delivery event requires an exact 40-character head SHA'
    );
  }
  return {
    deliveryKey,
    source: nonEmpty(payload.source) || (workflow.id ? 'github' : 'linear'),
    event: nonEmpty(payload.event) || nonEmpty(raw.action) || 'changed',
    issue: nonEmpty(payload.issue_identifier) || nonEmpty(payload.issue),
    pr,
    headSha,
    failure,
    externalAction: nonEmpty(payload.external_action),
    evidence:
      payload.evidence && typeof payload.evidence === 'object'
        ? payload.evidence
        : {},
  };
}

/** A failure may never resolve to passive waiting. */
export function buildDeliveryReceipt(
  input,
  { now = new Date().toISOString() } = {}
) {
  const event = normalizeDeliveryEvent(input);
  const failure = event.failure;
  const route = failure ? failureRoute(failure, event.externalAction) : null;
  const stage = failure
    ? route.mode === 'external'
      ? 'external-blocked'
      : 'repair-pending'
    : 'received';
  return {
    schema: DELIVERY_RECEIPT_SCHEMA,
    receiptKey: digest({ deliveryKey: event.deliveryKey, failure, stage }),
    observedAt: now,
    stage,
    terminal: stage === 'external-blocked',
    event,
    next: route || {
      owner: 'controller',
      action: 'classify',
      mode: 'automated',
    },
    externalMutations: 0,
  };
}

/**
 * State transitions are receipt-only. The caller must receive a classified
 * receipt before invoking a separate gate capable of any external mutation.
 */
export function transitionDeliveryReceipt(
  receipt,
  transition,
  { now = new Date().toISOString() } = {}
) {
  if (!receipt || receipt.schema !== DELIVERY_RECEIPT_SCHEMA) {
    throw new Error('delivery receipt is missing or malformed');
  }
  if (!STAGES.has(transition?.stage)) {
    throw new Error(`unsupported delivery stage: ${transition?.stage}`);
  }
  if (receipt.terminal)
    throw new Error('terminal delivery receipt cannot transition');
  const next = transition.failure
    ? failureRoute(transition.failure, transition.externalAction)
    : transition.next || receipt.next;
  const stage = transition.failure
    ? next.mode === 'external'
      ? 'external-blocked'
      : 'repair-pending'
    : transition.stage;
  const prBoundStages = new Set([
    'draft-pr',
    'ci-pending',
    'queue-pending',
    'queued',
    'merged',
    'deployment-pending',
    'production-proven',
  ]);
  if (
    prBoundStages.has(stage) &&
    (!receipt.event.pr || !receipt.event.headSha)
  ) {
    throw new Error(`${stage} requires a PR number and exact source head SHA`);
  }
  if (stage === 'production-proven') {
    const deployedSha = exactSha(transition.deployedSha);
    if (!deployedSha || deployedSha !== receipt.event.headSha) {
      throw new Error(
        'production-proven requires an exact deployed SHA matching the source head'
      );
    }
  }
  return {
    ...receipt,
    observedAt: now,
    stage,
    terminal: stage === 'external-blocked' || stage === 'production-proven',
    previousReceiptKey: receipt.receiptKey,
    receiptKey: digest({
      receiptKey: receipt.receiptKey,
      stage,
      failure: transition.failure || null,
    }),
    next,
    transition: {
      event: nonEmpty(transition.event) || 'state-transition',
      failure: transition.failure || null,
      deployedSha: exactSha(transition.deployedSha),
    },
  };
}

export function receiptPath(stateDir, receipt) {
  return join(stateDir, 'receipts', `${receipt.receiptKey}.json`);
}

export function repairTaskForReceipt(receipt) {
  if (receipt.stage !== 'repair-pending' || receipt.next.mode !== 'automated')
    return null;
  return {
    schema: REPAIR_TASK_SCHEMA,
    taskKey: digest({ receiptKey: receipt.receiptKey, route: receipt.next }),
    createdAt: receipt.observedAt,
    receiptKey: receipt.receiptKey,
    owner: receipt.next.owner,
    route: receipt.next.owner === 'symphony' ? 'gem-to-symphony' : 'gem-local',
    action: receipt.next.action,
    issue: receipt.event.issue,
    pr: receipt.event.pr,
    headSha: receipt.event.headSha,
    failure: receipt.event.failure,
    safety: 'normal-pr-ci-review-native-queue-deploy-gates-remain-required',
  };
}

async function atomicPersist(destination, value) {
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  try {
    const handle = await open(destination, 'wx', 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(value)}\n`, 'utf8');
    } finally {
      await handle.close();
    }
    return { status: 'created', path: destination, value };
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    return {
      status: 'duplicate',
      path: destination,
      value: JSON.parse(await readFile(destination, 'utf8')),
    };
  }
}

/** Persist a receipt and, when appropriate, a formal Gem-to-Symphony task. */
export async function persistDeliveryOutcome(
  receipt,
  { stateDir = DEFAULT_DELIVERY_STATE_DIR, dryRun = false } = {}
) {
  const receiptDestination = receiptPath(stateDir, receipt);
  const task = repairTaskForReceipt(receipt);
  const taskDestination = task
    ? join(stateDir, 'repair-tasks', `${task.taskKey}.json`)
    : null;
  if (dryRun) {
    return {
      status: 'dry-run',
      receipt,
      receiptPath: receiptDestination,
      task,
      taskPath: taskDestination,
    };
  }
  const persistedReceipt = await atomicPersist(receiptDestination, receipt);
  const persistedTask = task
    ? await atomicPersist(taskDestination, task)
    : null;
  return {
    status: persistedReceipt.status,
    receipt: persistedReceipt.value,
    receiptPath: receiptDestination,
    task: persistedTask?.value || null,
    taskPath: taskDestination,
  };
}

/** Attestation is evidence only; mismatch is routed through the same repair contract. */
export function attestGemService(
  { sourceSha, installedSha, configSha, loadedConfigSha, active, healthy },
  options = {}
) {
  const mismatch =
    !exactSha(sourceSha) ||
    sourceSha !== installedSha ||
    !nonEmpty(configSha) ||
    configSha !== loadedConfigSha ||
    active !== true ||
    healthy !== true;
  return buildDeliveryReceipt(
    mismatch
      ? {
          delivery_key: `gem-service:${sourceSha || 'unknown'}:${installedSha || 'unknown'}:${loadedConfigSha || 'unknown'}`,
          source: 'gem',
          event: 'service-attestation',
          failure: 'stale-config',
          evidence: {
            sourceSha,
            installedSha,
            configSha,
            loadedConfigSha,
            active,
            healthy,
          },
        }
      : {
          delivery_key: `gem-service:${sourceSha}:${configSha}`,
          source: 'gem',
          event: 'service-attestation',
          evidence: {
            sourceSha,
            installedSha,
            configSha,
            loadedConfigSha,
            active,
            healthy,
          },
        },
    options
  );
}

/**
 * The slow backstop only notices a missing/stale heartbeat. It does not replay
 * issue events or queue mutations; a stale controller becomes one idempotent
 * repair task for the current reconciliation window.
 */
export function reconcileDeliveryHeartbeat(
  heartbeat,
  { now = new Date().toISOString(), maxAgeMs = 15 * 60 * 1000 } = {}
) {
  const observedAt = nonEmpty(heartbeat?.observedAt);
  const ageMs = observedAt
    ? Date.parse(now) - Date.parse(observedAt)
    : Number.POSITIVE_INFINITY;
  const stale = !Number.isFinite(ageMs) || ageMs > maxAgeMs;
  const window = Math.floor(Date.parse(now) / maxAgeMs);
  return buildDeliveryReceipt(
    stale
      ? {
          delivery_key: `heartbeat-reconcile:${window}`,
          source: 'gem',
          event: 'reconciliation',
          failure: 'missing-trigger',
          evidence: {
            observedAt,
            ageMs: Number.isFinite(ageMs) ? ageMs : null,
            maxAgeMs,
          },
        }
      : {
          delivery_key: `heartbeat-reconcile:${window}`,
          source: 'gem',
          event: 'reconciliation',
          evidence: { observedAt, ageMs, maxAgeMs },
        },
    { now }
  );
}

async function main() {
  const eventFile = process.argv
    .find(arg => arg.startsWith('--event-file='))
    ?.slice('--event-file='.length);
  const stateDir =
    process.argv
      .find(arg => arg.startsWith('--state-dir='))
      ?.slice('--state-dir='.length) || DEFAULT_DELIVERY_STATE_DIR;
  const heartbeatFile = process.argv
    .find(arg => arg.startsWith('--heartbeat-file='))
    ?.slice('--heartbeat-file='.length);
  const reconcile = process.argv.includes('--reconcile');
  if (!eventFile && !reconcile)
    throw new Error(
      'usage: delivery-state-machine.mjs --event-file=<path> [--state-dir=<path>] [--dry-run]'
    );
  let heartbeat = null;
  if (reconcile && heartbeatFile) {
    try {
      heartbeat = JSON.parse(await readFile(heartbeatFile, 'utf8'));
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  const receipt = reconcile
    ? reconcileDeliveryHeartbeat(heartbeat)
    : buildDeliveryReceipt(JSON.parse(await readFile(eventFile, 'utf8')));
  process.stdout.write(
    `${JSON.stringify(await persistDeliveryOutcome(receipt, { stateDir, dryRun: process.argv.includes('--dry-run') }))}\n`
  );
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch(error => {
    process.stderr.write(`delivery-state-machine: ${error.message}\n`);
    process.exitCode = 1;
  });
}
