#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { activeLinearCooldown } from './backlog-orchestrator/linear-client.mjs';
import { TODO_STATE_ID } from './backlog-orchestrator/stale-lease-guard.mjs';
import {
  buildPrFleetClosureAudit,
  findOfficialSymphonyLease,
  hasFleetClosureRemediationLease,
  isRecoveryHoldLabel,
  MINIMUM_OWNERLESS_MS,
  ownerlessSince,
  parseFleetClosureRemediationLeases,
  renderFleetClosureRemediationLease,
  renderPrFleetClosureAudit,
  shouldDispatchOwnerlessRecovery,
} from './lib/ownerless-recovery-policy.mjs';
import { readPullRequestQueueState } from './merge-queue-backend.mjs';

const execFileAsync = promisify(execFile);
const repo =
  process.env.REPO || process.env.GITHUB_REPOSITORY || 'JovieInc/Jovie';
const EXACT_SHA = /^[0-9a-f]{40}$/;
const JOVIE_LINEAR_TEAM_ID = 'bdc09edc-f91c-4a06-b308-74b4fcf093f8';
const OFFICIAL_SYMPHONY_STATE_URL =
  process.env.SYMPHONY_STATE_URL || 'http://127.0.0.1:4041/api/v1/state';

async function gh(args) {
  const { stdout } = await execFileAsync('gh', args, {
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  });
  return stdout.trim();
}

async function ghJson(args) {
  const output = await gh(args);
  return output ? JSON.parse(output) : null;
}

async function mainHead() {
  return gh(['api', `repos/${repo}/git/ref/heads/main`, '--jq', '.object.sha']);
}

async function policyHead() {
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
    env: process.env,
  });
  return stdout.trim();
}

export async function resolveExactMainPolicyHead(dependencies = {}) {
  const { mainHeadImpl = mainHead, policyHeadImpl = policyHead } = dependencies;
  const [checkedOutHead, liveMain] = await Promise.all([
    policyHeadImpl(),
    mainHeadImpl(),
  ]);
  if (!EXACT_SHA.test(checkedOutHead) || !EXACT_SHA.test(liveMain)) {
    throw new Error(
      'ownerless recovery requires exact lowercase policy and main SHAs'
    );
  }
  if (checkedOutHead !== liveMain) {
    throw new Error(
      `ownerless recovery policy head ${checkedOutHead} is not live main ${liveMain}`
    );
  }
  return liveMain;
}

const openPulls = (base = '') =>
  pages(
    `repos/${repo}/pulls?state=open${base ? `&base=${base}` : ''}&per_page=100`
  );

async function linearActiveIssueSnapshot() {
  const linear = await import('./backlog-orchestrator/linear-client.mjs');
  return linear.fetchTeamFleetClosureIssueSnapshot(JOVIE_LINEAR_TEAM_ID);
}

export async function recoveryIssueSnapshot(
  open,
  fetchSnapshot = linearActiveIssueSnapshot
) {
  if (!open.some(pr => pr?.draft !== true && pr?.isDraft !== true)) return null;
  return fetchSnapshot();
}

async function linearClient() {
  return import('./backlog-orchestrator/linear-client.mjs');
}

/**
 * @typedef {{name: string, payload?: {action?: string, label?: {name?: string}, pull_request?: {draft: boolean, state: string, base: {ref: string}, number?: number, created_at?: string, labels?: Array<{name: string}>, assignees?: Array<unknown>}}}} RecoveryEvent
 */

/**
 * @param {NodeJS.ProcessEnv} environment
 * @param {(path: string, encoding: 'utf8') => string} readEventFile
 * @returns {RecoveryEvent}
 */
export function readRecoveryEvent(
  environment = process.env,
  readEventFile = readFileSync
) {
  const name = environment.GITHUB_EVENT_NAME || 'manual';
  if (name !== 'pull_request') return { name, payload: {} };
  const path = environment.GITHUB_EVENT_PATH;
  if (!path) throw new Error('Pull-request recovery event context is missing');
  return { name, payload: JSON.parse(readEventFile(path, 'utf8')) };
}

function readRecoveryTimeline(number) {
  return pages(`repos/${repo}/issues/${number}/timeline?per_page=100`);
}

/** @param {RecoveryEvent} event */
export async function recoveryEventDecision(
  { name, payload = {} },
  { now = Date.now(), readTimeline = readRecoveryTimeline } = {}
) {
  if (name === 'manual' || name === 'workflow_dispatch') {
    return { required: true, reason: 'explicit-audit' };
  }
  if (name !== 'pull_request') {
    return { required: false, reason: 'unrelated-event' };
  }
  if (!['opened', 'reopened', 'unlabeled'].includes(payload.action)) {
    return { required: false, reason: 'unrelated-pr-action' };
  }
  const pr = payload.pull_request;
  if (!pr || typeof pr.draft !== 'boolean' || !pr.base?.ref) {
    throw new Error('Pull-request recovery eligibility is indeterminate');
  }
  if (pr.draft || pr.state !== 'open' || pr.base.ref !== 'main') {
    return { required: false, reason: 'not-ready-main-pr' };
  }
  // Opening/reopening a ready PR retains the full closure/ownership audit.
  if (payload.action !== 'unlabeled') {
    return { required: true, reason: 'ready-pr-opened-or-reopened' };
  }
  if (!isRecoveryHoldLabel(payload.label?.name)) {
    return { required: false, reason: 'unrelated-label-removed' };
  }
  if (
    (pr.labels ?? []).some(label => isRecoveryHoldLabel(label.name ?? label))
  ) {
    return { required: false, reason: 'recovery-still-held' };
  }
  if ((pr.assignees ?? []).length > 0) {
    return { required: false, reason: 'assigned-pr' };
  }
  const created = Date.parse(pr.created_at);
  if (!Number.isFinite(created) || !Number.isInteger(pr.number)) {
    throw new Error('Pull-request recovery age is indeterminate');
  }
  if (now - created < MINIMUM_OWNERLESS_MS) {
    return { required: false, reason: 'ownerless-under-threshold' };
  }
  // A conflict-label removal after rebase is not a fresh ownerless hour.
  // Reuse the canonical assignment timeline rule before any tracker scan.
  const ownershipStart = ownerlessSince(pr, await readTimeline(pr.number));
  if (ownershipStart === null) {
    return { required: false, reason: 'ownerless-under-threshold' };
  }
  const since = Date.parse(ownershipStart);
  if (!Number.isFinite(since)) {
    throw new Error('Pull-request ownership timeline is indeterminate');
  }
  if (now - since < MINIMUM_OWNERLESS_MS) {
    return { required: false, reason: 'ownerless-under-threshold' };
  }
  return { required: true, reason: 'eligible-recovery-hold-released' };
}

// A PR event is recovery demand only while its exact head lacks a native owner.
// Read current GitHub metadata, never treat the event payload as queue truth.
export async function recoveryNativeAdmissionDecision(
  event,
  readQueueState = readPullRequestQueueState
) {
  if (event.name !== 'pull_request') return { required: true };
  const pr = event.payload?.pull_request;
  if (!Number.isInteger(pr?.number) || !EXACT_SHA.test(pr?.head?.sha ?? '')) {
    throw new Error('Recovery event exact PR head is indeterminate');
  }
  const state = await readQueueState({ repository: repo, number: pr.number });
  if (state?.number !== pr.number || state?.headRefOid !== pr.head.sha) {
    throw new Error('Recovery event current head is indeterminate or changed');
  }
  if (
    !['OPEN', 'CLOSED', 'MERGED'].includes(state.state) ||
    typeof state.isDraft !== 'boolean'
  ) {
    throw new Error('Recovery event current PR state is indeterminate');
  }
  if (state.state !== 'OPEN' || state.isDraft === true) {
    return { required: false, reason: 'current-pr-not-ready' };
  }
  if (
    typeof state.queued !== 'boolean' ||
    typeof state.autoMergeEnabled !== 'boolean'
  ) {
    throw new Error('Recovery event native admission is indeterminate');
  }
  if (state.queued || state.autoMergeEnabled) {
    return { required: false, reason: 'exact-head-native-admission-owned' };
  }
  return { required: true };
}

export async function fetchOfficialSymphonyState({
  fetchImpl = globalThis.fetch,
  url = OFFICIAL_SYMPHONY_STATE_URL,
  attempts = 3,
  retryDelayMs = 250,
  sleepImpl = sleep,
} = {}) {
  let lastError = 'not-read';
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response?.ok) {
        lastError = `http-${response?.status || 'unknown'}`;
      } else {
        const body = /** @type {Record<string, unknown> | null} */ (
          await response.json()
        );
        if (
          body &&
          typeof body === 'object' &&
          !Array.isArray(body) &&
          typeof (body.observedAt || body.generated_at) === 'string' &&
          Array.isArray(body.running) &&
          Array.isArray(body.retrying) &&
          Array.isArray(body.blocked)
        ) {
          return { ...body, source: 'official-symphony-state' };
        }
        lastError = 'malformed-state';
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    if (attempt < attempts) await sleepImpl(retryDelayMs);
  }
  return { source: 'official-symphony-state', error: lastError };
}

function prPacketMap(linearIssues) {
  const packetIssue = linearIssues.find(
    issue => String(issue?.identifier || '').toUpperCase() === 'JOV-5610'
  );
  const text = [
    packetIssue?.title,
    packetIssue?.description,
    ...(packetIssue?.comments?.nodes ?? packetIssue?.comments ?? []).map(
      comment => comment?.body ?? comment
    ),
  ].join('\n');
  return Object.fromEntries(
    [...text.matchAll(/\b(?:PR\s*#|pull\/)(\d+)\b/gi)].map(match => [
      match[1],
      'JOV-5610',
    ])
  );
}

async function pages(endpoint) {
  const value = await ghJson([
    'api',
    '--paginate',
    '--slurp',
    '-H',
    'Accept: application/vnd.github+json',
    endpoint,
  ]);
  return (value ?? []).flat();
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const mutationSucceeded = result =>
  result === undefined ||
  result === true ||
  (result !== false &&
    result?.success !== false &&
    [result?.commentCreate?.success, result?.issueUpdate?.success]
      .filter(value => value !== undefined)
      .every(Boolean));
const stateName = issue =>
  String(issue?.state?.name || issue?.state || '').trim();

export async function processFleetClosureRemediationIntents(
  audit,
  dependencies = {}
) {
  const deps = {
    clientImpl: null,
    fetchOfficialSymphonyStateImpl: fetchOfficialSymphonyState,
    nowImpl: () => new Date().toISOString(),
    sleepImpl: sleep,
    symphonyReadbackAttempts: 3,
    symphonyReadbackDelayMs: 1000,
    todoStateId: process.env.FLEET_REMEDIATION_TODO_STATE_ID || TODO_STATE_ID,
    todoStateName: 'Todo',
    ...dependencies,
  };
  const client = deps.clientImpl ?? (await linearClient());
  const waitLease = async identifier => {
    let last = { ok: false, reason: 'symphony-state-not-read' };
    for (
      let attempt = 1;
      attempt <= deps.symphonyReadbackAttempts;
      attempt += 1
    ) {
      try {
        last = findOfficialSymphonyLease(
          await deps.fetchOfficialSymphonyStateImpl(),
          identifier,
          { now: new Date(deps.nowImpl()) }
        );
      } catch (error) {
        last = {
          ok: false,
          reason: 'symphony-state-read-threw',
          error: error instanceof Error ? error.message : String(error),
        };
      }
      if (last.ok) return { ...last, attempts: attempt };
      if (attempt < deps.symphonyReadbackAttempts)
        await deps.sleepImpl(deps.symphonyReadbackDelayMs);
    }
    return { ...last, attempts: deps.symphonyReadbackAttempts };
  };
  const results = [];
  for (const intent of (audit?.remediationIntents ?? []).filter(
    intent => intent?.action === 'reattach-remediation-lane' && intent.issue
  )) {
    const record = (status, extra = {}) =>
      results.push({ ...intent, status, ...extra });
    const fail = (reason, extra = {}) => record('failed', { reason, ...extra });
    let issue = await client.fetchIssue(intent.issue);
    if (!issue?.id) {
      fail('issue-read-failed');
      continue;
    }
    const currentLease = await waitLease(intent.issue);
    if (currentLease.ok) {
      record('idempotent', { readback: currentLease });
      continue;
    }
    if (currentLease.reason !== 'symphony-lease-readback-missing') {
      fail(currentLease.reason, { readback: currentLease });
      continue;
    }
    try {
      const conflictingLease = (issue?.comments?.nodes ?? issue?.comments ?? [])
        .flatMap(comment =>
          parseFleetClosureRemediationLeases(comment?.body ?? comment)
        )
        .find(
          receipt =>
            receipt.pr === intent.pr &&
            receipt.head === intent.head &&
            receipt.issue === intent.issue &&
            (receipt.reason !== intent.reason ||
              receipt.action !== 'reattach-remediation-lane' ||
              receipt.consumer !== 'symphony-linear-writer')
        );
      if (conflictingLease) {
        fail('intent-conflict');
        continue;
      }
      if (!hasFleetClosureRemediationLease(issue, intent)) {
        const created = await client.addComment(
          issue.id,
          renderFleetClosureRemediationLease({
            ...intent,
            observedAt: deps.nowImpl(),
          })
        );
        if (!mutationSucceeded(created)) {
          fail('intent-create-failed');
          continue;
        }
        issue = await client.fetchIssue(intent.issue);
        if (!hasFleetClosureRemediationLease(issue, intent)) {
          fail('intent-readback-missing');
          continue;
        }
      }
      if (stateName(issue) !== deps.todoStateName) {
        if (typeof client.transitionIssue !== 'function') {
          fail('linear-transition-unavailable');
          continue;
        }
        if (
          !mutationSucceeded(
            await client.transitionIssue(issue.id, deps.todoStateId)
          )
        ) {
          fail('linear-transition-failed');
          continue;
        }
        issue = await client.fetchIssue(intent.issue);
        if (
          stateName(issue) !== deps.todoStateName ||
          !hasFleetClosureRemediationLease(issue, intent)
        ) {
          fail('linear-transition-readback-missing');
          continue;
        }
      }
    } catch (error) {
      fail('linear-mutation-threw', {
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    const lease = await waitLease(intent.issue);
    if (lease.ok) {
      record('reattached', { readback: lease });
    } else if (lease.reason === 'symphony-lease-readback-missing') {
      // Linear Todo plus the exact, read-back remediation receipt is the
      // durable queue owned by official Symphony. A healthy runtime may be at
      // capacity, so absence from its active/retrying projection is pending
      // work rather than a failed dispatch.
      record('queued', { readback: lease });
    } else {
      fail(lease.reason, { readback: lease });
    }
  }
  return { ok: results.every(result => result.status !== 'failed'), results };
}

export async function run({
  eventContext = readRecoveryEvent(),
  readEventTimeline = readRecoveryTimeline,
  readEventQueueState = readPullRequestQueueState,
  now = Date.now(),
  resolvePolicyHead = resolveExactMainPolicyHead,
  readOpenPulls = openPulls,
  readIssueSnapshot = linearActiveIssueSnapshot,
} = {}) {
  const event = await recoveryEventDecision(eventContext, {
    readTimeline: readEventTimeline,
    now,
  });
  if (!event.required) {
    console.log(`Ownerless recovery skipped: ${event.reason}`);
    return;
  }
  const admission = await recoveryNativeAdmissionDecision(
    eventContext,
    readEventQueueState
  );
  if (!admission.required) {
    console.log(`Ownerless recovery skipped: ${admission.reason}`);
    return;
  }
  await resolvePolicyHead();
  const snapshotStartedAt = new Date().toISOString();
  const open = await readOpenPulls('main');
  const snapshotCompletedAt = new Date().toISOString();
  const linearSnapshot = await recoveryIssueSnapshot(open, readIssueSnapshot);
  if (linearSnapshot === null) {
    console.log('Ownerless recovery skipped: no non-draft open PRs');
    return;
  }
  const linearIssues = linearSnapshot.issues;
  const audit = buildPrFleetClosureAudit({
    repository: repo,
    pullRequests: open,
    linearIssues,
    prPacketMap: prPacketMap(linearIssues),
    symphonyState: await fetchOfficialSymphonyState(),
    snapshot: {
      complete: true,
      startedAt: snapshotStartedAt,
      completedAt: snapshotCompletedAt,
      linear: linearSnapshot.coverage,
    },
    now: new Date(snapshotCompletedAt),
  });
  console.log(renderPrFleetClosureAudit(audit));
  const remediation = await processFleetClosureRemediationIntents(audit);
  console.log(
    JSON.stringify({
      schema: 'jovie-pr-fleet-remediation-run/v1',
      ...remediation,
    })
  );
  if (!shouldDispatchOwnerlessRecovery(audit)) {
    console.error(
      `Ownerless recovery sweep blocked by PR fleet closure audit: ${audit.violations
        .map(violation => violation.reason)
        .join(', ')}`
    );
    process.exitCode = 1;
    return;
  }
  // Native merge intent belongs to the PR writer and GitHub. The ownerless
  // sweep still audits closure/remediation evidence above, but has no source
  // admission dispatch or draft-promotion side effect.
  console.log('Ownerless recovery sweep: source admission is GitHub native');
}

export function safeFailureReceipt(error) {
  const err = /** @type {any} */ (error);
  const cause = /** @type {any} */ (err?.cause);
  const stderr =
    typeof err?.details?.stderr === 'string' ? err.details.stderr.trim() : '';
  return {
    schema: 'jovie-ownerless-recovery-failure/v1',
    name: err?.name ?? 'Error',
    message: err?.message ?? String(error),
    code: err?.code ?? null,
    attempts: err?.attempts ?? null,
    resetAt: err?.resetAt ?? null,
    coverage: err?.coverage ?? null,
    stderr: stderr ? stderr.slice(0, 2000) : null,
    cause: cause
      ? {
          name: cause.name ?? 'Error',
          message: cause.message ?? String(cause),
          code: cause.code ?? null,
          attempts: cause.attempts ?? null,
          status: cause.metadata?.status ?? null,
          contentType: cause.metadata?.contentType ?? null,
        }
      : null,
  };
}

export function ownerlessRecoveryFailureDisposition(error, now = Date.now()) {
  const cooldown = activeLinearCooldown(error, now);
  return {
    ...safeFailureReceipt(error),
    status: cooldown ? 'deferred' : 'blocked',
    ...(cooldown ?? {}),
  };
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  run().catch(error => {
    const disposition = ownerlessRecoveryFailureDisposition(error);
    console.error(JSON.stringify(disposition));
    if (disposition.status === 'deferred') {
      console.error(
        `Linear credential cooldown is active; the scheduled recovery clock will retry at or after ${disposition.retryAt}.`
      );
      process.exitCode = 0;
      return;
    }
    if (error instanceof Error && error.stack) console.error(error.stack);
    process.exitCode = 1;
  });
}
