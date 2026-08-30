#!/usr/bin/env node

/**
 * The single receipt contract for delivery-control events.
 *
 * JOV-INV-017: every unhealthy or not-proven signal also enters Summer's
 * No Unattended Red loop. This module deliberately creates evidence and
 * bounded repair tasks only. It never changes Linear, a pull request, a
 * merge-queue entry, or a deployment. Those mutations remain owned by their
 * existing guarded controllers.
 */

import { createHash } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  FX_BACKSTOP_FAILURES,
  fxBackstopRoute,
} from '../lib/rolling-ci-handoff.mjs';
import {
  classifyAndOpenFromDelivery,
  DELIVERY_WORKFLOW_FAILURES,
  persistLoopOutcome,
  STALL_AUTOMATED_FAILURES,
  STALL_EVIDENCE_FAILURES,
} from './no-unattended-red.mjs';

export const DELIVERY_RECEIPT_SCHEMA = 'jovie-delivery-receipt/v1';
export const REPAIR_TASK_SCHEMA = 'jovie-symphony-repair-task/v1';
export const STACK_HEALTH_ACTION_SCHEMA = 'jovie-stack-health-action/v1';
export const STACK_REPAIR_ACTION = 'split-or-retarget-draft-stack'; // JOV-INV-020
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
  ...FX_BACKSTOP_FAILURES,
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
  'draft-stack-policy': {
    owner: 'symphony',
    action: STACK_REPAIR_ACTION,
  },
  ...STALL_AUTOMATED_FAILURES,
});

const EVIDENCE_FAILURES = STALL_EVIDENCE_FAILURES;

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
  'evidence-pending',
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

function boundedStackHealthAction(action) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    throw new Error('stack health repair action must be an object');
  }
  if (action.schema !== STACK_HEALTH_ACTION_SCHEMA) {
    throw new Error('stack health repair action schema is invalid');
  }
  if (action.action !== STACK_REPAIR_ACTION) {
    throw new Error('stack health repair action is unsupported');
  }
  const taskKey = nonEmpty(action.taskKey);
  if (!taskKey || !/^[0-9a-f]{64}$/i.test(taskKey)) {
    throw new Error('stack health repair action requires a SHA-256 task key');
  }
  const deliveryKey = nonEmpty(action.deliveryKey);
  if (!deliveryKey || deliveryKey.length > 160) {
    throw new Error(
      'stack health repair action requires a bounded delivery key'
    );
  }
  if (action.owner !== 'symphony' || action.writer !== 'symphony') {
    throw new Error('stack health repair action must remain Symphony-owned');
  }
  const rootPr = exactPositiveInteger(action.rootPr);
  const rootHeadSha = exactSha(action.rootHeadSha);
  if (!rootPr || !rootHeadSha) {
    throw new Error(
      'stack health repair action requires an exact root PR head SHA'
    );
  }
  if (
    !Array.isArray(action.prNumbers) ||
    action.prNumbers.length === 0 ||
    action.prNumbers.length > 100
  ) {
    throw new Error(
      'stack health repair action PR members are malformed or unbounded'
    );
  }
  const prNumbers = action.prNumbers.map(exactPositiveInteger);
  if (
    prNumbers.some(value => !value) ||
    new Set(prNumbers).size !== prNumbers.length ||
    !prNumbers.includes(rootPr)
  ) {
    throw new Error('stack health repair action PR members are invalid');
  }
  const maxDepth = exactPositiveInteger(action.maxDepth);
  if (!maxDepth || maxDepth > 100) {
    throw new Error('stack health repair action max depth is invalid');
  }
  if (
    !Array.isArray(action.promotionPath) ||
    action.promotionPath.length === 0 ||
    action.promotionPath.length > 100
  ) {
    throw new Error(
      'stack health repair action promotion path is malformed or unbounded'
    );
  }
  const promotionPath = action.promotionPath.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(
        `stack health repair action promotion path ${index} is invalid`
      );
    }
    const pr = exactPositiveInteger(entry.pr);
    const base = nonEmpty(entry.base);
    const head = nonEmpty(entry.head);
    if (!pr || !base || !head || base.length > 255 || head.length > 255) {
      throw new Error(
        `stack health repair action promotion path ${index} is invalid`
      );
    }
    return { pr, base, head };
  });
  if (!promotionPath.some(entry => entry.pr === rootPr)) {
    throw new Error('stack health repair action promotion path omits root PR');
  }
  if (
    !Array.isArray(action.violations) ||
    action.violations.length === 0 ||
    action.violations.length > 32 ||
    action.violations.some(value => !nonEmpty(value) || value.length > 96)
  ) {
    throw new Error(
      'stack health repair action violations are malformed or unbounded'
    );
  }
  const issue = action.issue == null ? null : nonEmpty(action.issue);
  if (action.issue != null && (!issue || issue.length > 80)) {
    throw new Error('stack health repair action issue is malformed');
  }
  const integrator =
    action.integrator == null ? null : nonEmpty(action.integrator);
  const deadline = action.deadline == null ? null : nonEmpty(action.deadline);
  if (action.integrator != null && (!integrator || integrator.length > 80)) {
    throw new Error('stack health repair action integrator is malformed');
  }
  if (action.deadline != null && (!deadline || deadline.length > 80)) {
    throw new Error('stack health repair action deadline is malformed');
  }
  const safety = nonEmpty(action.safety);
  if (!safety || safety.length > 255) {
    throw new Error('stack health repair action safety is malformed');
  }
  return {
    schema: STACK_HEALTH_ACTION_SCHEMA,
    taskKey,
    deliveryKey,
    action: STACK_REPAIR_ACTION,
    owner: 'symphony',
    writer: 'symphony',
    issue,
    rootPr,
    rootHeadSha,
    prNumbers,
    maxDepth,
    promotionPath,
    integrator,
    deadline,
    violations: action.violations.map(value => nonEmpty(value)),
    safety,
  };
}

function failureRoute(failure, externalAction) {
  if (failure === 'external-blocked') {
    const action = nonEmpty(externalAction);
    if (!action) {
      throw new Error('external-blocked requires exactly one external action');
    }
    return { owner: 'human', action, mode: 'external' };
  }
  const evidence = EVIDENCE_FAILURES[failure];
  if (evidence) return { ...evidence, mode: 'evidence' };
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
  const workflowName = nonEmpty(workflow.name);
  const failure =
    nonEmpty(payload.failure) ||
    (workflow.conclusion === 'cancelled'
      ? workflowName && workflowName !== 'Merge Queue Auto-Enroll'
        ? 'dropped-controller-event'
        : 'workflow-cancelled'
      : workflow.conclusion === 'failure' || workflow.conclusion === 'timed_out'
        ? DELIVERY_WORKFLOW_FAILURES[workflowName] || 'queue-noop'
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
      : route.mode === 'evidence'
        ? 'evidence-pending'
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
      : next.mode === 'evidence'
        ? 'evidence-pending'
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
  const stackEvidence =
    receipt.event.failure === 'draft-stack-policy'
      ? boundedStackHealthAction(receipt.event.evidence)
      : null;
  return {
    schema: REPAIR_TASK_SCHEMA,
    taskKey: digest({ receiptKey: receipt.receiptKey, route: receipt.next }),
    createdAt: receipt.observedAt,
    receiptKey: receipt.receiptKey,
    owner: receipt.next.owner,
    route: fxBackstopRoute(receipt.next.owner),
    action: receipt.next.action,
    issue: receipt.event.issue,
    pr: receipt.event.pr,
    headSha: receipt.event.headSha,
    failure: receipt.event.failure,
    safety: 'normal-pr-ci-review-native-queue-deploy-gates-remain-required',
    ...(stackEvidence ? { evidence: stackEvidence } : {}),
  };
}

export function buildStackHealthReceipt(
  action,
  { now = new Date().toISOString() } = {}
) {
  const evidence = boundedStackHealthAction(action);
  return buildDeliveryReceipt(
    {
      delivery_key: evidence.deliveryKey,
      source: 'summer-closure-health',
      event: 'draft-stack-policy',
      failure: 'draft-stack-policy',
      issue_identifier: evidence.issue,
      pr_number: evidence.rootPr,
      head_sha: evidence.rootHeadSha,
      evidence,
    },
    { now }
  );
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
  const loopRecord = classifyAndOpenFromDelivery(receipt.event, {
    now: receipt.observedAt,
  });
  if (dryRun) {
    return {
      status: 'dry-run',
      receipt,
      receiptPath: receiptDestination,
      task,
      taskPath: taskDestination,
      loop: loopRecord,
    };
  }
  const persistedReceipt = await atomicPersist(receiptDestination, receipt);
  const persistedTask = task
    ? await atomicPersist(taskDestination, task)
    : null;
  const persistedLoop = await persistLoopOutcome(loopRecord, { stateDir });
  return {
    status: persistedReceipt.status,
    receipt: persistedReceipt.value,
    receiptPath: receiptDestination,
    task: persistedTask?.value || null,
    taskPath: taskDestination,
    loop: persistedLoop.record,
    queue: persistedLoop.queue,
    queuePath: persistedLoop.queuePath,
  };
}

export async function persistClosureHealthActions(
  closureHealth,
  {
    stateDir = DEFAULT_DELIVERY_STATE_DIR,
    dryRun = false,
    now = new Date().toISOString(),
  } = {}
) {
  const candidate = closureHealth?.signals?.closureHealth || closureHealth;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('closure health action source is missing or malformed');
  }
  const actions = candidate.repairActions;
  if (!Array.isArray(actions) || actions.length > 100) {
    throw new Error('closure health repair actions are missing or unbounded');
  }
  const boundedActions = actions.map(boundedStackHealthAction);
  const observedAt = nonEmpty(candidate.observedAt) || now;
  if (!Number.isFinite(Date.parse(observedAt))) {
    throw new Error('closure health observedAt is invalid');
  }
  const roots = new Set();
  for (const action of boundedActions) {
    if (roots.has(action.rootPr)) {
      throw new Error(`duplicate stack repair root: ${action.rootPr}`);
    }
    roots.add(action.rootPr);
  }
  const results = [];
  for (const action of boundedActions) {
    const receipt = buildStackHealthReceipt(action, { now: observedAt });
    results.push(await persistDeliveryOutcome(receipt, { stateDir, dryRun }));
  }
  const statuses = results.map(result => result.status);
  return {
    schema: 'jovie-stack-health-action-ingress/v1',
    observedAt,
    actionCount: results.length,
    status:
      results.length === 0
        ? 'none'
        : statuses.every(status => status === 'duplicate')
          ? 'duplicate'
          : 'created',
    actions: results.map(result => ({
      status: result.status,
      rootPr: result.receipt.event.pr,
      task: result.task,
      taskPath: result.taskPath,
      receiptPath: result.receiptPath,
      loop: result.loop,
    })),
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
  const closureHealthFile = process.argv
    .find(arg => arg.startsWith('--closure-health-file='))
    ?.slice('--closure-health-file='.length);
  const reconcile = process.argv.includes('--reconcile');
  if (!eventFile && !reconcile && !closureHealthFile)
    throw new Error(
      'usage: delivery-state-machine.mjs --event-file=<path> | --closure-health-file=<path> | --reconcile [--state-dir=<path>] [--dry-run]'
    );
  if (
    [eventFile, closureHealthFile].filter(Boolean).length > 1 ||
    (reconcile && (eventFile || closureHealthFile))
  ) {
    throw new Error('delivery state machine accepts exactly one input mode');
  }
  if (closureHealthFile) {
    const closureHealth = JSON.parse(await readFile(closureHealthFile, 'utf8'));
    process.stdout.write(
      `${JSON.stringify(await persistClosureHealthActions(closureHealth, { stateDir, dryRun: process.argv.includes('--dry-run') }))}\n`
    );
    return;
  }
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
