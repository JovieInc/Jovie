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

import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  link,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  unlink,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  policyDigest,
  readPrLifecycleContract,
} from '../invariants/pr-lifecycle-contract.mjs';
import {
  FX_BACKSTOP_FAILURES,
  fxBackstopRoute,
} from '../lib/rolling-ci-handoff.mjs';
import {
  advanceAttempt,
  classifyAndOpenFromDelivery,
  DELIVERY_WORKFLOW_FAILURES,
  loadLoopRecords,
  persistDraftStackResolutions,
  persistLoopOutcome,
  readSummerQueue,
  STALL_AUTOMATED_FAILURES,
  STALL_EVIDENCE_FAILURES,
  withSummerQueueLock,
} from './no-unattended-red.mjs';

export const DELIVERY_RECEIPT_SCHEMA = 'jovie-delivery-receipt/v1';
export const REPAIR_TASK_SCHEMA = 'jovie-symphony-repair-task/v1';
export const STACK_HEALTH_ACTION_SCHEMA = 'jovie-stack-health-action/v1';
export const PR_LIFECYCLE_ACTION_SCHEMA = 'jovie-pr-lifecycle-action/v1';
export const STACK_REPAIR_ACTION = 'split-or-retarget-draft-stack'; // JOV-INV-020
export const PR_LIFECYCLE_CONTRACT_ID = 'JOV-INV-029';
export const PR_LIFECYCLE_POLICY_DIGEST = policyDigest(
  readPrLifecycleContract()
);
export const DEFAULT_DELIVERY_STATE_DIR = resolve(
  process.env.GEM_WORKSPACE || '/home/timwhite/gem-workspace',
  'state/jovie-delivery-controller'
);
export const DEFAULT_DELIVERY_REPOSITORY =
  process.env.GITHUB_REPOSITORY || 'JovieInc/Jovie';

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

const NON_AUTHORITATIVE_CLOSURE_REASONS = new Set([
  'closure-health-receipt-missing-or-malformed',
  'closure-observation-unknown',
  'gate-evaluation-failed',
]);

const LIFECYCLE_DISPOSITIONS = new Set(['active-remediation', 'terminal']);
const LIFECYCLE_OWNERS = new Set([
  'controller',
  'gem',
  'github-native-merge-queue',
  'symphony',
]);

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function canonicalDigest(value) {
  const canonicalize = candidate => {
    if (Array.isArray(candidate)) return candidate.map(canonicalize);
    if (!candidate || typeof candidate !== 'object') return candidate;
    return Object.fromEntries(
      Object.keys(candidate)
        .sort()
        .map(key => [key, canonicalize(candidate[key])])
    );
  };
  return digest(canonicalize(value));
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function repositoryName(value) {
  const normalized = nonEmpty(value);
  return normalized && /^[^/\s]+\/[^/\s]+$/.test(normalized)
    ? normalized
    : null;
}

function exactSha(value) {
  const normalized = nonEmpty(value)?.toLowerCase();
  return normalized && /^[0-9a-f]{40}$/.test(normalized) ? normalized : null;
}

function exactPositiveInteger(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function lifecycleActionIdentity(action) {
  const identity = {
    repository: action.repository,
    inventoryIndex: action.inventoryIndex,
    pr: action.pr,
    headSha: action.headSha,
    issue: action.issue,
    disposition: action.disposition,
    sourceState: action.sourceState,
    owner: action.owner,
    writer: action.writer,
    action: action.action,
    reason: action.reason,
    terminal: action.terminal,
  };
  if (action.pr) delete identity.inventoryIndex;
  return identity;
}

function boundedLifecycleAction(action, repository) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    throw new Error('PR lifecycle action must be an object');
  }
  if (action.schema !== PR_LIFECYCLE_ACTION_SCHEMA) {
    throw new Error('PR lifecycle action schema is invalid');
  }
  const actionRepository = repositoryName(action.repository);
  if (!actionRepository || actionRepository !== repository) {
    throw new Error('PR lifecycle action repository is invalid');
  }
  const inventoryIndex = action.inventoryIndex;
  if (
    !Number.isInteger(inventoryIndex) ||
    inventoryIndex < 0 ||
    inventoryIndex > 10_000
  ) {
    throw new Error('PR lifecycle action inventory index is invalid');
  }
  const pr = exactPositiveInteger(action.pr);
  const sourceState = nonEmpty(action.sourceState);
  if (!pr && sourceState !== 'unclassified') {
    throw new Error('PR lifecycle action requires a PR number');
  }
  const headSha = exactSha(action.headSha);
  if (!headSha && sourceState !== 'unclassified') {
    throw new Error('PR lifecycle action requires an exact head SHA');
  }
  const lifecycleKey = nonEmpty(action.lifecycleKey);
  const expectedLifecycleKey = pr
    ? `${repository}:pr:${pr}`
    : `${repository}:inventory-row:${inventoryIndex}`;
  if (lifecycleKey !== expectedLifecycleKey || lifecycleKey.length > 180) {
    throw new Error('PR lifecycle action key is invalid');
  }
  const actionKey = nonEmpty(action.actionKey)?.toLowerCase();
  if (!actionKey || !/^[0-9a-f]{64}$/i.test(actionKey)) {
    throw new Error('PR lifecycle action requires a SHA-256 action key');
  }
  const disposition = nonEmpty(action.disposition);
  const owner = nonEmpty(action.owner);
  const writer = nonEmpty(action.writer);
  const nextAction = nonEmpty(action.action);
  const reason = nonEmpty(action.reason);
  if (!LIFECYCLE_DISPOSITIONS.has(disposition)) {
    throw new Error('PR lifecycle disposition is invalid');
  }
  if (!LIFECYCLE_OWNERS.has(owner) || writer !== owner) {
    throw new Error('PR lifecycle action requires one machine owner/writer');
  }
  if (
    !nextAction ||
    nextAction.length > 160 ||
    !reason ||
    reason.length > 240
  ) {
    throw new Error('PR lifecycle action route is invalid');
  }
  if (action.terminal !== (disposition === 'terminal')) {
    throw new Error('PR lifecycle terminal state is inconsistent');
  }
  if (action.externalMutations !== 0) {
    throw new Error('PR lifecycle ingress cannot mutate external state');
  }
  if (
    sourceState === 'queued' &&
    (owner !== 'github-native-merge-queue' ||
      nextAction !== 'preserve-native-queue-ownership')
  ) {
    throw new Error(
      'queued PR lifecycle action must preserve native queue ownership'
    );
  }
  if (
    sourceState === 'promote' &&
    (owner !== 'gem' || nextAction !== 'reconcile-exact-head-queue-admission')
  ) {
    throw new Error('promotable PR lifecycle action must remain Gem-owned');
  }
  if (
    pr === 17156 &&
    (disposition !== 'terminal' ||
      owner !== 'gem' ||
      nextAction !== 'preserve-protected-pr-exclusion')
  ) {
    throw new Error('protected PR 17156 lifecycle exclusion is invalid');
  }
  const observedAt = nonEmpty(action.observedAt);
  if (!observedAt || !Number.isFinite(Date.parse(observedAt))) {
    throw new Error('PR lifecycle action observedAt is invalid');
  }
  const bounded = {
    ...action,
    repository,
    inventoryIndex,
    pr,
    headSha,
    issue: nonEmpty(action.issue),
    sourceState,
    lifecycleKey,
    actionKey,
    disposition,
    owner,
    writer,
    action: nextAction,
    reason,
    observedAt: new Date(observedAt).toISOString(),
  };
  if (actionKey !== canonicalDigest(lifecycleActionIdentity(bounded))) {
    throw new Error('PR lifecycle action key does not match its content');
  }
  return bounded;
}

async function quarantineLifecycleReceipt(directory, name) {
  const source = join(directory, name);
  const quarantineDirectory = join(directory, 'quarantine');
  await mkdir(quarantineDirectory, { recursive: true, mode: 0o700 });
  const destination = join(
    quarantineDirectory,
    `${name}.${Date.now()}-${randomUUID()}.malformed`
  );
  try {
    await rename(source, destination);
    return destination;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function loadLifecycleActions(stateDir) {
  const directory = join(stateDir, 'pr-lifecycle-actions');
  let names;
  try {
    names = await readdir(directory);
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const records = [];
  for (const name of names.filter(name => name.endsWith('.json')).sort()) {
    try {
      const record = JSON.parse(await readFile(join(directory, name), 'utf8'));
      if (record?.schema !== 'jovie-pr-lifecycle-action-receipt/v1') {
        throw new Error('persisted PR lifecycle action schema is malformed');
      }
      boundedLifecycleAction(
        { ...record, schema: PR_LIFECYCLE_ACTION_SCHEMA },
        repositoryName(record.repository)
      );
      if (
        !Number.isInteger(record.generation) ||
        record.generation < 0 ||
        (record.supersedesActionKey !== null &&
          !/^[0-9a-f]{64}$/.test(record.supersedesActionKey)) ||
        record.outcome !== (record.terminal ? 'terminal' : 'open') ||
        (record.terminal
          ? record.nextProofAt !== null
          : !Number.isFinite(Date.parse(record.nextProofAt)))
      ) {
        throw new Error('persisted PR lifecycle action metadata is malformed');
      }
      records.push(record);
    } catch {
      await quarantineLifecycleReceipt(directory, name);
    }
  }
  return records;
}

async function persistLifecycleAction(action, { stateDir, dryRun }) {
  const records = dryRun ? [] : await loadLifecycleActions(stateDir);
  const previous = records
    .filter(record => record.lifecycleKey === action.lifecycleKey)
    .sort((left, right) => {
      const observed = `${right.observedAt}`.localeCompare(
        `${left.observedAt}`
      );
      return (
        observed || Number(right.generation || 0) - Number(left.generation || 0)
      );
    })[0];
  if (
    previous &&
    Date.parse(previous.observedAt) > Date.parse(action.observedAt)
  ) {
    throw new Error('PR lifecycle action is older than persisted authority');
  }
  if (
    previous &&
    previous.observedAt === action.observedAt &&
    previous.actionKey !== action.actionKey
  ) {
    throw new Error(
      'PR lifecycle action conflicts at the same observation time'
    );
  }
  const receipt = {
    ...action,
    schema: 'jovie-pr-lifecycle-action-receipt/v1',
    generation:
      previous?.actionKey === action.actionKey
        ? Number(previous.generation || 0)
        : Number(previous?.generation ?? -1) + 1,
    supersedesActionKey:
      previous && previous.actionKey !== action.actionKey
        ? previous.actionKey
        : null,
    outcome: action.terminal ? 'terminal' : 'open',
    nextProofAt: action.terminal
      ? null
      : new Date(Date.parse(action.observedAt) + 10 * 60 * 1000).toISOString(),
  };
  const destination = join(
    stateDir,
    'pr-lifecycle-actions',
    `${action.actionKey}.json`
  );
  if (dryRun) {
    return { status: 'dry-run', receipt, path: destination };
  }
  const persisted = await atomicPersist(destination, receipt);
  if (
    persisted.value.actionKey !== action.actionKey ||
    persisted.value.lifecycleKey !== action.lifecycleKey
  ) {
    throw new Error('PR lifecycle action key collision');
  }
  return {
    status: persisted.status,
    receipt: persisted.value,
    path: destination,
  };
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
  if (
    !deliveryKey ||
    deliveryKey !== `closure-stack:${taskKey}` ||
    deliveryKey.length > 160
  ) {
    throw new Error(
      'stack health repair action requires a bounded delivery key'
    );
  }
  if (action.owner !== 'symphony' || action.writer !== 'symphony') {
    throw new Error('stack health repair action must remain Symphony-owned');
  }
  const repository = repositoryName(action.repository);
  if (!repository) {
    throw new Error(
      'stack health repair action requires repository owner/name'
    );
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
  const memberHeads = Array.isArray(action.memberHeads)
    ? action.memberHeads.map(entry => ({
        pr: exactPositiveInteger(entry?.pr),
        headSha: exactSha(entry?.headSha),
      }))
    : [];
  if (
    memberHeads.length !== prNumbers.length ||
    memberHeads.some(
      entry => !entry.pr || !entry.headSha || !prNumbers.includes(entry.pr)
    ) ||
    new Set(memberHeads.map(entry => entry.pr)).size !== memberHeads.length ||
    memberHeads.find(entry => entry.pr === rootPr)?.headSha !== rootHeadSha
  )
    throw new Error('stack health repair action member heads are invalid');
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
    const headSha = exactSha(entry.headSha);
    if (
      !pr ||
      !base ||
      !head ||
      !headSha ||
      !prNumbers.includes(pr) ||
      memberHeads.find(item => item.pr === pr)?.headSha !== headSha ||
      base.length > 255 ||
      head.length > 255
    ) {
      throw new Error(
        `stack health repair action promotion path ${index} is invalid`
      );
    }
    return { pr, base, head, headSha };
  });
  if (
    !promotionPath.some(entry => entry.pr === rootPr) ||
    promotionPath.length !== maxDepth ||
    new Set(promotionPath.map(entry => entry.pr)).size !== promotionPath.length
  ) {
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
    repository,
    taskKey,
    deliveryKey,
    action: STACK_REPAIR_ACTION,
    owner: 'symphony',
    writer: 'symphony',
    issue,
    rootPr,
    rootHeadSha,
    prNumbers,
    memberHeads,
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
  const productionController =
    workflow.path === '.github/workflows/production-controller.yml';
  // GitHub's run name can include the source SHA and CI attempt. Route by the
  // immutable workflow path, not the user-visible dynamic title.
  const workflowName = productionController
    ? 'Production Controller'
    : nonEmpty(workflow.name);
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
  const repository =
    repositoryName(payload.repository) ||
    repositoryName(raw.repository?.full_name) ||
    repositoryName(raw.repository) ||
    repositoryName(DEFAULT_DELIVERY_REPOSITORY);
  if (!repository) {
    throw new Error('delivery event requires repository owner/name');
  }
  const runAttempt = exactPositiveInteger(workflow.run_attempt);
  if (
    productionController &&
    (!exactPositiveInteger(workflow.id) ||
      !runAttempt ||
      !headSha ||
      workflow.head_branch !== 'main' ||
      workflow.status !== 'completed')
  ) {
    throw new Error(
      'production controller event requires an exact completed main run attempt'
    );
  }
  const deliveryKey =
    nonEmpty(payload.delivery_key) ||
    nonEmpty(payload.event_id) ||
    nonEmpty(raw.delivery_id) ||
    (productionController ? `${workflow.id}:attempt:${runAttempt}` : null) ||
    nonEmpty(workflow.id && String(workflow.id)) ||
    digest({
      repository,
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
    repository,
    deliveryKey,
    source: nonEmpty(payload.source) || (workflow.id ? 'github' : 'linear'),
    workflow: workflowName,
    event: nonEmpty(payload.event) || nonEmpty(raw.action) || 'changed',
    issue: nonEmpty(payload.issue_identifier) || nonEmpty(payload.issue),
    pr,
    headSha,
    failure,
    externalAction: nonEmpty(payload.external_action),
    evidence: productionController
      ? {
          workflowRun: {
            id: workflow.id,
            attempt: runAttempt,
            path: workflow.path,
            conclusion: workflow.conclusion,
            url: `https://github.com/${repository}/actions/runs/${workflow.id}/attempts/${runAttempt}`,
          },
        }
      : payload.evidence && typeof payload.evidence === 'object'
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
    policy: {
      id: PR_LIFECYCLE_CONTRACT_ID,
      schema: 'jovie-pr-lifecycle/v1',
      digest: PR_LIFECYCLE_POLICY_DIGEST,
    },
    receiptKey: digest({
      repository: event.repository,
      deliveryKey: event.deliveryKey,
      failure,
      stage,
    }),
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
    policy: receipt.policy || {
      id: PR_LIFECYCLE_CONTRACT_ID,
      schema: 'jovie-pr-lifecycle/v1',
      digest: PR_LIFECYCLE_POLICY_DIGEST,
    },
    observedAt: now,
    stage,
    terminal: stage === 'external-blocked' || stage === 'production-proven',
    previousReceiptKey: receipt.receiptKey,
    receiptKey: digest({
      repository: receipt.event.repository,
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
    repository: receipt.event.repository,
    taskKey: digest({
      repository: receipt.event.repository,
      receiptKey: receipt.receiptKey,
      route: receipt.next,
    }),
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
    ...(receipt.event.evidence?.workflowRun
      ? { evidence: receipt.event.evidence }
      : {}),
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
      repository: evidence.repository,
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
  const directory = dirname(destination);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, `.${randomUUID()}.tmp`);
  try {
    const handle = await open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(value)}\n`, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await link(temporary, destination);
    return { status: 'created', path: destination, value };
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    return {
      status: 'duplicate',
      path: destination,
      value: JSON.parse(await readFile(destination, 'utf8')),
    };
  } finally {
    await unlink(temporary).catch(error => {
      if (error?.code !== 'ENOENT') throw error;
    });
  }
}

/** Persist a receipt and, when appropriate, a formal Gem-to-Symphony task. */
export async function persistDeliveryOutcome(
  receipt,
  {
    stateDir = DEFAULT_DELIVERY_STATE_DIR,
    dryRun = false,
    reactivateDraftStack = false,
    queueLockHeld = false,
    draftStackGeneration = null,
  } = {}
) {
  const receiptDestination = receiptPath(stateDir, receipt);
  const task = repairTaskForReceipt(receipt);
  const taskDestination = task
    ? join(stateDir, 'repair-tasks', `${task.taskKey}.json`)
    : null;
  const classifiedLoop = classifyAndOpenFromDelivery(receipt.event, {
    now: receipt.observedAt,
  });
  const loopRecord = draftStackGeneration
    ? { ...classifiedLoop, draftStackGeneration }
    : classifiedLoop;
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
  const persistedLoop = await persistLoopOutcome(loopRecord, {
    stateDir,
    reactivateDraftStack,
    queueLockHeld,
  });
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
  const repository =
    repositoryName(candidate.repository) || DEFAULT_DELIVERY_REPOSITORY;
  const rawLifecycleActions = candidate.lifecycleActions;
  if (
    rawLifecycleActions != null &&
    (!Array.isArray(rawLifecycleActions) || rawLifecycleActions.length > 500)
  ) {
    throw new Error('PR lifecycle actions are missing or unbounded');
  }
  const lifecycleRows = Array.isArray(rawLifecycleActions)
    ? rawLifecycleActions
    : [];
  const seenLifecycleKeys = new Set();
  const boundedLifecycleRows = lifecycleRows.map((action, index) => {
    try {
      const bounded = boundedLifecycleAction(action, repository);
      if (seenLifecycleKeys.has(bounded.lifecycleKey)) {
        throw new Error('duplicate PR lifecycle action');
      }
      seenLifecycleKeys.add(bounded.lifecycleKey);
      return { index, action: bounded, error: null };
    } catch (error) {
      return {
        index,
        action: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
  const rawActions = candidate.repairActions;
  if (
    rawActions != null &&
    (!Array.isArray(rawActions) || rawActions.length > 100)
  ) {
    throw new Error('closure health repair actions are missing or unbounded');
  }
  const actions = Array.isArray(rawActions) ? rawActions : [];
  const boundedActions = actions.map(boundedStackHealthAction);
  const observedAtInput = nonEmpty(candidate.observedAt) || now;
  if (!Number.isFinite(Date.parse(observedAtInput))) {
    throw new Error('closure health observedAt is invalid');
  }
  const observedAt = new Date(observedAtInput).toISOString();
  const roots = new Set();
  for (const action of boundedActions) {
    if (roots.has(action.rootPr)) {
      throw new Error(`duplicate stack repair root: ${action.rootPr}`);
    }
    roots.add(action.rootPr);
  }
  let activeViolationRoots = null;
  if (candidate.stackHealth != null) {
    const violations = candidate.stackHealth?.violations;
    if (!Array.isArray(violations) || violations.length > 100) {
      throw new Error(
        'closure health stack violations are malformed or unbounded'
      );
    }
    const reasons = Array.isArray(candidate.reasons) ? candidate.reasons : [];
    const stackObservationAuthoritative =
      candidate.schema === 'jovie-closure-health/v1' &&
      candidate.authority === 'Summer' &&
      Array.isArray(candidate.reasons) &&
      !reasons.some(reason => NON_AUTHORITATIVE_CLOSURE_REASONS.has(reason));
    const violationRoots = violations.map(violation =>
      exactPositiveInteger(violation?.rootPr)
    );
    if (violationRoots.some(root => !root)) {
      throw new Error('closure health stack violation has an invalid root');
    }
    const uniqueViolationRoots = new Set(violationRoots);
    if (uniqueViolationRoots.size !== violationRoots.length) {
      throw new Error('closure health stack violation roots are duplicated');
    }
    if ([...roots].some(root => !uniqueViolationRoots.has(root))) {
      throw new Error('stack repair root is missing from current violations');
    }
    if (stackObservationAuthoritative) {
      activeViolationRoots = uniqueViolationRoots;
    }
  }
  const persistSnapshot = async (queueLockHeld, draftStackAuthority = null) => {
    const results = [];
    for (const action of boundedActions) {
      const receipt = buildStackHealthReceipt(action, { now: observedAt });
      results.push(
        await persistDeliveryOutcome(receipt, {
          stateDir,
          dryRun,
          queueLockHeld,
          reactivateDraftStack:
            activeViolationRoots?.has(action.rootPr) === true,
          draftStackGeneration: draftStackAuthority?.snapshotKey || null,
        })
      );
    }
    const lifecycle = [];
    for (const row of boundedLifecycleRows) {
      if (row.error) {
        lifecycle.push({
          status: 'rejected',
          inventoryIndex: row.index,
          reason: row.error,
        });
        continue;
      }
      try {
        const persisted = await persistLifecycleAction(row.action, {
          stateDir,
          dryRun,
        });
        lifecycle.push({
          status: persisted.status,
          inventoryIndex: row.action.inventoryIndex,
          pr: row.action.pr,
          headSha: row.action.headSha,
          owner: row.action.owner,
          disposition: row.action.disposition,
          action: row.action.action,
          receipt: persisted.receipt,
          path: persisted.path,
        });
      } catch (error) {
        lifecycle.push({
          status: 'rejected',
          inventoryIndex: row.index,
          pr: row.action.pr,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const evidence = [];
    for (const rootPr of activeViolationRoots || []) {
      if (roots.has(rootPr)) continue;
      const record = classifyAndOpenFromDelivery(
        {
          repository,
          delivery_key: `closure-stack-evidence:${rootPr}`,
          failure: 'not-proven',
          proven: false,
          evidence: {
            draftStackRoot: rootPr,
            reason: 'missing-exact-head-evidence',
          },
        },
        { now: observedAt }
      );
      Object.assign(record, {
        stallClass: 'draft-stack-policy',
        pr: rootPr,
        reason: 'draft-stack-policy:collect-missing-exact-head-evidence',
        draftStackGeneration: draftStackAuthority?.snapshotKey || null,
      });
      evidence.push(
        await persistLoopOutcome(record, {
          stateDir,
          dryRun,
          queueLockHeld,
          reactivateDraftStack: true,
        })
      );
    }
    const resolution = await persistDraftStackResolutions(
      activeViolationRoots,
      {
        stateDir,
        dryRun,
        now: observedAt,
        queueLockHeld,
        draftStackAuthority,
        repository,
      }
    );
    const rejectedLifecycle = lifecycle.filter(
      result => result.status === 'rejected'
    );
    const statuses = [
      ...results,
      ...evidence,
      ...lifecycle.filter(result => result.status !== 'rejected'),
    ].map(result => result.status);
    return {
      schema: 'jovie-stack-health-action-ingress/v1',
      observedAt,
      actionCount: results.length,
      evidenceCount: evidence.length,
      lifecycleActionCount: lifecycle.length - rejectedLifecycle.length,
      lifecycleRejectedCount: rejectedLifecycle.length,
      failClosed: rejectedLifecycle.length > 0,
      status:
        rejectedLifecycle.length > 0
          ? 'partial'
          : statuses.length === 0
            ? resolution.status === 'resolved'
              ? 'resolved'
              : 'none'
            : statuses.every(status => status === 'duplicate')
              ? 'duplicate'
              : 'created',
      resolution,
      actions: results.map(result => ({
        status: result.status,
        rootPr: result.receipt.event.pr,
        task: result.task,
        taskPath: result.taskPath,
        receiptPath: result.receiptPath,
        loop: result.loop,
      })),
      evidence: evidence.map(result => ({
        status: result.status,
        rootPr: result.record.pr,
        task: result.evidence,
        taskPath: result.evidencePath,
        loop: result.record,
      })),
      lifecycleActions: lifecycle,
    };
  };
  if (dryRun) return persistSnapshot(false);
  return withSummerQueueLock(stateDir, async () => {
    if (activeViolationRoots == null) return persistSnapshot(true);
    const watermark = {
      schema: 'jovie-draft-stack-authority/v1',
      observedAt,
      snapshotKey: digest({
        observedAt,
        reasons: [...candidate.reasons].sort(),
        roots: [...activeViolationRoots].sort((a, b) => a - b),
        actions: boundedActions.map(action => action.taskKey).sort(),
      }),
    };
    const current = (await readSummerQueue(stateDir))?.draftStackAuthority;
    if (
      current &&
      (current.schema !== watermark.schema ||
        !Number.isFinite(Date.parse(current.observedAt)) ||
        !/^[0-9a-f]{64}$/.test(current.snapshotKey))
    ) {
      throw new Error('draft stack authority watermark is malformed');
    }
    if (current && Date.parse(current.observedAt) > Date.parse(observedAt)) {
      return {
        schema: 'jovie-stack-health-action-ingress/v1',
        observedAt,
        status: 'stale',
        actionCount: 0,
        evidenceCount: 0,
        lifecycleActionCount: 0,
        lifecycleRejectedCount: 0,
        failClosed: false,
        actions: [],
        evidence: [],
        lifecycleActions: [],
      };
    }
    if (
      current?.observedAt === observedAt &&
      current.snapshotKey !== watermark.snapshotKey
    ) {
      throw new Error(
        'conflicting authoritative draft stack snapshot timestamp'
      );
    }
    return persistSnapshot(true, watermark);
  });
}

/** Attestation is evidence only; mismatch is routed through the same repair contract. */
export function attestGemService(
  { sourceSha, installedSha, configSha, loadedConfigSha, active, healthy },
  options = {}
) {
  const repository =
    repositoryName(options.repository) || DEFAULT_DELIVERY_REPOSITORY;
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
          repository,
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
          repository,
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
  const repository =
    repositoryName(heartbeat?.repository) || DEFAULT_DELIVERY_REPOSITORY;
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
          repository,
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
          repository,
          source: 'gem',
          event: 'reconciliation',
          evidence: { observedAt, ageMs, maxAgeMs },
        },
    { now }
  );
}

export const INVESTIGATION_SCHEMA = 'jovie-deployment-investigation/v1';
const RETOUCH_REPAIR_PATH =
  'apps/web/components/features/admin/system-map/AdminSystemMapSkillsTab.tsx';

function investigationAssert(condition, reason) {
  if (!condition) throw new Error(`deployment-investigation:${reason}`);
}

function readInvestigationText(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 2 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    // Provider stderr and request environments may contain credentials.
    throw new Error('deployment-investigation:read-unavailable');
  }
}

function readInvestigationJson(command, args) {
  try {
    return JSON.parse(readInvestigationText(command, args));
  } catch {
    throw new Error('deployment-investigation:read-unavailable');
  }
}
function readInvestigationStepLogs(input, entries) {
  try {
    const archive = execFileSync(
      'gh',
      [
        'api',
        `repos/JovieInc/Jovie/actions/runs/${input.run}/attempts/${input.attempt}/logs`,
      ],
      {
        timeout: 30000,
        maxBuffer: 8 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    // Python is already part of the fixed runner toolchain. Read exact members
    // in memory; never extract an archive path or print raw log/error output.
    return JSON.parse(
      execFileSync(
        'python3',
        [
          '-c',
          `
import io,json,sys,zipfile
archive=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))
paths=json.loads(sys.argv[1])
result={}
for key,path in paths.items():
    entries=[entry for entry in archive.infolist() if entry.filename==path]
    if len(entries)!=1 or entries[0].file_size>2*1024*1024: raise ValueError('step mapping unavailable')
    result[key]=archive.read(entries[0]).decode('utf-8')
print(json.dumps(result))
`,
          JSON.stringify(entries),
        ],
        {
          input: archive,
          encoding: 'utf8',
          timeout: 30000,
          maxBuffer: 8 * 1024 * 1024,
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      )
    );
  } catch {
    throw new Error('deployment-investigation:step-logs-unavailable');
  }
}

function readInvestigationGithub(endpoint) {
  return readInvestigationJson('gh', ['api', endpoint]);
}

function readInvestigationRepair(pr) {
  const query = `query { repository(owner:"JovieInc",name:"Jovie") { pullRequest(number:${pr}) { number state isDraft headRefOid baseRefName url mergeCommit { oid } mergeQueueEntry { id } } } }`;
  return readInvestigationJson('gh', ['api', 'graphql', '-f', `query=${query}`])
    ?.data?.repository?.pullRequest;
}

function validateInvestigationIdentity(input) {
  investigationAssert(
    input?.repository === 'JovieInc/Jovie',
    'repository-invalid'
  );
  for (const key of ['run', 'attempt', 'repairPr']) {
    investigationAssert(
      Number.isSafeInteger(input[key]) && input[key] > 0,
      `${key}-invalid`
    );
  }
  investigationAssert(
    /^[0-9a-f]{40}$/.test(input.repairHead ?? ''),
    'repair-head-invalid'
  );
  investigationAssert(
    /^https:\/\/jovie-[a-z0-9]+-jovie\.vercel\.app$/.test(
      input.deploymentUrl ?? ''
    ),
    'deployment-url-invalid'
  );
}

async function observeInvestigationBindings(input, { readGithub, readRepair }) {
  validateInvestigationIdentity(input);
  const run = await readGithub(
    `repos/JovieInc/Jovie/actions/runs/${input.run}/attempts/${input.attempt}`
  );
  investigationAssert(
    run?.id === input.run &&
      run.run_attempt === input.attempt &&
      run.path === '.github/workflows/production-controller.yml' &&
      run.head_branch === 'main' &&
      run.status === 'completed' &&
      run.conclusion === 'failure' &&
      run.repository?.full_name === 'JovieInc/Jovie' &&
      /^[0-9a-f]{40}$/.test(run.head_sha ?? ''),
    'controller-binding-invalid'
  );
  const pr = await readRepair(input.repairPr);
  investigationAssert(
    pr?.number === input.repairPr &&
      pr.headRefOid === input.repairHead &&
      pr.baseRefName === 'main' &&
      !pr.isDraft &&
      ((pr.state === 'OPEN' &&
        typeof pr.mergeQueueEntry?.id === 'string' &&
        pr.mergeQueueEntry.id) ||
        (pr.state === 'MERGED' &&
          /^[0-9a-f]{40}$/.test(pr.mergeCommit?.oid ?? ''))),
    'repair-not-queued-or-merged-at-exact-head'
  );
  const file = await readGithub(
    `repos/JovieInc/Jovie/contents/${RETOUCH_REPAIR_PATH}?ref=${input.repairHead}`
  );
  investigationAssert(
    file?.encoding === 'base64' &&
      typeof file.content === 'string' &&
      file.content.length < 128000,
    'repair-source-unavailable'
  );
  const source = Buffer.from(file.content, 'base64').toString('utf8');
  investigationAssert(
    source.includes("from '@/lib/services/retouching/style-prompt'") &&
      source.includes('WHITE_SPACE_STYLE_PROMPT') &&
      !/node:fs|readFile/.test(source),
    'repair-source-does-not-cover-asset'
  );
  return { run, pr };
}

/** Read only authenticated records emitted by the existing deploy wrapper. */
export async function collectDeploymentInvestigation(
  input,
  {
    readGithub = readInvestigationGithub,
    readRepair = readInvestigationRepair,
    readStepLogs = readInvestigationStepLogs,
    now = new Date().toISOString(),
  } = {}
) {
  const { run } = await observeInvestigationBindings(input, {
    readGithub,
    readRepair,
  });
  const jobs = await readGithub(
    `repos/JovieInc/Jovie/actions/runs/${input.run}/attempts/${input.attempt}/jobs?per_page=100`
  );
  const staging = jobs?.jobs?.filter(
    job => job.name === 'Production Release / deploy-staging'
  );
  investigationAssert(
    staging?.length === 1 &&
      staging[0].run_id === input.run &&
      staging[0].run_attempt === input.attempt &&
      staging[0].status === 'completed' &&
      staging[0].conclusion === 'failure' &&
      Number.isSafeInteger(staging[0].id),
    'staging-attempt-binding-invalid'
  );
  const job = staging[0];
  const selectStep = (selectedJob, predicate, conclusion) => {
    const matches = selectedJob.steps?.filter(predicate);
    investigationAssert(
      matches?.length === 1 &&
        matches[0].status === 'completed' &&
        matches[0].conclusion === conclusion &&
        Number.isSafeInteger(matches[0].number),
      'staging-step-binding-invalid'
    );
    return matches[0];
  };
  const checkout = selectStep(
    job,
    step => /^Run actions\/checkout@[0-9a-f]{40}$/.test(step.name),
    'success'
  );
  const deploy = selectStep(
    job,
    step => step.name === 'Deploy (staging preview, prebuilt)',
    'failure'
  );
  const authorizers = jobs.jobs.filter(
    candidate => candidate.name === 'Authorize exact main CI evidence'
  );
  investigationAssert(
    authorizers.length === 1 &&
      authorizers[0].run_id === input.run &&
      authorizers[0].run_attempt === input.attempt &&
      authorizers[0].status === 'completed' &&
      authorizers[0].conclusion === 'success',
    'source-authorization-job-invalid'
  );
  const authorize = selectStep(
    authorizers[0],
    step => step.name === 'Cross-prove exact successful push CI',
    'success'
  );
  const stepPath = (name, step) =>
    `${name.replaceAll('/', '_')}/${step.number}_${step.name.replaceAll('/', '_')}.txt`;
  const logs = await readStepLogs(input, {
    checkout: stepPath(job.name, checkout),
    deploy: stepPath(job.name, deploy),
    authorize: stepPath(authorizers[0].name, authorize),
  });
  const lines = key => {
    investigationAssert(
      typeof logs?.[key] === 'string' && logs[key].length > 0,
      'staging-log-unavailable'
    );
    return logs[key]
      .split('\n')
      .map(line =>
        line.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z /, '')
      );
  };
  const authLines = lines('authorize');
  const expected = [
    ...new Set(
      authLines.flatMap(
        line => /^  EXPECTED_SHA: ([0-9a-f]{40})$/.exec(line)?.slice(1) || []
      )
    ),
  ];
  const receipts = authLines.flatMap(line => {
    const match =
      /^Authorized production from exact CI run ([1-9][0-9]*) attempt ([1-9][0-9]*) over deployed range [0-9a-f]{40}\.\.([0-9a-f]{40}) \(Web=true bind=[a-z_]+\)\.$/.exec(
        line
      );
    return match
      ? [{ run: Number(match[1]), attempt: Number(match[2]), sha: match[3] }]
      : [];
  });
  investigationAssert(
    expected.length === 1 &&
      receipts.length === 1 &&
      receipts[0].sha === expected[0],
    'authorized-source-receipt-invalid'
  );
  const sourceCi = await readGithub(
    `repos/JovieInc/Jovie/actions/runs/${receipts[0].run}/attempts/${receipts[0].attempt}`
  );
  investigationAssert(
    sourceCi?.id === receipts[0].run &&
      sourceCi.run_attempt === receipts[0].attempt &&
      sourceCi.head_sha === expected[0] &&
      sourceCi.path === '.github/workflows/ci.yml' &&
      sourceCi.head_branch === 'main' &&
      sourceCi.event === 'push' &&
      sourceCi.status === 'completed' &&
      sourceCi.conclusion === 'success' &&
      sourceCi.repository?.full_name === input.repository,
    'authorized-source-ci-invalid'
  );
  const checkoutHeads = new Set(
    lines('checkout').filter(line => /^[0-9a-f]{40}$/.test(line))
  );
  const deployLines = lines('deploy');
  const deployHeads = new Set(
    deployLines.flatMap(
      line =>
        /^  VERCEL_GIT_COMMIT_SHA: ([0-9a-f]{40})$/.exec(line)?.slice(1) || []
    )
  );
  investigationAssert(
    checkoutHeads.size === 1 &&
      deployHeads.size === 1 &&
      checkoutHeads.has(expected[0]) &&
      deployHeads.has(expected[0]),
    'deployed-source-binding-invalid'
  );
  const records = new Map();
  for (const line of deployLines) {
    if (!line.startsWith('Deploy failure diagnostic: ')) continue;
    let diagnostic;
    try {
      diagnostic = JSON.parse(line.slice('Deploy failure diagnostic: '.length));
    } catch {
      throw new Error('deployment-investigation:diagnostic-malformed');
    }
    investigationAssert(
      diagnostic &&
        Object.keys(diagnostic).sort().join(',') ===
          [
            'schema',
            'mode',
            'attempt',
            'exitStatus',
            'errorCode',
            'asset',
            'deploymentUrl',
          ]
            .sort()
            .join(',') &&
        diagnostic.schema === 'jovie-vercel-deploy-failure/v1' &&
        ['tgz', 'split-tgz', 'plain', 'source'].includes(diagnostic.mode) &&
        Number.isSafeInteger(diagnostic.attempt) &&
        diagnostic.attempt > 0 &&
        Number.isSafeInteger(diagnostic.exitStatus) &&
        diagnostic.exitStatus > 0 &&
        diagnostic.exitStatus <= 255,
      'diagnostic-invalid'
    );
    if (diagnostic.deploymentUrl !== input.deploymentUrl) continue;
    records.set(digest(diagnostic), diagnostic);
  }
  investigationAssert(records.size === 1, 'diagnostic-missing-or-conflicting');
  const diagnostic = [...records.values()][0];
  investigationAssert(
    diagnostic.errorCode === 'ENOENT' &&
      diagnostic.asset === 'retouch-style-prompt',
    'diagnosis-not-covered'
  );
  // This proves the wrapper's observed failure, not the provider's current state.
  return {
    schema: INVESTIGATION_SCHEMA,
    repository: input.repository,
    run: input.run,
    attempt: input.attempt,
    controllerHead: run.head_sha,
    sourceHead: expected[0],
    sourceCiRun: sourceCi.id,
    sourceCiAttempt: sourceCi.run_attempt,
    deploymentUrl: input.deploymentUrl,
    repairPr: input.repairPr,
    repairHead: input.repairHead,
    diagnosis: 'retouch-style-prompt-missing',
    errorCode: 'ENOENT',
    capability: 'read-only-investigation',
    observedAt: now,
    jobId: job.id,
    stepNumber: deploy.number,
    diagnosticDigest: digest(diagnostic),
  };
}

/** Accept diagnosis only; source repair/deployment/closure remain separate. */
export async function persistDeploymentInvestigation(
  input,
  {
    stateDir = DEFAULT_DELIVERY_STATE_DIR,
    dryRun = false,
    readGithub = readInvestigationGithub,
    readRepair = readInvestigationRepair,
    readStepLogs = readInvestigationStepLogs,
    now = new Date().toISOString(),
  } = {}
) {
  investigationAssert(
    input &&
      Object.keys(input).sort().join(',') ===
        [
          'schema',
          'repository',
          'run',
          'attempt',
          'sourceHead',
          'controllerHead',
          'sourceCiRun',
          'sourceCiAttempt',
          'deploymentUrl',
          'jobId',
          'stepNumber',
          'diagnosticDigest',
          'repairPr',
          'repairHead',
          'diagnosis',
          'errorCode',
          'capability',
          'observedAt',
        ]
          .sort()
          .join(','),
    'result-shape-invalid'
  );
  investigationAssert(
    input.schema === INVESTIGATION_SCHEMA &&
      input.capability === 'read-only-investigation' &&
      input.diagnosis === 'retouch-style-prompt-missing' &&
      input.errorCode === 'ENOENT',
    'result-capability-invalid'
  );
  const { run, pr } = await observeInvestigationBindings(input, {
    readGithub,
    readRepair,
  });
  investigationAssert(
    run.head_sha === input.controllerHead,
    'source-head-mismatch'
  );
  const expected = buildDeliveryReceipt({
    action: 'completed',
    repository: { full_name: input.repository },
    workflow_run: run,
  });
  const receipt = JSON.parse(
    await readFile(receiptPath(stateDir, expected), 'utf8')
  );
  investigationAssert(
    receipt.receiptKey === expected.receiptKey &&
      receipt.event.headSha === input.controllerHead &&
      receipt.event.evidence?.workflowRun?.attempt === input.attempt &&
      receipt.event.evidence.workflowRun.id === input.run &&
      receipt.event.failure === 'production-controller-failed',
    'persisted-receipt-mismatch'
  );
  const task = repairTaskForReceipt(receipt);
  const storedTask = JSON.parse(
    await readFile(
      join(stateDir, 'repair-tasks', `${task.taskKey}.json`),
      'utf8'
    )
  );
  investigationAssert(
    isDeepStrictEqual(storedTask, task),
    'persisted-task-mismatch'
  );
  const resultKey = digest({
    taskKey: task.taskKey,
    sourceHead: input.sourceHead,
    deploymentUrl: input.deploymentUrl,
    repairPr: input.repairPr,
    repairHead: input.repairHead,
    diagnosis: input.diagnosis,
  });
  const resultPath = join(
    stateDir,
    'investigation-results',
    `${resultKey}.json`
  );
  let existing = null;
  try {
    existing = JSON.parse(await readFile(resultPath, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  if (existing) {
    investigationAssert(
      Object.keys(input).every(key =>
        isDeepStrictEqual(existing[key], input[key])
      ),
      'accepted-result-payload-mismatch'
    );
  } else {
    const age = Date.parse(now) - Date.parse(input.observedAt);
    investigationAssert(
      Number.isFinite(age) && age >= 0 && age <= 15 * 60 * 1000,
      'result-stale-or-future'
    );
    // Dispatch asks for an investigation; authenticated wrapper logs supply truth.
    const observed = await collectDeploymentInvestigation(input, {
      readGithub,
      readRepair,
      readStepLogs,
      now: input.observedAt,
    });
    investigationAssert(
      isDeepStrictEqual(observed, input),
      'result-does-not-match-observed-diagnostic'
    );
  }
  const original = classifyAndOpenFromDelivery(receipt.event, {
    now: receipt.observedAt,
  });
  const persist = async () => {
    const records = (await loadLoopRecords(stateDir)).filter(
      record => record.rootLoopKey === original.rootLoopKey
    );
    const latest = records.sort(
      (a, b) =>
        b.generation - a.generation ||
        Date.parse(b.observedAt) - Date.parse(a.observedAt)
    )[0];
    investigationAssert(latest, 'persisted-loop-missing');
    if (latest.terminal || latest.outcome !== 'open')
      return { status: 'already-terminal', loop: latest };
    if (dryRun)
      return {
        status: 'dry-run',
        resultKey,
        taskKey: task.taskKey,
        repairState: pr.state,
      };
    // Validate the transition before recording acceptance. Replays use the
    // original base and time, including recovery after an interrupted write.
    let previous = null;
    try {
      previous = JSON.parse(await readFile(resultPath, 'utf8'));
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    const candidate = previous || {
      ...input,
      resultKey,
      taskKey: task.taskKey,
      acceptedAt: now,
      baseLoopKey: latest.loopKey,
      repairState: pr.state,
      externalMutations: 0,
    };
    investigationAssert(
      candidate.resultKey === resultKey && candidate.taskKey === task.taskKey,
      'accepted-result-mismatch'
    );
    const base = records.find(
      record => record.loopKey === candidate.baseLoopKey
    );
    investigationAssert(base, 'accepted-base-loop-missing');
    const next = advanceAttempt(
      { ...base, investigationResultKey: resultKey },
      {
        phase: 'repair-verifying',
        healthy: false,
        reason: `read-only-diagnosis:covered-by-pr:${input.repairPr}@${input.repairHead}`,
        proofTransition: `read-only-investigation:${resultKey}`,
      },
      { now: candidate.acceptedAt }
    );
    investigationAssert(
      next.state === 'repair-verifying' &&
        next.outcome === 'open' &&
        !next.terminal,
      'investigation-transition-not-permitted'
    );
    const accepted = await atomicPersist(resultPath, candidate);
    const persisted = await persistLoopOutcome(next, {
      stateDir,
      queueLockHeld: true,
    });
    return {
      status: accepted.status,
      investigation: accepted.value,
      resultPath,
      loop: persisted.record,
    };
  };
  // Existing queue lock and projector own the only state mutation.
  const result = await withSummerQueueLock(stateDir, persist);
  if (result.loop && !dryRun) {
    const projected = await persistLoopOutcome(result.loop, { stateDir });
    return {
      ...result,
      queue: projected.queue,
      queuePath: projected.queuePath,
    };
  }
  return result;
}

async function main() {
  const option = name =>
    process.argv
      .find(arg => arg.startsWith(`${name}=`))
      ?.slice(name.length + 1);
  if (option('--investigate-controller-run')) {
    investigationAssert(
      ![
        '--event-file',
        '--closure-health-file',
        '--heartbeat-file',
        '--state-dir',
      ].some(option) && !process.argv.includes('--reconcile'),
      'input-modes-conflict'
    );
    const result = await collectDeploymentInvestigation({
      repository: 'JovieInc/Jovie',
      run: Number(option('--investigate-controller-run')),
      attempt: Number(option('--attempt')),
      repairPr: Number(option('--repair-pr')),
      repairHead: option('--repair-head'),
      deploymentUrl: option('--deployment-url'),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
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
    const result = await persistClosureHealthActions(closureHealth, {
      stateDir,
      dryRun: process.argv.includes('--dry-run'),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.failClosed) process.exitCode = 1;
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
  const event = eventFile
    ? JSON.parse(await readFile(eventFile, 'utf8'))
    : null;
  if (event?.action === 'delivery-investigation-result') {
    investigationAssert(
      event.repository?.full_name === 'JovieInc/Jovie',
      'dispatch-repository-invalid'
    );
    const result = await persistDeploymentInvestigation(
      event.client_payload?.investigation,
      { stateDir, dryRun: process.argv.includes('--dry-run') }
    );
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  const receipt = reconcile
    ? reconcileDeliveryHeartbeat(heartbeat)
    : buildDeliveryReceipt(event);
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
