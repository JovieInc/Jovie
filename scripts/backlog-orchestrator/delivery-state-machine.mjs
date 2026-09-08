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
import {
  policyDigest,
  readPrLifecycleContract,
} from '../invariants/pr-lifecycle-contract.mjs';
import {
  FX_BACKSTOP_FAILURES,
  fxBackstopRoute,
} from '../lib/rolling-ci-handoff.mjs';
import {
  classifyAndOpenFromDelivery,
  DELIVERY_WORKFLOW_FAILURES,
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
  const repository =
    repositoryName(payload.repository) ||
    repositoryName(raw.repository?.full_name) ||
    repositoryName(raw.repository) ||
    repositoryName(DEFAULT_DELIVERY_REPOSITORY);
  if (!repository) {
    throw new Error('delivery event requires repository owner/name');
  }
  const deliveryKey =
    nonEmpty(payload.delivery_key) ||
    nonEmpty(payload.event_id) ||
    nonEmpty(raw.delivery_id) ||
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
