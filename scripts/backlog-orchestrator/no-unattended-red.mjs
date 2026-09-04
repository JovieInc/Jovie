#!/usr/bin/env node

/** JOV-INV-017 — Summer No Unattended Red loop. Event classification/dispatch;
 * reconciliation recovers missed events only. Receipts/queue only. */

import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, open, readdir, readFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { OFFICIAL_ROUTING_RECEIPT_SCHEMA } from './symphony-routing.mjs';

export const NO_UNATTENDED_RED_SCHEMA = 'jovie-no-unattended-red/v1';
export const SUMMER_QUEUE_SCHEMA = 'jovie-summer-red-queue/v2';
export const EVIDENCE_TASK_SCHEMA = 'jovie-symphony-evidence-task/v1';
export const ATTEMPT_BUDGET = 3;
export const AUTHORITY_BUDGET = 1;
export const BACKOFF_BASE_MS = 60_000;
export const BACKOFF_MAX_MS = 60 * 60 * 1000;
export const SUMMER_QUEUE_LOCK_TIMEOUT_MS = 30_000;
export const ESCALATION_HANDOFF_SCHEMA = 'jovie-escalation-handoff/v1';
export const DELEGATION_RECEIPT_SCHEMA = 'jovie-delegated-diagnosis/v1';
export const FOUNDER_CONTACT_SCHEMA = 'jovie-founder-contact/v1';
export const NON_PROGRESS_BUDGET = 2;
export const DELEGATION_BUDGET = 1;
export const MAX_DELEGATION_DEPTH = 1;
export const FOUNDER_CONTACT_PRIMARY_CHANNEL = 'ovie-push';
export const ESCALATION_STATES = Object.freeze([
  'running',
  'retrying',
  'escalation-pending',
  'delegated-diagnosis',
  'repair-verifying',
  'resolved',
  'hard-blocked',
]);

const SUMMER_QUEUE_LOCK_HELPER = `import fcntl, sys
with open(sys.argv[1], 'a+', encoding='utf-8') as handle:
    fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
    print('locked', flush=True)
    sys.stdin.buffer.read(1)
`;

// biome-ignore format: compact stall tables for the PR size guard
const ROUTE_TABLE = [
  ['size-guard', 'gem', 'split-source-aligned-size-guard', 'typed-remediation'],
  ['missing-failing-checks', 'symphony', 'create-bounded-ci-repair-pr', 'typed-remediation'],
  ['stale-conflicted-head', 'gem', 'exact-head-branch-update', 'typed-remediation'],
  ['queue-eviction', 'gem', 'reconcile-exact-head-queue-admission', 'typed-remediation'],
  ['production-deployment-unbound', 'gem', 'collect-production-proof', 'collect-evidence'],
  ['provider-unavailable', 'gem', 'restore-provider-availability', 'typed-remediation'],
  ['missing-owner-lease', 'symphony', 'reconcile-exact-head-lease', 'typed-remediation'],
  ['dropped-controller-event', 'gem', 'restore-event-trigger-and-reconcile', 'typed-remediation'],
  ['draft-stack-policy', 'symphony', 'split-or-retarget-draft-stack', 'typed-remediation'], // JOV-INV-020
  ['fleet-observation-gap', 'gem', 'restore-fleet-observation', 'typed-remediation'], // JOV-INV-023
  ['base-not-main', 'gem', 'retarget-pr-base-to-main', 'typed-remediation'], // JOV-INV-023
  ['not-proven', 'controller', 'collect-missing-evidence', 'collect-evidence'],
];
// biome-ignore format: compact stall tables for the PR size guard
const WORKFLOW_STALLS = {
  'PR Size Guard': 'size-guard', CI: 'missing-failing-checks',
  'Production Controller': 'production-deployment-unbound',
  'Merge Queue Auto-Enroll': 'queue-eviction', 'Delivery Control Receipts': 'dropped-controller-event',
  'PR targets main': 'base-not-main',
};
// biome-ignore format: compact stall tables for the PR size guard
const FAILURE_STALLS = {
  'ci-failed': 'missing-failing-checks', 'ci-failed-after-handoff': 'missing-failing-checks',
  'workflow-cancelled': 'dropped-controller-event', 'queue-noop': 'queue-eviction',
  'lease-ambiguous': 'missing-owner-lease', 'stale-config': 'dropped-controller-event',
  'missing-trigger': 'dropped-controller-event', 'fx-auth-missing': 'provider-unavailable',
  'main-unknown': 'fleet-observation-gap', 'queue-unknown': 'fleet-observation-gap',
  'base-not-main': 'base-not-main',
};
// biome-ignore format: compact stall tables for the PR size guard
export const DELIVERY_WORKFLOW_FAILURES = {
  'PR Size Guard': 'size-guard', CI: 'missing-failing-checks',
  'Production Controller': 'production-deployment-unbound',
  'Delivery Control Receipts': 'dropped-controller-event',
};

export const STALL_CLASSES = Object.freeze(ROUTE_TABLE.map(row => row[0]));
const TYPED_ROUTES = Object.freeze(
  Object.fromEntries(
    ROUTE_TABLE.map(([key, owner, action, mode]) => [
      key,
      { owner, action, mode, writer: owner },
    ])
  )
);
const ownerAction = ([key, owner, action]) => [key, { owner, action }];
export const STALL_AUTOMATED_FAILURES = Object.freeze(
  Object.fromEntries(
    ROUTE_TABLE.filter(row => row[3] === 'typed-remediation').map(ownerAction)
  )
);
export const STALL_EVIDENCE_FAILURES = Object.freeze(
  Object.fromEntries(
    ROUTE_TABLE.filter(row => row[3] === 'collect-evidence').map(ownerAction)
  )
);

const QUEUE_KEYS = [
  'repository',
  'issue',
  'issueKey',
  'pr',
  'stallClass',
  'mode',
  'owner',
  'outcome',
  'reason',
  'state',
  'nextProofAt',
  'dispatchState',
  'headSha',
  'leaseKey',
  'action',
  'observedAt',
  'terminal',
];

// biome-ignore format: compact No Unattended Red implementation for the PR size guard
function createApi() {
  const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const text = value => typeof value === 'string' && value.trim() ? value.trim() : null;
  const repoName = value => { const n = text(value); return n && /^[^/\s]+\/[^/\s]+$/.test(n) ? n : null; };
  const repositoryName = signal => repoName(signal.repository) || repoName(signal.repo) || repoName(signal.repositoryNameWithOwner) || repoName(signal.repository?.full_name);
  const sha = value => { const n = text(value)?.toLowerCase(); return n && /^[0-9a-f]{40}$/.test(n) ? n : null; };
  const prn = value => Number.isInteger(value) && value > 0 ? value : null;
  const iso = now => typeof now === 'string' ? now : new Date(now).toISOString();
  const workflowName = signal => text(signal.workflowName) || text(signal.workflow) || text(signal.workflow?.name);
  const identifiedKey = signal => { const repo = repositoryName(signal); return repo && (text(signal.issue) || prn(signal.pr)) ? `${repo}:${text(signal.issue) || `pr:${prn(signal.pr)}`}` : null; };
  const anonymousIdentity = signal => { const repo = repositoryName(signal); return repo ? digest({ repository: repo, stallClass: text(signal.stallClass) || 'not-proven', workflow: workflowName(signal), issue: text(signal.issue), pr: prn(signal.pr), headSha: sha(signal.headSha) }) : null; };
  const scopedDeliveryKey = signal => { const repo = repositoryName(signal); const key = text(signal.deliveryKey); return repo && key ? `${repo}:${key}` : null; };
  const issueKey = signal => text(signal.stallClass) === 'draft-stack-policy' ? scopedDeliveryKey(signal) : identifiedKey(signal) || scopedDeliveryKey(signal) || anonymousIdentity(signal);
  const loopKeyFor = classified => digest({ repository: classified.repository, issueKey: classified.issueKey });
  const leaseKeyFor = classified => digest({ repository: classified.repository, issueKey: classified.issueKey, writer: classified.writer, headSha: classified.headSha });
  const backoffMs = attempt => Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (Math.max(1, Number.isInteger(attempt) ? attempt : 1) - 1));
  const nextProofAt = (observedAt, attempt) => new Date(Date.parse(observedAt) + backoffMs(attempt)).toISOString();
  function transitionRecord(record, changes, discriminator = null) {
    const rootLoopKey = record.rootLoopKey || record.loopKey;
    const next = { ...record, ...changes, rootLoopKey, supersedesLoopKey: record.loopKey, generation: Number(record.generation || 0) + 1 };
    const loopKey = digest({ rootLoopKey, state: next.state, outcome: next.outcome, attempt: next.attempt, reason: next.reason, discriminator });
    return { ...next, loopKey };
  }
  function redactText(value) {
    const normalized = text(value);
    if (!normalized) return null;
    let redacted = normalized
      .replace(/\b(?:github_pat_|gh[opusr]_|lin_api_|sk-)[a-z0-9_.-]+\b/gi, '[REDACTED]')
      .replace(/\bBearer\s+[a-z0-9._~-]+\b/gi, 'Bearer [REDACTED]')
      .replace(/\b(token|secret|password|authorization|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
      .replace(/\/(?:Users|home)\/[^/\s]+/g, '~');
    try {
      const url = new URL(redacted);
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        url.username = '';
        url.password = '';
        url.search = '';
        url.hash = '';
        redacted = url.toString();
      }
    } catch {
      redacted = redacted.replace(/([?&](?:token|key|secret|signature)=)[^&#\s]+/gi, '$1[REDACTED]');
    }
    return redacted.slice(0, 512);
  }
  const redactList = values => [...new Set((Array.isArray(values) ? values : []).map(redactText).filter(Boolean))].slice(0, 10);
  const progressFingerprint = result => {
    const transition = redactText(result?.proofTransition);
    const proof = result?.proof;
    if (transition) return digest({ transition });
    if (proof?.verified !== true) return null;
    const ref = redactText(proof.ref);
    const revision = sha(proof.revision);
    const phase = redactText(proof.phase);
    return ref || revision || phase ? digest({ ref, revision, phase }) : null;
  };
  function buildEscalationHandoff(record, input = {}, { now = new Date().toISOString() } = {}) {
    const object = redactText(input.object) || record.issue || (record.pr ? `pr:${record.pr}` : record.issueKey);
    const environment = redactText(input.environment) || 'unknown';
    const revision = sha(input.revision ?? record.headSha);
    const phase = redactText(input.phase) || record.state || record.dispatchState || 'escalation-pending';
    const failure = redactText(input.failure) || redactText(record.reason) || record.stallClass;
    const attempts = Number.isInteger(input.attempts) ? input.attempts : Number(record.attempt || 0);
    const evidenceRefs = redactList(input.evidenceRefs || record.evidence?.refs);
    const requiredScopes = redactList(input.requiredScopes);
    const exactQuestion = redactText(input.exactQuestion) || `What bounded authority or evidence is required to resolve ${object}?`;
    const escalationKey = digest({ loopKey: record.rootLoopKey || record.loopKey, object, environment, revision, phase, failure });
    return { schema: ESCALATION_HANDOFF_SCHEMA, escalationKey, object, environment, revision, phase, failure, attempts, evidenceRefs, requiredScopes, exactQuestion, redaction: 'applied', createdAt: iso(now) };
  }
  function prepareEscalation(record, reason, now = new Date().toISOString(), input = {}) {
    const exactReason = text(reason) || `escalation-pending:${record.stallClass}`;
    const handoff = buildEscalationHandoff(record, { ...input, failure: exactReason, phase: 'escalation-pending' }, { now });
    return transitionRecord(record, { state: 'escalation-pending', mode: 'authority-blocker', outcome: 'open', terminal: false, dispatchState: 'escalation-pending', action: 'prepare-bounded-escalation', reason: exactReason, observedAt: iso(now), escalation: { key: handoff.escalationKey, status: 'pending', reason: exactReason, owner: record.owner, timeoutAt: nextProofAt(iso(now), Math.max(1, record.attempt || 0)), handoff } }, handoff.escalationKey);
  }
  function isProvenUnhealthy(signal) {
    if (signal.proven === false) return false;
    if (signal.proven === true) return true;
    const failure = text(signal.stallClass) || text(signal.failure);
    if (failure && failure !== 'not-proven') return true;
    if (['failure', 'timed_out', 'cancelled'].includes(signal.conclusion)) return true;
    return ['checksFailing', 'evicted', 'mechanical', 'ownerMissing', 'leaseMissing', 'controllerDropped'].some(key => signal[key] === true) || signal.providerAvailable === false;
  }
  function inferStallClass(signal = {}) {
    const explicit = text(signal.stallClass) || text(signal.failure);
    if (explicit === 'not-proven') return 'not-proven';
    if (explicit && TYPED_ROUTES[explicit]) return explicit;
    if (explicit && FAILURE_STALLS[explicit]) return FAILURE_STALLS[explicit];
    const workflow = workflowName(signal);
    if (workflow && WORKFLOW_STALLS[workflow]) {
      if (signal.conclusion === 'cancelled') return 'dropped-controller-event';
      if (signal.conclusion === 'failure' || signal.conclusion === 'timed_out') return WORKFLOW_STALLS[workflow];
    }
    const mergeState = text(signal.mergeStateStatus)?.toLowerCase();
    const baseRef = text(signal.baseRefName) || text(signal.base);
    if (baseRef && baseRef !== 'main') return 'base-not-main';
    if (signal.observationGap === true) return 'fleet-observation-gap';
    if (mergeState === 'dirty' || mergeState === 'behind') return 'stale-conflicted-head';
    if (signal.queueState === 'UNMERGEABLE' || signal.evicted === true) return 'queue-eviction';
    if (signal.ownerMissing === true || signal.leaseMissing === true) return 'missing-owner-lease';
    if (signal.providerAvailable === false) return 'provider-unavailable';
    if (signal.deployedSha == null && signal.productionClaimed === true) return 'production-deployment-unbound';
    if (signal.checksMissing === true) return 'not-proven';
    if (signal.checksFailing === true) return 'missing-failing-checks';
    if (signal.controllerDropped === true) return 'dropped-controller-event';
    return 'not-proven';
  }
  function classifyStall(raw = {}, { now = new Date().toISOString() } = {}) {
    const signal = raw.event && typeof raw.event === 'object' ? { ...raw, ...raw.event } : raw;
    const proven = isProvenUnhealthy(signal);
    const stallClass = proven ? inferStallClass(signal) : 'not-proven';
    const typed = TYPED_ROUTES[stallClass];
    const mechanical = stallClass === 'size-guard' && signal.mechanical === true && proven;
    const evidenceMode = stallClass === 'not-proven' || typed.mode === 'collect-evidence' || (stallClass === 'size-guard' && !mechanical);
    const mode = evidenceMode ? 'collect-evidence' : typed.mode;
    const action = evidenceMode ? (stallClass === 'size-guard' ? 'verify-mechanical-size-guard' : typed.mode === 'collect-evidence' ? typed.action : 'collect-missing-evidence') : typed.action;
    const pr = prn(signal.pr_number ?? signal.pr);
    const headSha = sha(signal.head_sha ?? signal.headSha ?? signal.head);
    const issue = text(signal.issue_identifier) || text(signal.issue);
    const workflow = workflowName(signal);
    const repository = repositoryName(signal);
    const deliveryKey = text(signal.delivery_key) || text(signal.deliveryKey) || text(signal.event_id) || anonymousIdentity({ repository, stallClass, workflowName: workflow, issue, pr, headSha });
    return { schema: NO_UNATTENDED_RED_SCHEMA, repository, stallClass, mode, owner: typed.owner, writer: typed.writer, action, issue, pr, headSha, workflow, deliveryKey, issueKey: issueKey({ repository, issue, pr, deliveryKey, stallClass, headSha, workflowName: workflow }), proven, mechanical, observedAt: iso(now), mergeQueueIndependent: true, evidence: signal.evidence && typeof signal.evidence === 'object' ? signal.evidence : {} };
  }
  function assertNoUnattendedRed(records) {
    const silent = (records || []).filter(record => {
      if (record.outcome === 'healthy') return false;
      if (record.outcome === 'escalated') return !repoName(record.repository) || !record.reason || !record.escalation?.reason;
      return record.outcome !== 'open' || !repoName(record.repository) || !record.issueKey || !record.owner || !record.leaseKey || !record.nextProofAt || !record.action || !record.writer;
    });
    if (silent.length > 0) throw new Error(`unattended red: ${silent.map(item => item.issueKey || item.loopKey).join(',')}`);
    return true;
  }
  function openLoopRecord(classified, { existing = null, now = classified.observedAt, attempt = 0 } = {}) {
    if (existing?.schema === NO_UNATTENDED_RED_SCHEMA && existing.repository === classified.repository) {
      if (existing.outcome === 'healthy' || existing.outcome === 'escalated') return existing;
      return { ...existing, duplicate: true, observedAt: iso(now) };
    }
    const observedAt = iso(now);
    const loopKey = loopKeyFor(classified);
    const record = { schema: NO_UNATTENDED_RED_SCHEMA, repository: classified.repository, loopKey, rootLoopKey: loopKey, generation: 0, leaseKey: leaseKeyFor(classified), stallClass: classified.stallClass, state: 'running', mode: classified.mode, owner: classified.owner, writer: classified.writer, action: classified.action, issue: classified.issue, issueKey: classified.issueKey, pr: classified.pr, headSha: classified.headSha, workflow: classified.workflow || null, deliveryKey: classified.deliveryKey, proven: classified.proven === true, mechanical: classified.mechanical === true, attempt, attemptBudget: ATTEMPT_BUDGET, authorityBudget: AUTHORITY_BUDGET, nonProgressBudget: NON_PROGRESS_BUDGET, nonProgressCount: 0, delegationBudget: DELEGATION_BUDGET, delegationDepth: 0, maxDelegationDepth: MAX_DELEGATION_DEPTH, backoffMs: backoffMs(Math.max(1, attempt)), nextProofAt: nextProofAt(observedAt, Math.max(1, attempt)), outcome: 'open', dispatchState: 'classified', terminal: false, externalMutations: 0, observedAt, reason: `${classified.stallClass}:${classified.action}`, evidence: classified.evidence };
    assertNoUnattendedRed([record]);
    return record;
  }
  function dispatchOpenRecords(records, { capacity = 0, now = new Date().toISOString(), mergeQueueState = null } = {}) {
    void mergeQueueState;
    const measured = Number.isInteger(capacity) && capacity >= 0 ? capacity : 0;
    const dispatched = []; const deferred = [];
    for (const record of records) {
      if (record.outcome !== 'open' || record.terminal || record.mode === 'authority-blocker') { deferred.push(record); continue; }
      const over = dispatched.length >= measured;
      (over ? deferred : dispatched).push({ ...record, state: over ? 'retrying' : 'running', dispatchState: over ? 'capacity-queued' : 'dispatched', observedAt: iso(now) });
    }
    return { dispatched, deferred, capacity: measured, mergeQueueIndependent: true };
  }
  function markNotProven(record, reason, now) {
    const classified = classifyStall({ ...record, stallClass: 'not-proven', proven: false, failure: 'not-proven' }, { now });
    return transitionRecord(record, { repository: classified.repository, issueKey: classified.issueKey, stallClass: 'not-proven', state: 'repair-verifying', mode: 'collect-evidence', owner: classified.owner, writer: classified.writer, action: classified.action, proven: false, dispatchState: 'classified', outcome: 'open', terminal: false, reason, observedAt: iso(now), nextProofAt: nextProofAt(iso(now), Math.max(1, record.attempt || 0)) }, sha(record.headSha));
  }
  function requalifyExactHead(record, liveHead, { now = new Date().toISOString() } = {}) {
    const live = sha(liveHead);
    if (!live) return markNotProven(record, 'missing-live-head', now);
    if (sha(record.headSha) === live) return record;
    return markNotProven({ ...record, headSha: live, leaseKey: leaseKeyFor({ ...record, headSha: live }) }, 'exact-head-changed-requalify', now);
  }
  function escalate(record, reason, now = new Date().toISOString(), input = {}) {
    const exactReason = text(reason) || `escalated:${record.stallClass}`;
    const handoff = buildEscalationHandoff(record, { ...input, failure: exactReason, phase: 'hard-blocked' }, { now });
    return transitionRecord(record, { state: 'hard-blocked', mode: 'authority-blocker', outcome: 'escalated', terminal: true, dispatchState: 'escalated', action: 'visible-founder-review', reason: exactReason, authorityBudget: 0, observedAt: iso(now), escalation: { key: handoff.escalationKey, repository: record.repository, status: 'hard-blocked', reason: exactReason, stallClass: record.stallClass, issue: record.issue, pr: record.pr, headSha: record.headSha, attempts: record.attempt, owner: record.owner, writer: record.writer, leaseKey: record.leaseKey, handoff } }, handoff.escalationKey);
  }
  function advanceAttempt(record, result, { now = new Date().toISOString() } = {}) {
    if (record.state === 'resolved' || record.state === 'hard-blocked' || record.outcome === 'healthy' || record.outcome === 'escalated') return record;
    const fingerprint = progressFingerprint(result);
    if (result?.healthy === true && result.exitCode === 0 && fingerprint) {
      return transitionRecord(record, { state: 'resolved', outcome: 'healthy', terminal: true, dispatchState: 'complete', reason: result.reason || 'proven-healthy', lastProgressFingerprint: fingerprint, observedAt: iso(now) }, fingerprint);
    }
    if (result?.requalifyHead) return requalifyExactHead(record, result.requalifyHead, { now });
    const attempt = (record.attempt || 0) + 1;
    if (result?.authorityExhausted === true) return escalate(record, `authority-budget-exhausted:${record.stallClass}`, now);
    const sameClass = !result?.failureClass || result.failureClass === record.stallClass;
    const progressed = Boolean(fingerprint && fingerprint !== record.lastProgressFingerprint);
    const nonProgressCount = progressed || !sameClass ? 0 : Number(record.nonProgressCount || 0) + 1;
    const reason = result?.healthy === true ? 'success-unproven' : result?.timedOut === true ? `repair-timeout:${record.stallClass}` : result?.reason || record.reason;
    const attempted = { ...record, attempt, nonProgressCount, lastProgressFingerprint: fingerprint || record.lastProgressFingerprint || null, reason };
    if (attempt >= record.attemptBudget) return prepareEscalation(attempted, `retry-budget-exhausted:${record.stallClass}`, now, result?.handoff);
    if (nonProgressCount >= record.nonProgressBudget) return prepareEscalation(attempted, `nonprogress-budget-exhausted:${record.stallClass}`, now, result?.handoff);
    const state = result?.phase === 'repair-verifying' ? 'repair-verifying' : 'retrying';
    return transitionRecord(attempted, { state, backoffMs: backoffMs(attempt), nextProofAt: nextProofAt(iso(now), attempt), dispatchState: state === 'repair-verifying' ? 'verifying' : 'backoff', outcome: 'open', terminal: false, observedAt: iso(now) }, fingerprint || `attempt:${attempt}`);
  }
  function planDelegatedDiagnosis(record, input = {}, { now = new Date().toISOString() } = {}) {
    const target = text(input.target);
    const ancestry = redactList(input.ancestry);
    const route = input.route;
    const officialRoute = route?.schema === OFFICIAL_ROUTING_RECEIPT_SCHEMA && route.phase === 'prepared' && route.terminalOutcome == null && text(route.modelId) && text(route.modelTier);
    const registryRoute = route?.schema_version === 1 && route.deterministic_first === true && route.workflow === 'remediation' && text(route.selected?.id) && text(route.selected?.provider) && text(route.selected?.model) && Array.isArray(route.candidates) && route.candidates.some(candidate => candidate?.id === route.selected.id && candidate?.status === 'ready');
    const eligibleRoute = input.routeVerified === true && (officialRoute || registryRoute);
    const normalizedRoute = officialRoute
      ? { schema: route.schema, attemptId: route.attemptId, modelId: route.modelId, modelTier: route.modelTier, provider: 'codex', reasoningEffort: route.reasoningEffort, escalation: route.escalation }
      : registryRoute
        ? { schema: 'gem-model-router-selection/v1', attemptId: null, modelId: route.selected.id, modelTier: null, provider: route.selected.provider, channel: route.selected.channel, capability: route.capability, escalation: { status: 'alternate-provider' } }
        : null;
    const reasons = [];
    if (record.state !== 'escalation-pending') reasons.push('escalation-pending-required');
    if (input.deterministicExhausted !== true) reasons.push('deterministic-remediation-not-exhausted');
    if (!['gem', 'symphony'].includes(target)) reasons.push('delegate-not-allowed');
    if (target === record.owner || target === record.writer || ancestry.includes(target)) reasons.push('self-or-loop-delegation-denied');
    if (Number(record.delegationBudget || 0) <= 0) reasons.push('delegation-budget-exhausted');
    if (Number(record.delegationDepth || 0) >= Number(record.maxDelegationDepth || MAX_DELEGATION_DEPTH)) reasons.push('delegation-depth-exhausted');
    if (!eligibleRoute) reasons.push('verified-canonical-model-route-required');
    const delegationKey = digest({ escalationKey: record.escalation?.key || record.loopKey, target, attemptId: normalizedRoute?.attemptId || normalizedRoute?.modelId || null });
    if (record.delegation?.delegationKey === delegationKey && record.delegation.status === 'delegated') return { status: 'duplicate', reason: 'idempotent-delegation', record };
    if (reasons.length > 0) {
      const receipt = { schema: DELEGATION_RECEIPT_SCHEMA, delegationKey, status: 'denied', reasons, target, reconcileOwner: record.owner, writer: record.writer, leaseKey: record.leaseKey, createdAt: iso(now), externalMutations: 0 };
      return { status: 'denied', reason: reasons[0], record: transitionRecord(record, { delegation: receipt, observedAt: iso(now) }, delegationKey) };
    }
    const receipt = { schema: DELEGATION_RECEIPT_SCHEMA, delegationKey, status: 'delegated', target, reconcileOwner: record.owner, writer: record.writer, leaseKey: record.leaseKey, depth: Number(record.delegationDepth || 0) + 1, maxDepth: Number(record.maxDelegationDepth || MAX_DELEGATION_DEPTH), timeoutAt: nextProofAt(iso(now), 1), route: normalizedRoute, ancestry: [...ancestry, record.owner].filter(Boolean), createdAt: iso(now), externalMutations: 0 };
    return { status: 'delegated', reason: 'bounded-delegated-diagnosis', record: transitionRecord(record, { state: 'delegated-diagnosis', mode: 'typed-remediation', action: 'bounded-delegated-diagnosis', dispatchState: 'delegated', delegationBudget: Number(record.delegationBudget || 0) - 1, delegationDepth: receipt.depth, delegation: receipt, observedAt: iso(now) }, delegationKey) };
  }
  function planFounderContact(record, input = {}, { existing = record.escalation?.founderContact || null, now = new Date().toISOString() } = {}) {
    const severity = text(input.severity);
    const handoff = record.escalation?.handoff || buildEscalationHandoff(record, input.handoff, { now });
    const contactKey = digest({ escalationKey: handoff.escalationKey, channel: FOUNDER_CONTACT_PRIMARY_CHANNEL });
    if (existing?.schema === FOUNDER_CONTACT_SCHEMA && existing.contactKey === contactKey && existing.status !== 'blocked') return { status: 'duplicate', reason: 'idempotent-founder-contact', contact: existing, record };
    const reasons = [];
    const reviewOpenedAt = Date.parse(input.founderReviewOpenedAt);
    const ackWindowMs = Number(input.ackWindowMs || 15 * 60 * 1000);
    const cooldownMs = Number(input.cooldownMs || 60 * 60 * 1000);
    if (record.state !== 'hard-blocked') reasons.push('hard-blocked-state-required');
    if (!['production', 'security', 'data-loss', 'revenue-critical'].includes(severity)) reasons.push('critical-severity-not-proven');
    if (input.recoveryExhausted !== true) reasons.push('recovery-not-exhausted');
    if (input.safeRollbackAvailable !== false || input.featureFlagAvailable !== false) reasons.push('safe-containment-available-or-unproven');
    if (!Number.isFinite(reviewOpenedAt) || !Number.isFinite(ackWindowMs) || ackWindowMs <= 0 || ackWindowMs > 24 * 60 * 60 * 1000 || Date.parse(iso(now)) < reviewOpenedAt + ackWindowMs || input.acknowledged === true) reasons.push('founder-review-ack-window-not-exhausted');
    if (input.destination !== 'ovie' || input.destinationConsented !== true) reasons.push('ovie-destination-or-consent-unavailable');
    if (input.provider !== FOUNDER_CONTACT_PRIMARY_CHANNEL || input.providerAllowed !== true) reasons.push('ovie-push-provider-denied');
    if (!Number.isFinite(cooldownMs) || cooldownMs <= 0 || cooldownMs > 24 * 60 * 60 * 1000) reasons.push('founder-contact-cooldown-invalid');
    if (existing?.status !== 'blocked' && existing?.cooldownUntil && Date.parse(existing.cooldownUntil) > Date.parse(iso(now))) reasons.push('founder-contact-cooldown-active');
    const status = reasons.length > 0 ? 'blocked' : 'planned';
    const contact = { schema: FOUNDER_CONTACT_SCHEMA, contactKey, status, reason: reasons[0] || 'critical-founder-contact-planned', reasons, channel: FOUNDER_CONTACT_PRIMARY_CHANNEL, destinationRef: input.destination === 'ovie' ? 'ovie-founder-surface' : null, severity, writer: record.writer, leaseKey: record.leaseKey, dispatchAuthorized: false, allowedActions: ['ack', 'snooze', 'resolve'], fallbacks: { text: { status: 'inactive', activation: 'explicit-required' }, call: { status: 'inactive', activation: 'explicit-required' } }, payload: { object: handoff.object, environment: handoff.environment, revision: handoff.revision, failure: handoff.failure, evidenceRefs: handoff.evidenceRefs, exactQuestion: handoff.exactQuestion }, receipts: [{ status, observedAt: iso(now), evidence: status === 'blocked' ? reasons[0] : 'policy-gates-satisfied' }], cooldownUntil: status === 'planned' ? new Date(Date.parse(iso(now)) + cooldownMs).toISOString() : null, externalMutations: 0 };
    const updated = transitionRecord(record, { escalation: { ...record.escalation, founderContact: contact }, observedAt: iso(now) }, contactKey);
    return { status, reason: contact.reason, contact, record: updated };
  }
  function transitionFounderContact(contact, event = {}, { now = new Date().toISOString() } = {}) {
    if (contact?.schema !== FOUNDER_CONTACT_SCHEMA) return { status: 'denied', reason: 'founder-contact-receipt-required', contact };
    const type = text(event.type);
    if (contact.status === 'acknowledged') return { status: 'duplicate', reason: 'founder-contact-already-acknowledged', contact };
    const deny = reason => ({ status: 'denied', reason, contact: { ...contact, receipts: [...contact.receipts, { status: 'blocked', observedAt: iso(now), evidence: reason }] } });
    if (type === 'dispatched') {
      const receipt = redactText(event.receipt);
      if (contact.status !== 'planned' || event.observed !== true || !receipt) return deny('dispatch-observation-proof-required');
      const next = { ...contact, status: 'dispatched', dispatchReceipt: receipt, receipts: [...contact.receipts, { status: 'dispatched', observedAt: iso(now), evidence: receipt }] };
      return { status: 'dispatched', contact: next };
    }
    if (type === 'delivered') {
      const receipt = redactText(event.receipt);
      if (contact.status !== 'dispatched' || event.observed !== true || !receipt) return deny('delivery-observation-proof-required');
      const next = { ...contact, status: 'delivered', deliveryReceipt: receipt, receipts: [...contact.receipts, { status: 'delivered', observedAt: iso(now), evidence: receipt }] };
      return { status: 'delivered', contact: next };
    }
    if (['ack', 'snooze', 'resolve'].includes(type)) {
      if (!['planned', 'dispatched', 'delivered'].includes(contact.status)) return deny('acknowledgeable-contact-required');
      const receipt = redactText(event.receipt);
      if (event.observed !== true || !receipt) return deny('founder-ack-observation-proof-required');
      const acknowledgement = { action: type, observedAt: iso(now), receipt, snoozeUntil: type === 'snooze' ? redactText(event.snoozeUntil) : null };
      const next = { ...contact, status: 'acknowledged', acknowledgement, receipts: [...contact.receipts, { status: 'acknowledged', observedAt: iso(now), evidence: receipt }] };
      return { status: 'acknowledged', contact: next };
    }
    if (type === 'call-escalation') {
      if (event.explicitActivation !== true || contact.fallbacks?.call?.status !== 'active') return deny('call-fallback-not-activated');
      const next = { ...contact, status: 'call-escalation', receipts: [...contact.receipts, { status: 'call-escalation', observedAt: iso(now), evidence: 'explicit-activation-receipt' }] };
      return { status: 'call-escalation', contact: next };
    }
    return deny('founder-contact-transition-denied');
  }
  function sourceAlignment(path) {
    const normalized = text(path)?.replaceAll('\\', '/');
    if (!normalized) return 'root';
    const [root, child] = normalized.split('/');
    if (['apps', 'packages', 'scripts'].includes(root) && child) return `${root}/${child}`;
    if (['.github', 'docs', 'canon'].includes(root)) return root;
    return root;
  }
  function splitSizeGuardChange(files, { mechanical = false } = {}) {
    if (mechanical !== true) throw new Error('size-guard split requires verified mechanical failure');
    const groups = new Map();
    for (const file of files) { const path = text(file); if (!path) continue; const alignment = sourceAlignment(path); groups.set(alignment, [...(groups.get(alignment) || []), path]); }
    return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([alignment, groupFiles]) => ({ alignment, files: groupFiles, preserveBehavior: true, requalify: true, proven: false, stallClass: 'not-proven', mode: 'collect-evidence' }));
  }
  function reconcileMissedEvents(persistedRecords, observedSignals, { now = new Date().toISOString() } = {}) {
    const persisted = new Set((persistedRecords || []).map(record => record.issueKey || record.loopKey));
    const persistedAnonymous = new Set((persistedRecords || []).filter(record => !identifiedKey(record)).map(record => anonymousIdentity(record)).filter(Boolean));
    return (observedSignals || []).map(signal => classifyStall(signal, { now })).filter(classified => !persisted.has(classified.issueKey) && (identifiedKey(classified) || !persistedAnonymous.has(anonymousIdentity(classified)))).map(classified => openLoopRecord(classified, { now }));
  }
  function preferQueueRecord(left, right) {
    if (left.rootLoopKey && left.rootLoopKey === right.rootLoopKey) {
      const leftGeneration = Number(left.generation || 0);
      const rightGeneration = Number(right.generation || 0);
      if (rightGeneration !== leftGeneration) return rightGeneration > leftGeneration ? right : left;
    }
    const rank = record => (record.outcome === 'escalated' ? 2 : record.outcome === 'open' ? 1 : 0);
    if (rank(right) !== rank(left)) return rank(right) > rank(left) ? right : left;
    return `${right.observedAt || ''}`.localeCompare(`${left.observedAt || ''}`) >= 0 ? right : left;
  }
  function preferDraftStackRecord(left, right) {
    const observed = `${right.observedAt || ''}`.localeCompare(`${left.observedAt || ''}`);
    if (observed !== 0) return observed > 0 ? right : left;
    if (right.outcome === 'healthy' && left.outcome !== 'healthy') return right;
    if (left.outcome === 'healthy' && right.outcome !== 'healthy') return left;
    return preferQueueRecord(left, right);
  }
  function draftStackRecordVisibleForAuthority(record, authority) {
    if (record.stallClass !== 'draft-stack-policy' || !authority) return true;
    const authorityAt = Date.parse(authority?.observedAt);
    return record.draftStackGeneration === authority.snapshotKey || (!record.draftStackGeneration && Date.parse(record.observedAt) < authorityAt);
  }
  function projectSummerQueue(records, { now = new Date().toISOString() } = {}) {
    const source = [...(records || [])];
    const collapsed = new Map();
    const draftStacks = new Map();
    for (const record of source) {
      if (!repoName(record.repository)) continue;
      if (record.stallClass === 'draft-stack-policy' && prn(record.pr)) {
        const key = `draft-stack:${record.repository}:${record.pr}`;
        draftStacks.set(
          key,
          draftStacks.has(key)
            ? preferDraftStackRecord(draftStacks.get(key), record)
            : record
        );
        continue;
      }
      const key = identifiedKey(record) || anonymousIdentity(record) || record.loopKey;
      collapsed.set(key, collapsed.has(key) ? preferQueueRecord(collapsed.get(key), record) : record);
    }
    for (const [key, record] of draftStacks) {
      if (record.outcome !== 'healthy') collapsed.set(key, record);
    }
    const items = [...collapsed.values()].filter(record => record.outcome !== 'healthy').sort((left, right) => `${left.issueKey}:${left.observedAt}`.localeCompare(`${right.issueKey}:${right.observedAt}`)).map(record => ({ ...Object.fromEntries(QUEUE_KEYS.map(key => [key, record[key]])), issue: record.issue, stallClass: record.stallClass, outcome: record.outcome, escalation: record.escalation || null }));
    const terminalTombstones = [
      ...[...collapsed.values()].filter(record => record.outcome === 'healthy'),
      ...[...draftStacks.values()].filter(record => record.outcome === 'healthy'),
    ].map(record => ({ ...Object.fromEntries(QUEUE_KEYS.map(key => [key, record[key]])), issue: record.issue, pr: record.pr, outcome: record.outcome, terminal: record.terminal, observedAt: record.observedAt, reason: record.reason }));
    return { schema: SUMMER_QUEUE_SCHEMA, authority: 'Summer', observedAt: iso(now), items, terminalTombstones, counts: { open: items.filter(item => item.outcome === 'open').length, healthy: 0, escalated: items.filter(item => item.outcome === 'escalated').length, terminalHidden: terminalTombstones.length } };
  }
  function evidenceTaskForRecord(record) {
    if (record.mode !== 'collect-evidence' || record.outcome !== 'open') return null;
    return { schema: EVIDENCE_TASK_SCHEMA, repository: record.repository, taskKey: digest({ repository: record.repository, loopKey: record.loopKey, action: record.action }), createdAt: record.observedAt, loopKey: record.loopKey, owner: record.owner, action: record.action, issue: record.issue, pr: record.pr, headSha: record.headSha, stallClass: record.stallClass, safety: 'missing-evidence-is-not-a-repair-claim' };
  }
  async function atomicWrite(destination, value, flags) {
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    const handle = await open(destination, flags, 0o600);
    try { await handle.writeFile(`${JSON.stringify(value)}\n`, 'utf8'); } finally { await handle.close(); }
  }
  async function atomicCreate(destination, value) {
    try { await atomicWrite(destination, value, 'wx'); return { status: 'created', path: destination, value }; }
    catch (error) { if (error?.code !== 'EEXIST') throw error; return { status: 'duplicate', path: destination, value: JSON.parse(await readFile(destination, 'utf8')) }; }
  }
  async function loadLoopRecords(stateDir) {
    try {
      const records = [];
      for (const name of await readdir(join(stateDir, 'red-loop'))) {
        if (name.endsWith('.json')) records.push(JSON.parse(await readFile(join(stateDir, 'red-loop', name), 'utf8')));
      }
      return records;
    } catch (error) { if (error?.code === 'ENOENT') return []; throw error; }
  }
  async function readSummerQueue(stateDir) {
    try { return JSON.parse(await readFile(join(stateDir, 'summer-queue.json'), 'utf8')); }
    catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
  }
  async function withSummerQueueLock(
    stateDir,
    callback,
    { timeoutMs = SUMMER_QUEUE_LOCK_TIMEOUT_MS } = {}
  ) {
    await mkdir(stateDir, { recursive: true, mode: 0o700 });
    const lockPath = join(stateDir, '.summer-queue.lock');
    const child = spawn('python3', ['-c', SUMMER_QUEUE_LOCK_HELPER, lockPath], { stdio: ['pipe', 'pipe', 'pipe'] });
    const closed = once(child, 'close');
    let stderr = '';
    child.stderr.setEncoding('utf8'); child.stderr.on('data', chunk => { stderr += chunk; });
    let timer; let locked = false;
    try {
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`summer queue writer lock timed out: ${lockPath}`)); }, timeoutMs);
      });
      const ready = await Promise.race([
        once(child.stdout, 'data').then(([chunk]) => `${chunk}`),
        closed.then(([code]) => { throw new Error(`summer queue writer lock helper exited ${code}: ${stderr.trim()}`); }),
        timeout,
      ]);
      if (!ready.includes('locked')) throw new Error(`summer queue writer lock helper malformed output: ${ready.trim()}`);
      clearTimeout(timer);
      locked = true;
      return await callback();
    } finally {
      clearTimeout(timer);
      if (child.exitCode == null) child.stdin.end();
      const [code] = child.exitCode == null ? await closed : [child.exitCode];
      if (locked && code !== 0) throw new Error(`summer queue writer lock helper exited ${code}: ${stderr.trim()}`);
    }
  }
  async function writeSummerQueue(stateDir, observedAt, draftStackAuthority = null) {
    const records = await loadLoopRecords(stateDir);
    const current = await readSummerQueue(stateDir);
    const authority = draftStackAuthority || current?.draftStackAuthority || null;
    const visibleRecords = records.filter(record => draftStackRecordVisibleForAuthority(record, authority));
    const queueObservedAt = visibleRecords.reduce(
      (latest, record) => Date.parse(record.observedAt) > Date.parse(latest) ? record.observedAt : latest,
      Date.parse(current?.observedAt) > Date.parse(observedAt) ? current.observedAt : observedAt
    );
    const queue = projectSummerQueue(visibleRecords, { now: queueObservedAt });
    queue.draftStackAuthority = authority;
    const queuePath = join(stateDir, 'summer-queue.json');
    const temporary = `${queuePath}.${randomBytes(8).toString('hex')}.tmp`;
    await atomicWrite(temporary, queue, 'w');
    await rename(temporary, queuePath);
    return { queue, queuePath };
  }
  async function persistLoopOutcome(record, { stateDir = '', dryRun = false, beforeProject = null, reactivateDraftStack = false, queueLockHeld = false } = {}) {
    assertNoUnattendedRed([record]);
    const destination = join(stateDir, 'red-loop', `${record.loopKey}.json`);
    let recordPath = destination;
    const evidence = evidenceTaskForRecord(record);
    const evidencePath = evidence ? join(stateDir, 'evidence-tasks', `${evidence.taskKey}.json`) : null;
    if (dryRun) return { status: 'dry-run', record, recordPath: destination, evidence, evidencePath };
    const persist = async () => {
      let persisted = await atomicCreate(destination, record);
      if (reactivateDraftStack && persisted.status === 'duplicate') {
        const latest = (await loadLoopRecords(stateDir))
          .filter(item => item.stallClass === 'draft-stack-policy' && item.pr === record.pr && item.repository === record.repository)
          .reduce((current, item) => current ? preferDraftStackRecord(current, item) : item, null);
        if (
          latest &&
          Date.parse(record.observedAt) > Date.parse(latest.observedAt)
        ) {
          const reactivated = {
            ...record,
            loopKey: digest({ supersedes: latest.loopKey, deliveryKey: record.deliveryKey, observedAt: record.observedAt }),
            supersedesLoopKey: latest.loopKey,
          };
          recordPath = join(stateDir, 'red-loop', `${reactivated.loopKey}.json`);
          persisted = await atomicCreate(recordPath, reactivated);
        }
      }
      const persistedEvidence = evidence ? await atomicCreate(evidencePath, evidence) : null;
      if (typeof beforeProject === 'function') await beforeProject();
      if (queueLockHeld) {
        return { status: persisted.status, record: persisted.value, recordPath, evidence: persistedEvidence?.value || null, evidencePath, queue: null, queuePath: null };
      }
      const { queue, queuePath } = await writeSummerQueue(stateDir, record.observedAt);
      return { status: persisted.status, record: persisted.value, recordPath, evidence: persistedEvidence?.value || null, evidencePath, queue, queuePath };
    };
    return queueLockHeld ? persist() : withSummerQueueLock(stateDir, persist);
  }
  async function persistDraftStackResolutions(
    activeRoots,
    { stateDir = '', dryRun = false, now = new Date().toISOString(), queueLockHeld = false, draftStackAuthority = null, repository = null } = {}
  ) {
    if (activeRoots == null) {
      return { status: 'unobserved', resolved: [], queue: null, queuePath: null };
    }
    const roots = new Set(
      [...(activeRoots || [])].map(root => {
        const parsed = prn(root);
        if (!parsed) throw new Error('active draft stack root is invalid');
        return parsed;
      })
    );
    if (dryRun) return { status: 'dry-run', resolved: [], queue: null, queuePath: null };
    const persist = async () => {
      const resolutionObservedAt = iso(now);
      const records = await loadLoopRecords(stateDir);
      const latest = new Map();
      const visibleLatest = new Map();
      const scopedRepository = repoName(repository);
      for (const record of records) {
        if (record.stallClass !== 'draft-stack-policy' || !prn(record.pr) || !repoName(record.repository)) continue;
        if (scopedRepository && record.repository !== scopedRepository) continue;
        const root = prn(record.pr);
        const key = `${record.repository}:${root}`;
        latest.set(
          key,
          latest.has(key)
            ? preferDraftStackRecord(latest.get(key), record)
            : record
        );
        if (draftStackRecordVisibleForAuthority(record, draftStackAuthority)) {
          visibleLatest.set(
            key,
            visibleLatest.has(key)
              ? preferDraftStackRecord(visibleLatest.get(key), record)
              : record
          );
        }
      }
      const resolved = [];
      for (const [key, record] of latest) {
        const root = prn(record.pr);
        const visibleRecord = visibleLatest.get(key);
        const resolutionRecord = record.outcome === 'healthy' && !draftStackRecordVisibleForAuthority(record, draftStackAuthority)
          ? visibleRecord
          : record;
        if (!resolutionRecord || roots.has(root) || resolutionRecord.outcome === 'healthy' || !(Date.parse(resolutionObservedAt) > Date.parse(resolutionRecord.observedAt))) continue;
        const tombstone = {
          ...resolutionRecord,
          loopKey: digest({ supersedes: resolutionRecord.loopKey, outcome: 'healthy', observedAt: resolutionObservedAt }),
          issueKey: `draft-stack-resolved:${root}:${resolutionObservedAt}`,
          outcome: 'healthy',
          terminal: true,
          dispatchState: 'complete',
          observedAt: resolutionObservedAt,
          reason: 'draft-stack-policy-current-action-absent',
          supersedesLoopKey: resolutionRecord.loopKey,
          draftStackGeneration: draftStackAuthority?.snapshotKey || resolutionRecord.draftStackGeneration || null,
          externalMutations: 0,
        };
        const destination = join(stateDir, 'red-loop', `${tombstone.loopKey}.json`);
        const persisted = await atomicCreate(destination, tombstone);
        resolved.push({ rootPr: root, status: persisted.status, record: persisted.value });
      }
      const { queue, queuePath } = await writeSummerQueue(stateDir, resolutionObservedAt, draftStackAuthority);
      return { status: resolved.length ? 'resolved' : 'unchanged', resolved, queue, queuePath };
    };
    return queueLockHeld ? persist() : withSummerQueueLock(stateDir, persist);
  }
  const classifyAndOpenFromDelivery = (input, options = {}) => openLoopRecord(classifyStall(input, options), options);
  return { inferStallClass, classifyStall, loopKeyFor, leaseKeyFor, backoffMs, openLoopRecord, dispatchOpenRecords, requalifyExactHead, buildEscalationHandoff, prepareEscalation, escalate, advanceAttempt, planDelegatedDiagnosis, planFounderContact, transitionFounderContact, sourceAlignment, splitSizeGuardChange, reconcileMissedEvents, projectSummerQueue, assertNoUnattendedRed, evidenceTaskForRecord, loadLoopRecords, readSummerQueue, persistLoopOutcome, persistDraftStackResolutions, withSummerQueueLock, classifyAndOpenFromDelivery };
}

const api = createApi();
export const inferStallClass = api.inferStallClass;
export const classifyStall = api.classifyStall;
export const loopKeyFor = api.loopKeyFor;
export const leaseKeyFor = api.leaseKeyFor;
export const backoffMs = api.backoffMs;
export const openLoopRecord = api.openLoopRecord;
export const dispatchOpenRecords = api.dispatchOpenRecords;
export const requalifyExactHead = api.requalifyExactHead;
export const buildEscalationHandoff = api.buildEscalationHandoff;
export const prepareEscalation = api.prepareEscalation;
export const escalate = api.escalate;
export const advanceAttempt = api.advanceAttempt;
export const planDelegatedDiagnosis = api.planDelegatedDiagnosis;
export const planFounderContact = api.planFounderContact;
export const transitionFounderContact = api.transitionFounderContact;
export const sourceAlignment = api.sourceAlignment;
export const splitSizeGuardChange = api.splitSizeGuardChange;
export const reconcileMissedEvents = api.reconcileMissedEvents;
export const projectSummerQueue = api.projectSummerQueue;
export const assertNoUnattendedRed = api.assertNoUnattendedRed;
export const evidenceTaskForRecord = api.evidenceTaskForRecord;
export const loadLoopRecords = api.loadLoopRecords;
export const readSummerQueue = api.readSummerQueue;
export const persistLoopOutcome = api.persistLoopOutcome;
export const persistDraftStackResolutions = api.persistDraftStackResolutions;
export const withSummerQueueLock = api.withSummerQueueLock;
export const classifyAndOpenFromDelivery = api.classifyAndOpenFromDelivery;
