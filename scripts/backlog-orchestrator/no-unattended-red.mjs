#!/usr/bin/env node

/** JOV-INV-017 — Summer No Unattended Red loop. Event classification/dispatch;
 * reconciliation recovers missed events only. Receipts/queue only. */

import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, open, readdir, readFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const NO_UNATTENDED_RED_SCHEMA = 'jovie-no-unattended-red/v1';
export const SUMMER_QUEUE_SCHEMA = 'jovie-summer-red-queue/v2';
export const EVIDENCE_TASK_SCHEMA = 'jovie-symphony-evidence-task/v1';
export const ATTEMPT_BUDGET = 3;
export const AUTHORITY_BUDGET = 1;
export const BACKOFF_BASE_MS = 60_000;
export const BACKOFF_MAX_MS = 60 * 60 * 1000;
export const SUMMER_QUEUE_LOCK_TIMEOUT_MS = 30_000;

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
  'issue',
  'issueKey',
  'pr',
  'stallClass',
  'mode',
  'owner',
  'outcome',
  'reason',
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
  const sha = value => { const n = text(value)?.toLowerCase(); return n && /^[0-9a-f]{40}$/.test(n) ? n : null; };
  const prn = value => Number.isInteger(value) && value > 0 ? value : null;
  const iso = now => typeof now === 'string' ? now : new Date(now).toISOString();
  const workflowName = signal => text(signal.workflowName) || text(signal.workflow) || text(signal.workflow?.name);
  const identifiedKey = signal => text(signal.issue) || (prn(signal.pr) ? `pr:${prn(signal.pr)}` : null);
  const anonymousIdentity = signal => digest({ stallClass: text(signal.stallClass) || 'not-proven', workflow: workflowName(signal), issue: text(signal.issue), pr: prn(signal.pr), headSha: sha(signal.headSha) });
  const issueKey = signal => text(signal.stallClass) === 'draft-stack-policy' ? text(signal.deliveryKey) : identifiedKey(signal) || text(signal.deliveryKey) || anonymousIdentity(signal);
  const loopKeyFor = classified => digest({ issueKey: classified.issueKey });
  const leaseKeyFor = classified => digest({ issueKey: classified.issueKey, writer: classified.writer, headSha: classified.headSha });
  const backoffMs = attempt => Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (Math.max(1, Number.isInteger(attempt) ? attempt : 1) - 1));
  const nextProofAt = (observedAt, attempt) => new Date(Date.parse(observedAt) + backoffMs(attempt)).toISOString();
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
    const deliveryKey = text(signal.delivery_key) || text(signal.deliveryKey) || text(signal.event_id) || anonymousIdentity({ stallClass, workflowName: workflow, issue, pr, headSha });
    return { schema: NO_UNATTENDED_RED_SCHEMA, stallClass, mode, owner: typed.owner, writer: typed.writer, action, issue, pr, headSha, workflow, deliveryKey, issueKey: issueKey({ issue, pr, deliveryKey, stallClass, headSha, workflowName: workflow }), proven, mechanical, observedAt: iso(now), mergeQueueIndependent: true, evidence: signal.evidence && typeof signal.evidence === 'object' ? signal.evidence : {} };
  }
  function assertNoUnattendedRed(records) {
    const silent = (records || []).filter(record => {
      if (record.outcome === 'healthy') return false;
      if (record.outcome === 'escalated') return !record.reason || !record.escalation?.reason;
      return record.outcome !== 'open' || !record.owner || !record.leaseKey || !record.nextProofAt || !record.action || !record.writer;
    });
    if (silent.length > 0) throw new Error(`unattended red: ${silent.map(item => item.issueKey || item.loopKey).join(',')}`);
    return true;
  }
  function openLoopRecord(classified, { existing = null, now = classified.observedAt, attempt = 0 } = {}) {
    if (existing?.schema === NO_UNATTENDED_RED_SCHEMA) {
      if (existing.outcome === 'healthy' || existing.outcome === 'escalated') return existing;
      return { ...existing, duplicate: true, observedAt: iso(now) };
    }
    const observedAt = iso(now);
    const record = { schema: NO_UNATTENDED_RED_SCHEMA, loopKey: loopKeyFor(classified), leaseKey: leaseKeyFor(classified), stallClass: classified.stallClass, mode: classified.mode, owner: classified.owner, writer: classified.writer, action: classified.action, issue: classified.issue, issueKey: classified.issueKey, pr: classified.pr, headSha: classified.headSha, workflow: classified.workflow || null, deliveryKey: classified.deliveryKey, proven: classified.proven === true, mechanical: classified.mechanical === true, attempt, attemptBudget: ATTEMPT_BUDGET, authorityBudget: AUTHORITY_BUDGET, backoffMs: backoffMs(Math.max(1, attempt)), nextProofAt: nextProofAt(observedAt, Math.max(1, attempt)), outcome: 'open', dispatchState: 'classified', terminal: false, externalMutations: 0, observedAt, reason: `${classified.stallClass}:${classified.action}`, evidence: classified.evidence };
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
      (over ? deferred : dispatched).push({ ...record, dispatchState: over ? 'capacity-queued' : 'dispatched', observedAt: iso(now) });
    }
    return { dispatched, deferred, capacity: measured, mergeQueueIndependent: true };
  }
  function markNotProven(record, reason, now) {
    const classified = classifyStall({ ...record, stallClass: 'not-proven', proven: false, failure: 'not-proven' }, { now });
    return { ...record, stallClass: 'not-proven', mode: 'collect-evidence', owner: classified.owner, writer: classified.writer, action: classified.action, proven: false, dispatchState: 'classified', outcome: 'open', terminal: false, reason, observedAt: iso(now), nextProofAt: nextProofAt(iso(now), Math.max(1, record.attempt || 0)) };
  }
  function requalifyExactHead(record, liveHead, { now = new Date().toISOString() } = {}) {
    const live = sha(liveHead);
    if (!live) return markNotProven(record, 'missing-live-head', now);
    if (sha(record.headSha) === live) return record;
    return markNotProven({ ...record, headSha: live, leaseKey: leaseKeyFor({ ...record, headSha: live }) }, 'exact-head-changed-requalify', now);
  }
  function escalate(record, reason, now = new Date().toISOString()) {
    const exactReason = text(reason) || `escalated:${record.stallClass}`;
    return { ...record, mode: 'authority-blocker', outcome: 'escalated', terminal: true, dispatchState: 'escalated', owner: 'human', writer: 'human', action: 'visible-actionable-escalation', reason: exactReason, authorityBudget: 0, observedAt: iso(now), escalation: { reason: exactReason, stallClass: record.stallClass, issue: record.issue, pr: record.pr, headSha: record.headSha, attempts: record.attempt } };
  }
  function advanceAttempt(record, result, { now = new Date().toISOString() } = {}) {
    if (record.outcome === 'healthy' || record.outcome === 'escalated') return record;
    if (result?.healthy === true) return { ...record, outcome: 'healthy', terminal: true, dispatchState: 'complete', reason: result.reason || 'proven-healthy', observedAt: iso(now) };
    if (result?.requalifyHead) return requalifyExactHead(record, result.requalifyHead, { now });
    const attempt = (record.attempt || 0) + 1;
    if (attempt >= record.attemptBudget) return escalate(record, `retry-budget-exhausted:${record.stallClass}`, now);
    if (result?.authorityExhausted === true) return escalate(record, `authority-budget-exhausted:${record.stallClass}`, now);
    return { ...record, attempt, backoffMs: backoffMs(attempt), nextProofAt: nextProofAt(iso(now), attempt), dispatchState: 'backoff', outcome: 'open', reason: result?.reason || record.reason, observedAt: iso(now) };
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
    const persistedAnonymous = new Set((persistedRecords || []).filter(record => !identifiedKey(record)).map(record => anonymousIdentity(record)));
    return (observedSignals || []).map(signal => classifyStall(signal, { now })).filter(classified => !persisted.has(classified.issueKey) && (identifiedKey(classified) || !persistedAnonymous.has(anonymousIdentity(classified)))).map(classified => openLoopRecord(classified, { now }));
  }
  function preferQueueRecord(left, right) {
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
      if (record.stallClass === 'draft-stack-policy' && prn(record.pr)) {
        const key = `draft-stack:${record.pr}`;
        draftStacks.set(
          key,
          draftStacks.has(key)
            ? preferDraftStackRecord(draftStacks.get(key), record)
            : record
        );
        continue;
      }
      if (record.outcome === 'healthy') continue;
      const key = identifiedKey(record) || anonymousIdentity(record);
      collapsed.set(key, collapsed.has(key) ? preferQueueRecord(collapsed.get(key), record) : record);
    }
    for (const [key, record] of draftStacks) {
      if (record.outcome !== 'healthy') collapsed.set(key, record);
    }
    const items = [...collapsed.values()].sort((left, right) => `${left.issueKey}:${left.observedAt}`.localeCompare(`${right.issueKey}:${right.observedAt}`)).map(record => ({ ...Object.fromEntries(QUEUE_KEYS.map(key => [key, record[key]])), issue: record.issue, stallClass: record.stallClass, outcome: record.outcome, escalation: record.escalation || null }));
    const terminalTombstones = [
      ...source.filter(record => record.stallClass !== 'draft-stack-policy' && record.outcome === 'healthy'),
      ...[...draftStacks.values()].filter(record => record.outcome === 'healthy'),
    ].map(record => ({ ...Object.fromEntries(QUEUE_KEYS.map(key => [key, record[key]])), issue: record.issue, pr: record.pr, outcome: record.outcome, terminal: record.terminal, observedAt: record.observedAt, reason: record.reason }));
    return { schema: SUMMER_QUEUE_SCHEMA, authority: 'Summer', observedAt: iso(now), items, terminalTombstones, counts: { open: items.filter(item => item.outcome === 'open').length, healthy: 0, escalated: items.filter(item => item.outcome === 'escalated').length, terminalHidden: terminalTombstones.length } };
  }
  function evidenceTaskForRecord(record) {
    if (record.mode !== 'collect-evidence' || record.outcome !== 'open') return null;
    return { schema: EVIDENCE_TASK_SCHEMA, taskKey: digest({ loopKey: record.loopKey, action: record.action }), createdAt: record.observedAt, loopKey: record.loopKey, owner: record.owner, action: record.action, issue: record.issue, pr: record.pr, headSha: record.headSha, stallClass: record.stallClass, safety: 'missing-evidence-is-not-a-repair-claim' };
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
          .filter(item => item.stallClass === 'draft-stack-policy' && item.pr === record.pr)
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
    { stateDir = '', dryRun = false, now = new Date().toISOString(), queueLockHeld = false, draftStackAuthority = null } = {}
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
      for (const record of records) {
        if (record.stallClass !== 'draft-stack-policy' || !prn(record.pr)) continue;
        const root = prn(record.pr);
        latest.set(
          root,
          latest.has(root)
            ? preferDraftStackRecord(latest.get(root), record)
            : record
        );
        if (draftStackRecordVisibleForAuthority(record, draftStackAuthority)) {
          visibleLatest.set(
            root,
            visibleLatest.has(root)
              ? preferDraftStackRecord(visibleLatest.get(root), record)
              : record
          );
        }
      }
      const resolved = [];
      for (const [root, record] of latest) {
        const visibleRecord = visibleLatest.get(root);
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
  return { inferStallClass, classifyStall, loopKeyFor, leaseKeyFor, backoffMs, openLoopRecord, dispatchOpenRecords, requalifyExactHead, escalate, advanceAttempt, sourceAlignment, splitSizeGuardChange, reconcileMissedEvents, projectSummerQueue, assertNoUnattendedRed, evidenceTaskForRecord, loadLoopRecords, readSummerQueue, persistLoopOutcome, persistDraftStackResolutions, withSummerQueueLock, classifyAndOpenFromDelivery };
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
export const escalate = api.escalate;
export const advanceAttempt = api.advanceAttempt;
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
