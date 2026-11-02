#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { runGh } from '../packages/api-client/gh.ts';
import { isTransientAdmissionFailureMessage } from './lib/merge-group-admission.mjs';
import {
  attributeAgainstAheadRun,
  attributeAgainstPeerRuns,
  CI_FAST_REMAINING_JOB,
} from './lib/merge-group-ahead-attribution.mjs';
import {
  DETERMINISTIC_MERGE_GROUP_FAILURE_STEPS,
  MERGE_GROUP_FAILURE_CONCLUSIONS,
  RETRYABLE_PRODUCT_FAILURE_STEPS,
} from './lib/merge-queue-guard.mjs';

export const FAILURE_HOLD_SCHEMA = 'jovie-merge-group-failure-hold/v1';
export const FAILURE_HOLD_CONTEXT = 'jovie-queue-failure-hold/v1';
export const FAILURE_RETRY_CONTEXT = 'jovie-queue-failure-retry/v1';
export const ADMISSION_RECOVERY_CONTEXT = 'jovie-queue-admission-recovery/v1';
export const ADMISSION_RECOVERY_SCHEMA =
  'jovie-merge-group-admission-recovery/v1';
export const CI_WORKFLOW_ID = 178737329;
// PR Size Guard owns the merge-group "Require combined-head workflows to
// load" step. A ci.yml GitHub cannot load runs zero jobs and reports no
// merge_group check (2026-10-20, #21826), so that required context is the
// only merge-group evidence of the failure.
export const PR_SIZE_GUARD_WORKFLOW_ID = 299199506;
export const WORKFLOW_LOAD_STEP = 'Require combined-head workflows to load';
// CI never reports on a group whose ci.yml does not load, so the queue would
// wait for the ruleset's response timeout. Reporting the required context
// failed on the exact synthetic head ejects the group now.
export const WORKFLOW_LOAD_EJECT_CONTEXT = 'PR Ready';
const MERGE_GROUP_FAILURE_WORKFLOWS = new Map([
  [CI_WORKFLOW_ID, '.github/workflows/ci.yml'],
  [PR_SIZE_GUARD_WORKFLOW_ID, '.github/workflows/pr-size-guard.yml'],
]);

/** Only the workflow-load step makes a PR Size Guard failure a source hold. */
export function isHeldWorkflowFailure(run, failedSteps = []) {
  if (run?.workflow_id === CI_WORKFLOW_ID) return true;
  return (
    run?.workflow_id === PR_SIZE_GUARD_WORKFLOW_ID &&
    Array.isArray(failedSteps) &&
    failedSteps.includes(WORKFLOW_LOAD_STEP)
  );
}
export const FAILURE_CLASSES = Object.freeze([
  'deterministic-source',
  'retryable-product',
  'transient-infrastructure',
  'unclassified',
  'base-branch',
]);

const SHA = /^[0-9a-f]{40}$/;
const FAILURE_DESCRIPTION =
  /^class=(deterministic-source|retryable-product|transient-infrastructure|unclassified);n=([1-9][0-9]*);run=([1-9][0-9]*);try=([1-9][0-9]*)$/;
const BASE_BRANCH_DESCRIPTION =
  /^class=base-branch;n=([1-9][0-9]*);run=([1-9][0-9]*);try=([1-9][0-9]*);main=([0-9a-f]{40})$/;
const AGENT_CONTEXT_BUDGET_FILES = new Set([
  'CLAUDE.md',
  'DESIGN.md',
  'docs/agent-context/README.md',
]);
const RUNNER_EXIT_FAILURE = 'Process completed with exit code 1.';
const INSTRUCTION_CONTRACT_STEP = 'Evaluate repository instruction contracts';
const INSTRUCTION_FAILURE_SUMMARIES = new Set([
  INSTRUCTION_CONTRACT_STEP,
  'Join exact lane results',
  'Evaluate combined-head checks',
]);
// Merge Group Admission and the PR Ready summary that reports it. When the
// admission step only gave up on API quota or a gateway error, the group says
// nothing about the source revision (JOV-7780: run 37167458268).
export const ADMISSION_STEP =
  'Require live queue membership and external admission checks';
export const TRANSIENT_ADMISSION_CLASS = 'transient-admission';
const ADMISSION_FAILURE_SUMMARIES = new Set([
  ADMISSION_STEP,
  'Evaluate combined-head checks',
]);
const RETRY_DESCRIPTION =
  /^(spent|released):run=([1-9][0-9]*);try=([1-9][0-9]*)$/;
// The base-branch fetch await step (ci.yml `&base-fetch-await`) emits exactly
// this annotation when the detached background fetch never reports an exit
// status. Only that timeout is infrastructure; any other fetch failure says
// something we cannot attribute and stays unclassified.
export const FETCH_STEP = 'Fetch base-branch history';
export const FETCH_TIMEOUT_TITLE = 'Base-branch fetch';
export const FETCH_TIMEOUT_MESSAGE =
  'background fetch did not finish within 540s';
// Aggregate steps that only report a lane job's failure, never originate one.
const FETCH_TIMEOUT_CASCADE_STEPS = new Set([
  'Require every ci-fast lane group to pass',
  'Join exact lane results',
  'Evaluate combined-head checks',
]);
const LANE_AGGREGATE_STEP = 'Require every ci-fast lane group to pass';
const LANE_AGGREGATE_TITLE = 'ci-fast failed closed';
// "ci-fast (structural web)" reports itself as `structural-web`.
const laneOfJob = name =>
  String(name ?? '')
    .replace(/^ci-fast \((.*)\)$/, '$1')
    .replace(/ /g, '-');
const INFRASTRUCTURE_STEP =
  /^(?:Set up job|Initialize containers|Prepare all required actions|Complete job|Post |Checkout|Set up |Restore |Upload |Download )/i;

function fail(message) {
  throw new Error(`merge-group-failure-hold: ${message}`);
}

export function parseMergeQueueBranch(value) {
  const match =
    /^gh-readonly-queue\/main\/pr-([1-9][0-9]*)-([0-9a-f]{40})$/.exec(
      String(value ?? '')
    );
  return match ? { prNumber: Number(match[1]), baseSha: match[2] } : null;
}

function sourceHeadFromItem(item) {
  const oid =
    item?.__typename === 'PullRequestCommit'
      ? item.commit?.oid
      : item?.__typename === 'HeadRefForcePushedEvent'
        ? item.afterCommit?.oid
        : undefined;
  return typeof oid === 'string' ? oid.toLowerCase() : '';
}

// Timestamped queue admission binds a synthetic run to its preceding source
// commit, preserving the exact head even when a later push has arrived.
export function sourceHeadForRun(timeline, runCreatedAt) {
  if (!Array.isArray(timeline) || !Number.isFinite(Date.parse(runCreatedAt))) {
    fail('source timeline evidence is incomplete');
  }
  let admissionIndex = -1;
  for (let index = 0; index < timeline.length; index += 1) {
    const item = timeline[index];
    if (
      item?.__typename === 'AddedToMergeQueueEvent' &&
      Number.isFinite(Date.parse(item.createdAt)) &&
      Date.parse(item.createdAt) <= Date.parse(runCreatedAt)
    ) {
      admissionIndex = index;
    }
  }
  if (admissionIndex < 0) fail('no queue admission precedes the failed run');
  for (let index = admissionIndex - 1; index >= 0; index -= 1) {
    const head = sourceHeadFromItem(timeline[index]);
    if (SHA.test(head)) return head;
  }
  fail('queue admission has no preceding exact source revision');
}

function parseFailureDescription(description) {
  const base = BASE_BRANCH_DESCRIPTION.exec(description);
  if (base) {
    return {
      classification: 'base-branch',
      failureNumber: Number(base[1]),
      runId: Number(base[2]),
      runAttempt: Number(base[3]),
      mainSha: base[4],
    };
  }
  const match = FAILURE_DESCRIPTION.exec(description);
  if (!match) return null;
  return {
    classification: match[1],
    failureNumber: Number(match[2]),
    runId: Number(match[3]),
    runAttempt: Number(match[4]),
    mainSha: null,
  };
}

function hasOnlyBudgetErrors(text) {
  const errors = String(text ?? '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  let budgetFound = false;
  for (const error of errors) {
    if (error === RUNNER_EXIT_FAILURE) continue;
    const match = /^([^:]+): ([1-9][0-9]*) bytes exceeds ([1-9][0-9]*)$/.exec(
      error
    );
    if (!match || !AGENT_CONTEXT_BUDGET_FILES.has(match[1])) return false;
    const size = Number(match[2]);
    const limit = Number(match[3]);
    if (
      !Number.isSafeInteger(size) ||
      !Number.isSafeInteger(limit) ||
      size <= limit
    )
      return false;
    budgetFound = true;
  }
  return budgetFound;
}

function hasOnlyTransientAdmissionErrors(text) {
  const errors = String(text ?? '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  let transientFound = false;
  for (const error of errors) {
    if (error === RUNNER_EXIT_FAILURE) continue;
    if (!isTransientAdmissionFailureMessage(error)) return false;
    transientFound = true;
  }
  return transientFound;
}

function instructionErrorsFromLog(log) {
  const errors = [];
  for (const line of log.split('\n')) {
    // gh prefixes job logs with tab-separated job/step names and timestamps.
    const body = line.replace(
      /^(?:[^\t]*\t[^\t]*\t)?(?:\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+)?/,
      ''
    );
    const record = /^(?:::error::|##\[error\])(.*)$/.exec(body);
    if (record) {
      if (!record[1].trim()) return null;
      errors.push(record[1].trim());
    } else if (/^(?:::error|##\[error)/.test(body)) return null;
  }
  // A partial log cannot prove all errors; require the failed step's terminal wrapper.
  return errors.includes(RUNNER_EXIT_FAILURE) ? errors : null;
}

function hasOnlyFetchTimeoutErrors(text) {
  const errors = String(text ?? '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  let timeoutFound = false;
  for (const error of errors) {
    if (error === RUNNER_EXIT_FAILURE) continue;
    if (error !== FETCH_TIMEOUT_MESSAGE) return false;
    timeoutFound = true;
  }
  return timeoutFound;
}

/**
 * Failure annotations of every failed fetch-step job, only when each job
 * belongs to this exact run and attempt and carries nothing but the fetch
 * timeout. Anything else (other run/attempt, other message, unreadable
 * annotations) returns '' and leaves the failure unclassified.
 * @param {{ id?: number, run_attempt?: number }} run
 * @param {object[]} jobs
 * @param {(job: object) => object[]} readAnnotations
 */
export function fetchTimeoutEvidence(run, jobs, readAnnotations) {
  const failedJobs = (Array.isArray(jobs) ? jobs : []).filter(
    job =>
      Array.isArray(job?.steps) &&
      job.steps.some(
        step => step?.name === FETCH_STEP && step?.conclusion === 'failure'
      )
  );
  if (failedJobs.length === 0) return '';
  const messages = [];
  for (const job of failedJobs) {
    if (job.run_id !== run?.id || job.run_attempt !== run?.run_attempt)
      return '';
    let notes;
    try {
      notes = readAnnotations(job);
    } catch {
      return '';
    }
    if (!Array.isArray(notes)) return '';
    const failures = notes.filter(note => note?.annotation_level === 'failure');
    if (
      failures.some(
        note =>
          typeof note.message !== 'string' ||
          (note.message !== RUNNER_EXIT_FAILURE &&
            (note.message !== FETCH_TIMEOUT_MESSAGE ||
              note.title !== FETCH_TIMEOUT_TITLE))
      ) ||
      !failures.some(note => note.message === FETCH_TIMEOUT_MESSAGE)
    )
      return '';
    messages.push(...failures.map(note => note.message));
  }
  // The aggregate job names every failed lane. A failed lane other than the
  // one whose job hit the fetch timeout is not proven infrastructure.
  const fetchLanes = new Set(failedJobs.map(job => laneOfJob(job.name)));
  const aggregateJobs = jobs.filter(
    job =>
      Array.isArray(job?.steps) &&
      job.steps.some(
        step =>
          step?.name === LANE_AGGREGATE_STEP && step?.conclusion === 'failure'
      )
  );
  for (const job of aggregateJobs) {
    if (job.run_id !== run?.id || job.run_attempt !== run?.run_attempt)
      return '';
    let notes;
    try {
      notes = readAnnotations(job);
    } catch {
      return '';
    }
    if (!Array.isArray(notes)) return '';
    const closed = notes.filter(
      note =>
        note?.annotation_level === 'failure' &&
        note.title === LANE_AGGREGATE_TITLE
    );
    if (closed.length !== 1) return '';
    const lanes = String(closed[0].message ?? '').split(' ');
    const failedLanes = [];
    for (const lane of lanes) {
      const match = /^([a-z][a-z-]*)=([a-z_]+)$/.exec(lane);
      if (!match) return '';
      if (match[2] !== 'success') failedLanes.push(match[1]);
    }
    if (failedLanes.length === 0 || !failedLanes.every(l => fetchLanes.has(l)))
      return '';
  }
  return messages.join('\n');
}

/** @param {{ conclusion?: string, failedSteps?: string[], annotationText?: string, changedFiles?: string[], admissionText?: string, fetchTimeoutText?: string }} [input] */
export function classifyMergeGroupFailure({
  conclusion,
  failedSteps = [],
  annotationText = '',
  changedFiles,
  admissionText = '',
  fetchTimeoutText = '',
} = {}) {
  if (!MERGE_GROUP_FAILURE_CONCLUSIONS.has(conclusion)) {
    fail(`unsupported terminal conclusion ${JSON.stringify(conclusion)}`);
  }
  const steps = Array.isArray(failedSteps)
    ? [...new Set(failedSteps.filter(step => typeof step === 'string'))]
    : [];
  if (conclusion === 'failure' || conclusion === 'action_required') {
    // The group's own diff made a workflow unloadable; only the source fixes it.
    if (steps.includes(WORKFLOW_LOAD_STEP)) return 'deterministic-source';
    if (
      steps.some(step => DETERMINISTIC_MERGE_GROUP_FAILURE_STEPS.has(step)) ||
      // ci-fast namespace, coverage and structural failures require source repair.
      steps.includes('Run structural ci-fast lane')
    ) {
      return 'deterministic-source';
    }
    if (steps.some(step => RETRYABLE_PRODUCT_FAILURE_STEPS.has(step))) {
      return 'retryable-product';
    }
    if (
      steps.includes(ADMISSION_STEP) &&
      steps.every(
        step =>
          ADMISSION_FAILURE_SUMMARIES.has(step) ||
          INFRASTRUCTURE_STEP.test(step)
      ) &&
      hasOnlyTransientAdmissionErrors(admissionText)
    ) {
      return TRANSIENT_ADMISSION_CLASS;
    }
    // A capped instruction file that is already over on the queue base fails
    // every PR. That is repairable by moving main, not by holding the victim.
    if (
      steps.includes(INSTRUCTION_CONTRACT_STEP) &&
      steps.every(step => INSTRUCTION_FAILURE_SUMMARIES.has(step)) &&
      hasOnlyBudgetErrors(annotationText) &&
      Array.isArray(changedFiles)
    ) {
      return changedFiles.some(file => AGENT_CONTEXT_BUDGET_FILES.has(file))
        ? 'deterministic-source'
        : 'base-branch';
    }
    // Reached only after every deterministic and product step above declined,
    // so any stronger failure in the same run has already won.
    if (
      steps.includes(FETCH_STEP) &&
      steps.every(
        step =>
          step === FETCH_STEP ||
          FETCH_TIMEOUT_CASCADE_STEPS.has(step) ||
          INFRASTRUCTURE_STEP.test(step)
      ) &&
      hasOnlyFetchTimeoutErrors(fetchTimeoutText)
    ) {
      return 'transient-infrastructure';
    }
    if (
      steps.length > 0 &&
      !steps.every(step => INFRASTRUCTURE_STEP.test(step))
    ) {
      return 'unclassified';
    }
  }
  return 'transient-infrastructure';
}

function statusCreator(status) {
  return {
    login: status?.creator?.login,
    type: status?.creator?.type ?? status?.creator?.__typename,
  };
}

function actionsRunId(targetUrl, repository) {
  const prefix = `https://github.com/${repository}/actions/runs/`;
  if (typeof targetUrl !== 'string' || !targetUrl.startsWith(prefix))
    return null;
  const suffix = targetUrl.slice(prefix.length);
  return /^[1-9][0-9]*$/.test(suffix) ? Number(suffix) : null;
}

export function parseTrustedFailureStatus(status, repository) {
  if (
    status?.context !== FAILURE_HOLD_CONTEXT ||
    String(status?.state ?? '').toLowerCase() !== 'success'
  ) {
    return null;
  }
  const creator = statusCreator(status);
  if (
    creator.type !== 'Bot' ||
    ![
      'jovie-bot[bot]',
      'jovie-ci-lane[bot]',
      'jovie-symphony-lane[bot]',
      'jovie-agents-lane[bot]',
      'jovie-bot',
      'jovie-ci-lane',
      'jovie-symphony-lane',
      'jovie-agents-lane',
    ].includes(creator.login)
  ) {
    return null;
  }
  const parsed = parseFailureDescription(String(status.description ?? ''));
  if (!parsed) return null;
  const targetRunId = actionsRunId(
    status.target_url ?? status.targetUrl,
    repository
  );
  if (targetRunId !== parsed.runId) return null;
  return {
    ...parsed,
    targetUrl: status.target_url ?? status.targetUrl,
  };
}

export function parseTrustedRetryStatus(status, repository) {
  if (
    status?.context !== FAILURE_RETRY_CONTEXT ||
    String(status?.state ?? '').toLowerCase() !== 'success'
  ) {
    return null;
  }
  const creator = statusCreator(status);
  if (
    creator.type !== 'Bot' ||
    ![
      'jovie-bot[bot]',
      'jovie-ci-lane[bot]',
      'jovie-symphony-lane[bot]',
      'jovie-agents-lane[bot]',
      'jovie-bot',
      'jovie-ci-lane',
      'jovie-symphony-lane',
      'jovie-agents-lane',
    ].includes(creator.login)
  ) {
    return null;
  }
  const match = RETRY_DESCRIPTION.exec(String(status.description ?? ''));
  if (!match) return null;
  const runId = Number(match[2]);
  if (
    actionsRunId(status.target_url ?? status.targetUrl, repository) !== runId
  ) {
    return null;
  }
  return {
    runId,
    runAttempt: Number(match[3]),
    released: match[1] === 'released',
    targetUrl: status.target_url ?? status.targetUrl,
  };
}

function admissionRecoveryDescription(receipt) {
  return `pr=${receipt.prNumber};run=${receipt.workflowRunId};try=${receipt.workflowRunAttempt};at=${receipt.completedAt}`;
}

export function admissionRecoveryReceiptStatus(
  raw,
  { repository, prNumber, headSha }
) {
  if (raw === undefined || raw === '') return null;
  if (typeof raw !== 'string')
    fail('trusted admission recovery receipt is malformed');
  const receipt = JSON.parse(raw);
  if (
    !receipt ||
    receipt.schema !== ADMISSION_RECOVERY_SCHEMA ||
    receipt.repository !== repository ||
    !SHA.test(receipt.sourceHeadSha ?? '') ||
    !SHA.test(receipt.mergeGroupHeadSha ?? '') ||
    ![
      receipt.prNumber,
      receipt.workflowRunId,
      receipt.workflowRunAttempt,
      receipt.completedAt,
    ].every(value => Number.isSafeInteger(value) && value > 0)
  ) {
    fail('trusted admission recovery receipt is malformed');
  }
  if (receipt.prNumber !== prNumber || receipt.sourceHeadSha !== headSha)
    return null;
  return {
    context: ADMISSION_RECOVERY_CONTEXT,
    state: 'success',
    creator: { type: 'Bot', login: 'jovie-bot[bot]' },
    description: admissionRecoveryDescription(receipt),
    target_url: `https://github.com/${repository}/actions/runs/${receipt.workflowRunId}`,
  };
}

function parseTrustedAdmissionRecoveryStatus(status, repository) {
  if (
    status?.context !== ADMISSION_RECOVERY_CONTEXT ||
    String(status?.state ?? '').toLowerCase() !== 'success'
  )
    return null;
  const creator = statusCreator(status);
  if (
    creator.type !== 'Bot' ||
    ![
      'jovie-bot[bot]',
      'jovie-ci-lane[bot]',
      'jovie-symphony-lane[bot]',
      'jovie-agents-lane[bot]',
      'jovie-bot',
      'jovie-ci-lane',
      'jovie-symphony-lane',
      'jovie-agents-lane',
    ].includes(creator.login)
  )
    return null;
  const match =
    /^pr=([1-9][0-9]*);run=([1-9][0-9]*);try=([1-9][0-9]*);at=([1-9][0-9]*)$/.exec(
      String(status.description ?? '')
    );
  if (!match) return null;
  const [prNumber, runId, runAttempt, completedAt] = match.slice(1).map(Number);
  if (
    ![prNumber, runId, runAttempt, completedAt].every(
      value => Number.isSafeInteger(value) && value > 0
    ) ||
    actionsRunId(status.target_url ?? status.targetUrl, repository) !== runId
  )
    return null;
  return {
    prNumber,
    runId,
    runAttempt,
    completedAt,
    targetUrl: status.target_url ?? status.targetUrl,
  };
}

/**
 * A trusted hold-removal event restores only its exact current source intent.
 * @param {{ eventName?: string, event?: any }} [input]
 */
export function ownerHoldReleaseIntent({ eventName, event } = {}) {
  const pr = event?.pull_request;
  const releasedAt = Date.parse(pr?.updated_at);
  if (
    eventName !== 'pull_request_target' ||
    event?.action !== 'unlabeled' ||
    event?.label?.name !== 'hold' ||
    pr?.state !== 'open' ||
    pr?.draft !== false ||
    !Number.isSafeInteger(pr?.number) ||
    pr.number <= 0 ||
    !/^[0-9a-f]{40}$/.test(pr?.head?.sha ?? '') ||
    !Number.isFinite(releasedAt)
  )
    return null;
  return { prNumber: pr.number, headSha: pr.head.sha, releasedAt };
}

export const REVISION_FAILED_AT_HEAD = 'revision-failed-at-head';
// Labels whose removal by a person is an explicit release of a failed head.
export const HUMAN_RELEASE_LABELS = Object.freeze(['hold', 'queue-poison']);

/**
 * A person (never a bot or app) removing `hold` or `queue-poison` from the
 * current head is the explicit release JOV-6620 allows for a head whose merge
 * group failed. jovie-bot's lanes lift `queue-poison` on their own schedule
 * (#22280 and #21869, 2026-10-20), so a bot removal is never a release.
 * @param {{ eventName?: string, event?: any }} [input]
 */
export function humanFailureReleaseIntent({ eventName, event } = {}) {
  const pr = event?.pull_request;
  const sender = event?.sender;
  const label = String(event?.label?.name ?? '').toLowerCase();
  if (
    eventName !== 'pull_request_target' ||
    event?.action !== 'unlabeled' ||
    !HUMAN_RELEASE_LABELS.includes(label) ||
    sender?.type !== 'User' ||
    typeof sender?.login !== 'string' ||
    /\[bot\]$/i.test(sender.login) ||
    pr?.state !== 'open' ||
    pr?.draft !== false ||
    !Number.isSafeInteger(pr?.number) ||
    pr.number <= 0 ||
    !/^[0-9a-f]{40}$/.test(pr?.head?.sha ?? '')
  )
    return null;
  return {
    prNumber: pr.number,
    headSha: pr.head.sha,
    releasedBy: sender.login,
    label,
  };
}

/**
 * Converts a failed-head block into one retry only for an exact human release
 * of that head. Deterministic failures stay blocked: a rerun cannot pass. The
 * retry reservation (FAILURE_RETRY_CONTEXT) makes each release single-use.
 * @param {{ failure: any, release: any, prNumber: number, headSha: string }} input
 */
export function humanReleaseDisposition({
  failure,
  release,
  prNumber,
  headSha,
}) {
  if (
    !release ||
    failure?.action !== 'block' ||
    ![
      REVISION_FAILED_AT_HEAD,
      'revision-retry-spent',
      'revision-retry-exhausted',
    ].includes(failure.reason) ||
    release.prNumber !== prNumber ||
    release.headSha !== headSha ||
    !failure.latest
  )
    return failure;
  return { ...failure, action: 'retry-once', reason: 'human-failure-release' };
}

/**
 * Recovery never replaces a source failure; owner hold release is not a CI retry.
 * @param {{ failure: object, statuses: object[], repository: string, prNumber: number, lastRemoval: string|undefined, headCommittedAt: string|undefined, autoMergeEnabled: boolean, headSha?: string, lastRemovalReason?: string, ownerHoldRelease?: object|null }} input
 */
export const ADMISSION_RECOVERY_BACKOFF_MS = 15 * 60 * 1000;

export function reenrollmentDisposition({
  failure,
  statuses,
  repository,
  prNumber,
  lastRemoval,
  headCommittedAt,
  autoMergeEnabled,
  headSha = undefined,
  lastRemovalReason = undefined,
  ownerHoldRelease = undefined,
  now = Date.now(),
}) {
  const removedAt = Date.parse(lastRemoval);
  const committedAt = Date.parse(headCommittedAt);
  if (
    !lastRemoval ||
    (Number.isFinite(committedAt) && committedAt > removedAt) ||
    failure.action !== 'allow'
  )
    return failure;
  const blocked = reason => ({ ...failure, action: 'block', reason });
  if (
    Number.isFinite(removedAt) &&
    Number.isFinite(committedAt) &&
    lastRemovalReason === 'manual' &&
    ownerHoldRelease &&
    failure.reason === 'no-revision-failure' &&
    Array.isArray(failure.failures) &&
    failure.failures.length === 0 &&
    ownerHoldRelease?.prNumber === prNumber &&
    /^[0-9a-f]{40}$/.test(headSha ?? '') &&
    ownerHoldRelease.headSha === headSha &&
    Number.isFinite(ownerHoldRelease.releasedAt) &&
    ownerHoldRelease.releasedAt >= removedAt &&
    !statuses
      .map(status => parseTrustedRetryStatus(status, repository))
      .find(Boolean)
  )
    return { ...failure, reason: 'owner-hold-release', removalAt: removedAt };
  if (!autoMergeEnabled || !Number.isFinite(removedAt))
    return blocked('removed-without-recovery-intent');
  const recoveries = statuses
    .map(status => parseTrustedAdmissionRecoveryStatus(status, repository))
    .filter(record => record?.prNumber === prNumber);
  const latest = recoveries.reduce(
    (current, candidate) =>
      !current || candidate.completedAt > current.completedAt
        ? candidate
        : current,
    null
  );
  if (!latest || latest.completedAt < removedAt)
    return blocked('no-current-admission-recovery');
  // A quota or gateway ejection re-admitted at once re-enters the same dry
  // bucket (2026-10-13 07:52Z storm); the next sweep after the backoff retries.
  if (now - latest.completedAt < ADMISSION_RECOVERY_BACKOFF_MS)
    return blocked('admission-recovery-backoff');
  const retry = statuses
    .map(status => parseTrustedRetryStatus(status, repository))
    .find(
      item =>
        item &&
        item.runId === latest.runId &&
        item.runAttempt === latest.runAttempt
    );
  return retry && !retry.released
    ? blocked('admission-retry-spent')
    : {
        ...failure,
        action: 'retry-once',
        reason: 'bounded-admission-recovery',
        latest,
      };
}

// Failures that say something about the source revision. A runner, checkout or
// startup failure (transient-infrastructure) and a red queue base say nothing,
// so they never count toward exhausting the revision's retry.
const NON_ATTRIBUTABLE_CLASSES = new Set([
  'transient-infrastructure',
  'base-branch',
]);
export function attributableFailureCount(failures) {
  return failures.filter(
    item => !NON_ATTRIBUTABLE_CLASSES.has(item.classification)
  ).length;
}

// The exact commit endpoint scopes failures. JOV-6620: a merge group that
// failed at source head X never re-enrolls X automatically, whatever product
// step failed (deterministic, retryable product test, or unclassified). X
// waits for a new head or an explicit human release (humanFailureRelease).
// PR #22280 (2026-10-20) re-entered at its failed head twice: once through
// victim rearm and once through the old one-retry allowance for
// retryable-product failures, and each re-entry ejected the groups behind it.
// Only failures that say nothing about X (a runner/checkout failure, or a red
// queue base after main moves) keep an automatic retry. Each infrastructure
// failure gets its own retry and never exhausts the revision.
/** @param {{ statuses?: unknown[], repository?: string, currentMainSha?: string }} input */
export function revisionFailureDisposition({
  statuses,
  repository,
  currentMainSha,
}) {
  if (!Array.isArray(statuses)) fail('revision statuses are incomplete');
  const failures = statuses
    .map(status => parseTrustedFailureStatus(status, repository))
    .filter(Boolean);
  const retries = statuses
    .map(status => parseTrustedRetryStatus(status, repository))
    .filter(Boolean);
  if (failures.length === 0) {
    return { action: 'allow', reason: 'no-revision-failure', failures: [] };
  }
  const latest = failures.reduce((current, candidate) =>
    candidate.failureNumber > current.failureNumber ? candidate : current
  );
  const result = (action, reason) => ({ action, reason, failures, latest });
  if (failures.some(item => item.classification === 'deterministic-source')) {
    return result('block', 'deterministic-source-failure');
  }
  if (latest.classification === 'base-branch') {
    const resolved =
      SHA.test(currentMainSha ?? '') &&
      SHA.test(latest.mainSha ?? '') &&
      currentMainSha !== latest.mainSha;
    if (!resolved) return result('block', 'base-branch-failure');
  }
  if (attributableFailureCount(failures) >= 2) {
    return result('block', 'revision-retry-exhausted');
  }
  if (!NON_ATTRIBUTABLE_CLASSES.has(latest.classification)) {
    return result('block', REVISION_FAILED_AT_HEAD);
  }
  // Newest statuses win: a proven rejection releases only its reservation.
  const latestRetry = retries.find(
    retry =>
      retry.runId === latest.runId && retry.runAttempt === latest.runAttempt
  );
  return latestRetry && !latestRetry.released
    ? result('block', 'revision-retry-spent')
    : result(
        'retry-once',
        latest.classification === 'base-branch'
          ? 'base-branch-resolved'
          : 'bounded-infrastructure-recovery'
      );
}

function failureDescription({ classification, failureNumber, run, mainSha }) {
  const description = `class=${classification};n=${failureNumber};run=${run.id};try=${run.run_attempt}`;
  return classification === 'base-branch'
    ? `${description};main=${mainSha}`
    : description;
}

/** Only consumes the trusted failure-hold job output, never PR-provided data. */
export function readFailureReceipt(raw, repository) {
  if (raw === undefined || raw === '') return null;
  if (typeof raw !== 'string') fail('trusted failure receipt is malformed');
  const receipt = JSON.parse(raw);
  if (
    !receipt ||
    receipt.schema !== FAILURE_HOLD_SCHEMA ||
    receipt.repository !== repository ||
    !SHA.test(receipt.sourceHeadSha ?? '') ||
    !FAILURE_CLASSES.includes(receipt.classification) ||
    (receipt.classification === 'base-branch' &&
      !SHA.test(receipt.mainSha ?? '')) ||
    ![
      receipt.prNumber,
      receipt.failureNumber,
      receipt.workflowRunId,
      receipt.workflowRunAttempt,
    ].every(value => Number.isSafeInteger(value) && value > 0)
  ) {
    fail('trusted failure receipt is malformed');
  }
  return receipt;
}

export function failureReceiptStatus(raw, { repository, prNumber, headSha }) {
  const receipt = readFailureReceipt(raw, repository);
  if (!receipt) return null;
  if (receipt.prNumber !== prNumber || receipt.sourceHeadSha !== headSha)
    return null;
  return {
    context: FAILURE_HOLD_CONTEXT,
    state: 'success',
    creator: { type: 'Bot', login: 'jovie-bot[bot]' },
    description: failureDescription({
      classification: receipt.classification,
      failureNumber: receipt.failureNumber,
      mainSha: receipt.mainSha,
      run: {
        id: receipt.workflowRunId,
        run_attempt: receipt.workflowRunAttempt,
      },
    }),
    target_url: `https://github.com/${repository}/actions/runs/${receipt.workflowRunId}`,
  };
}

export function retrySpentDescription(record) {
  return `spent:run=${record.runId};try=${record.runAttempt}`;
}

export function retryReleasedDescription(record) {
  return `released:run=${record.runId};try=${record.runAttempt}`;
}

function errorText(error) {
  if (typeof error === 'string') return error;
  if (!error || typeof error !== 'object') return '';
  return ['message', 'stderr', 'stdout']
    .map(key => {
      const value = error[key];
      if (typeof value === 'string') return value;
      if (value instanceof Uint8Array)
        return Buffer.from(value).toString('utf8');
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

/**
 * GitHub removes a PR when its merge_group run fails. The Jovie Bot token
 * minted for this job does not include merge-queue write, so dequeuePullRequest
 * answers "Resource not accessible by integration". An already-removed PR
 * answers that it is not in the queue. Both are logged and non-fatal.
 * @returns {'inaccessible' | 'not-in-queue' | null}
 */
export function classifyDequeueDenial(error) {
  const text = errorText(error);
  if (/resource not accessible by integration/i.test(text))
    return 'inaccessible';
  if (
    /not in (?:the |a )?merge queue/i.test(text) ||
    /not in queue/i.test(text)
  ) {
    return 'not-in-queue';
  }
  return null;
}

/** GitHub's answer to disablePullRequestAutoMerge when nothing is armed. */
export function autoMergeWasNotArmed(error) {
  return /can't disable auto-merge for this pull request/i.test(
    errorText(error)
  );
}

/** Only an explicit mutation rejection may release a reserved retry. */
export function enqueueWasRejected(error) {
  if (!error || typeof error !== 'object') return false;
  const response =
    /** @type {{ data?: { enqueuePullRequest?: unknown }, errors?: unknown }} */ (
      error
    );
  if (
    response.data?.enqueuePullRequest !== null ||
    !Array.isArray(response.errors) ||
    response.errors.length === 0
  )
    return false;
  return response.errors.every(
    item =>
      item &&
      typeof item === 'object' &&
      ['UNPROCESSABLE', 'FORBIDDEN', 'NOT_FOUND', 'RATE_LIMITED'].includes(
        item.type
      ) &&
      Array.isArray(item.path) &&
      item.path[0] === 'enqueuePullRequest'
  );
}

function validateRun(run, repository) {
  const front = parseMergeQueueBranch(run?.head_branch);
  if (!front) fail('run is not an exact main merge-queue ref');
  if (
    !MERGE_GROUP_FAILURE_WORKFLOWS.has(run.workflow_id) ||
    run.event !== 'merge_group' ||
    run.status !== 'completed' ||
    run.path !== MERGE_GROUP_FAILURE_WORKFLOWS.get(run.workflow_id) ||
    run.repository?.full_name !== repository ||
    run.head_repository?.full_name !== repository ||
    !MERGE_GROUP_FAILURE_CONCLUSIONS.has(run.conclusion) ||
    !Number.isSafeInteger(run.id) ||
    run.id < 1 ||
    !Number.isSafeInteger(run.run_attempt) ||
    run.run_attempt < 1 ||
    !Number.isFinite(Date.parse(run.created_at)) ||
    !SHA.test(String(run.head_sha ?? '').toLowerCase()) ||
    run.html_url !== `https://github.com/${repository}/actions/runs/${run.id}`
  ) {
    fail('run evidence is not a terminal merge-group CI failure');
  }
  return front;
}

function liveEntryHeadSha(pr) {
  const oid = pr?.mergeQueueEntry?.headCommit?.oid;
  return typeof oid === 'string' ? oid.toLowerCase() : null;
}

// The exact source is still queued, but its live entry is not the failed
// group: either rebuilt on a new combined head or waiting for one (null).
export function supersededByLiveEntry(pr, sourceHeadSha, groupHeadSha) {
  return (
    pr?.state === 'OPEN' &&
    String(pr?.headRefOid ?? '').toLowerCase() === sourceHeadSha &&
    pr.isInMergeQueue === true &&
    Boolean(pr.mergeQueueEntry) &&
    liveEntryHeadSha(pr) !== groupHeadSha
  );
}

// HEADGREEN grouping (live ruleset 10512119, 2026-10-29): only the group head's
// build gates the merge, so a failed build of an entry that still has entries
// queued behind it, on the same live synthetic commit, did not eject it and a
// later head can still land it. Holding it (durable failure status, dequeue,
// auto-merge off) would turn a one-off intermediate flake into the ejection
// HEADGREEN exists to avoid. The last queued entry has nothing behind it, so
// its failure still holds, and so does a deterministic-source failure (a PR
// that is itself broken must not wait to eject everyone behind it). Missing
// queue data fails closed to the old behavior.
export function coveredByLaterEntry(pr, sourceHeadSha, groupHeadSha) {
  const entry = pr?.mergeQueueEntry;
  const total = entry?.mergeQueue?.entries?.totalCount;
  return (
    pr?.state === 'OPEN' &&
    String(pr?.headRefOid ?? '').toLowerCase() === sourceHeadSha &&
    pr.isInMergeQueue === true &&
    Number.isInteger(entry?.position) &&
    Number.isInteger(total) &&
    entry.position < total &&
    liveEntryHeadSha(pr) === groupHeadSha
  );
}

// A group's base is main or, behind other entries, the head of the group ahead
// of it. Until that group's CI passes, a failure here can be the ahead entry's:
// on 2026-10-12 #21393 was held as deterministic-source for a DESIGN.md check
// that #21384, ahead of it, broke, while the ahead group was still running.
// GitHub removes the failing ahead entry and rebuilds this one, so the hold
// waits. An unreadable base keeps the hold (`baseOnMain` defaults true).
// Exception: when the ahead run COMPLETED and its own results prove every
// signal failing here passed (or was not selected) on this base, the failure
// is this group's own (2026-10-21: a lanes flake ahead hid #22331's guard
// failure for several cycles). See lib/merge-group-ahead-attribution.mjs.
/** @typedef {{ baseOnMain?: boolean, aheadConclusion?: string | null, aheadRunId?: number | null, signatureAttribution?: { attributable: boolean, reason: string } }} AheadGroup */
/** @param {AheadGroup} [group] */
export function aheadEntryUnproven({
  baseOnMain = true,
  aheadConclusion,
  signatureAttribution,
} = {}) {
  return (
    baseOnMain === false &&
    aheadConclusion !== 'success' &&
    signatureAttribution?.attributable !== true
  );
}

// Persist the exact-source failure before removing native merge intent. A new
// head keeps the old receipt and receives no dequeue/disable mutation.
// Dequeue denial is non-fatal: this token cannot call dequeuePullRequest, and
// GitHub already removes the PR when the merge_group run fails.
/**
 * @param {{ repository: string, run: object, timeline: object[], failedSteps?: string[], statuses?: object[], annotationText?: string, changedFiles?: string[], mainSha?: string, admissionText?: string, fetchTimeoutText?: string, aheadGroup?: AheadGroup }} input
 * @param {{ writeStatus: Function, readPullRequest: Function, dequeuePullRequest: Function, disableAutoMerge: Function, recordDequeue?: Function }} io
 */
export async function applyMergeGroupFailure(
  {
    repository,
    run,
    timeline,
    failedSteps,
    statuses,
    annotationText = '',
    changedFiles,
    mainSha,
    admissionText = '',
    fetchTimeoutText = '',
    aheadGroup,
  },
  {
    writeStatus,
    readPullRequest,
    dequeuePullRequest,
    disableAutoMerge,
    recordDequeue,
  }
) {
  const front = validateRun(run, repository);
  const sourceHeadSha = sourceHeadForRun(timeline, run.created_at);
  const classification = classifyMergeGroupFailure({
    conclusion: run.conclusion,
    failedSteps,
    annotationText,
    changedFiles,
    admissionText,
    fetchTimeoutText,
  });
  const groupHeadSha = String(run.head_sha).toLowerCase();
  // Quota or gateway trouble spends no source-failure retry and removes no merge
  // intent; GitHub already ejected the group and enrollment re-arms it.
  if (classification === TRANSIENT_ADMISSION_CLASS) {
    let admissionRecoveryReceipt;
    const completedAt = Date.parse(run.updated_at);
    if (
      Number.isSafeInteger(completedAt) &&
      completedAt >= Date.parse(run.created_at)
    ) {
      const current = await readPullRequest(front.prNumber);
      if (
        current?.state === 'OPEN' &&
        String(current.headRefOid ?? '').toLowerCase() === sourceHeadSha &&
        !supersededByLiveEntry(current, sourceHeadSha, groupHeadSha)
      ) {
        admissionRecoveryReceipt = {
          schema: ADMISSION_RECOVERY_SCHEMA,
          repository,
          prNumber: front.prNumber,
          sourceHeadSha,
          mergeGroupHeadSha: groupHeadSha,
          workflowRunId: run.id,
          workflowRunAttempt: run.run_attempt,
          completedAt,
        };
        await writeStatus({
          sha: sourceHeadSha,
          context: ADMISSION_RECOVERY_CONTEXT,
          state: 'success',
          description: admissionRecoveryDescription(admissionRecoveryReceipt),
          targetUrl: run.html_url,
        });
      }
    }
    return {
      schema: FAILURE_HOLD_SCHEMA,
      repository,
      prNumber: front.prNumber,
      sourceHeadSha,
      mergeGroupHeadSha: groupHeadSha,
      workflowRunId: run.id,
      workflowRunAttempt: run.run_attempt,
      classification,
      skipped: true,
      statusWritten: false,
      dequeued: false,
      dequeueOutcome: 'not-attempted',
      autoMergeDisabled: false,
      admissionRecoveryReceipt,
    };
  }
  const recordedMainSha = String(mainSha ?? '').toLowerCase();
  if (classification === 'base-branch' && !SHA.test(recordedMainSha)) {
    fail('current main sha is unavailable');
  }
  let current = await readPullRequest(front.prNumber);
  // A run whose group GitHub already rebuilt says nothing about the live
  // entry. Disabling auto-merge then ejects the fresh group and rebuilds
  // every group behind it, whose stale runs fail in turn (2026-10-03 churn).
  if (supersededByLiveEntry(current, sourceHeadSha, groupHeadSha)) {
    return {
      schema: FAILURE_HOLD_SCHEMA,
      repository,
      prNumber: front.prNumber,
      sourceHeadSha,
      mergeGroupHeadSha: groupHeadSha,
      liveMergeGroupHeadSha: liveEntryHeadSha(current),
      workflowRunId: run.id,
      workflowRunAttempt: run.run_attempt,
      classification,
      superseded: true,
      statusWritten: false,
      dequeued: false,
      dequeueOutcome: 'not-attempted',
      autoMergeDisabled: false,
    };
  }
  if (
    !failedSteps?.includes?.(WORKFLOW_LOAD_STEP) &&
    classification !== 'deterministic-source' &&
    coveredByLaterEntry(current, sourceHeadSha, groupHeadSha)
  ) {
    return {
      schema: FAILURE_HOLD_SCHEMA,
      repository,
      prNumber: front.prNumber,
      sourceHeadSha,
      mergeGroupHeadSha: groupHeadSha,
      workflowRunId: run.id,
      workflowRunAttempt: run.run_attempt,
      classification,
      skipped: true,
      coveredByLaterEntry: true,
      statusWritten: false,
      dequeued: false,
      dequeueOutcome: 'not-attempted',
      autoMergeDisabled: false,
    };
  }
  if (
    !failedSteps?.includes?.(WORKFLOW_LOAD_STEP) &&
    aheadEntryUnproven(aheadGroup)
  ) {
    return {
      schema: FAILURE_HOLD_SCHEMA,
      repository,
      prNumber: front.prNumber,
      sourceHeadSha,
      mergeGroupHeadSha: groupHeadSha,
      mergeGroupBaseSha: front.baseSha,
      aheadConclusion: aheadGroup.aheadConclusion ?? null,
      ...(aheadGroup.signatureAttribution
        ? { aheadAttribution: aheadGroup.signatureAttribution }
        : {}),
      workflowRunId: run.id,
      workflowRunAttempt: run.run_attempt,
      classification,
      skipped: true,
      aheadEntryUnproven: true,
      statusWritten: false,
      dequeued: false,
      dequeueOutcome: 'not-attempted',
      autoMergeDisabled: false,
    };
  }
  const existing = revisionFailureDisposition({ statuses, repository });
  const duplicate = existing.failures.find(
    item => item.runId === run.id && item.runAttempt === run.run_attempt
  );
  const failureNumber = duplicate
    ? duplicate.failureNumber
    : Math.max(0, ...existing.failures.map(item => item.failureNumber)) + 1;
  const description = failureDescription({
    classification,
    failureNumber,
    run,
    mainSha: recordedMainSha,
  });
  if (!duplicate) {
    await writeStatus({
      sha: sourceHeadSha,
      context: FAILURE_HOLD_CONTEXT,
      description,
      state: 'success',
      targetUrl: run.html_url,
    });
  }

  let groupEjected = false;
  if (failedSteps?.includes?.(WORKFLOW_LOAD_STEP)) {
    await writeStatus({
      sha: groupHeadSha,
      context: WORKFLOW_LOAD_EJECT_CONTEXT,
      description: `Workflows in this group cannot load; held ${sourceHeadSha.slice(0, 12)}`,
      state: 'failure',
      targetUrl: run.html_url,
    });
    groupEjected = true;
  }

  current = await readPullRequest(front.prNumber);
  let dequeued = false;
  let autoMergeDisabled = false;
  let dequeueOutcome = 'not-attempted';
  const currentMatches = () =>
    current?.state === 'OPEN' &&
    String(current?.headRefOid ?? '').toLowerCase() === sourceHeadSha;
  if (currentMatches() && current.isInMergeQueue && current.mergeQueueEntry) {
    current = await readPullRequest(front.prNumber);
    if (currentMatches() && current.isInMergeQueue && current.mergeQueueEntry) {
      try {
        // The durable exact-head failure status above is authoritative even if
        // this advisory comment fails. Record intent before the removal so a
        // crash cannot turn a completed action into an unrecorded one.
        try {
          await recordDequeue?.({
            number: front.prNumber,
            head: sourceHeadSha,
            code: 'poison',
            reason: `merge-group failure hold: run ${run.id} failed for head ${sourceHeadSha.slice(0, 12)}`,
          });
        } catch (error) {
          console.error(
            `::warning::merge-group-failure-hold could not record the dequeue reason: ${errorText(error).slice(0, 200)}`
          );
        }
        current = await readPullRequest(front.prNumber);
        if (
          currentMatches() &&
          current.isInMergeQueue &&
          current.mergeQueueEntry
        ) {
          await dequeuePullRequest(current.id);
          dequeued = true;
          dequeueOutcome = 'dequeued';
        }
      } catch (error) {
        const denial = classifyDequeueDenial(error);
        if (!denial) throw error;
        dequeueOutcome = denial;
        const detail = errorText(error).replace(/\s+/g, ' ').slice(0, 300);
        console.error(
          `::warning::merge-group-failure-hold dequeue ${denial}: ${detail}. GitHub removes a pull request when its merge_group run fails; the failure hold still persists.`
        );
      }
      current = await readPullRequest(front.prNumber);
    }
  }
  // A queued PR can read autoMergeRequest null, during and just after the
  // dequeue, while its armed auto-merge re-enqueues the same head seconds
  // later. On 2026-10-03 #20354 re-entered the queue 13 times and failed 8
  // holds on one unchanged head (JOV-7708). Disable on every exact-head hold;
  // "nothing to disable" is the only tolerated answer.
  if (currentMatches()) {
    current = await readPullRequest(front.prNumber);
    if (currentMatches()) {
      try {
        await disableAutoMerge(current.id);
        autoMergeDisabled = true;
      } catch (error) {
        if (!autoMergeWasNotArmed(error)) throw error;
      }
      current = await readPullRequest(front.prNumber);
    }
  }
  const benignDequeue = dequeueOutcome !== 'not-attempted' && !dequeued;
  const stillQueued =
    currentMatches() &&
    (current.isInMergeQueue || current.mergeQueueEntry !== null);
  if (
    (stillQueued && !benignDequeue) ||
    (currentMatches() && current.autoMergeRequest !== null)
  ) {
    fail(
      'exact source revision still has native queue intent after suppression'
    );
  }

  return {
    schema: FAILURE_HOLD_SCHEMA,
    repository,
    prNumber: front.prNumber,
    sourceHeadSha,
    mergeGroupHeadSha: groupHeadSha,
    mergeGroupBaseSha: front.baseSha,
    workflowRunId: run.id,
    workflowRunAttempt: run.run_attempt,
    classification,
    failureNumber,
    mainSha: classification === 'base-branch' ? recordedMainSha : null,
    retryDisposition:
      classification === 'base-branch'
        ? 'requeue-after-base-moves'
        : NON_ATTRIBUTABLE_CLASSES.has(classification)
          ? 'one-queue-authority-retry'
          : 'blocked-until-new-source-head',
    statusWritten: !duplicate,
    currentHeadSha:
      typeof current?.headRefOid === 'string'
        ? current.headRefOid.toLowerCase()
        : null,
    exactHeadStillCurrent: currentMatches(),
    ...(aheadGroup?.signatureAttribution
      ? { aheadAttribution: aheadGroup.signatureAttribution }
      : {}),
    dequeued,
    dequeueOutcome,
    autoMergeDisabled,
    ...(groupEjected ? { groupEjected } : {}),
  };
}

function gh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export async function recordDequeueReason(
  { repository, number, code, reason, head },
  { run = runGh, now = () => new Date().toISOString() } = {}
) {
  const record = {
    code,
    reason,
    actor: 'merge-group-failure-hold',
    at: now(),
    head,
    outcome: 'requested',
  };
  const result = await run(
    [
      'api',
      '-X',
      'POST',
      `repos/${repository}/issues/${number}/comments`,
      '-f',
      `body=Dequeue requested (${code}): ${reason}\n<!-- queue-dequeue ${JSON.stringify(record)} -->`,
    ],
    { priority: 'repair' }
  );
  if (result.code !== 0)
    throw new Error(
      result.stderr || `reason recording failed (${result.code})`
    );
}

function ghJson(args) {
  return JSON.parse(gh(args));
}

function restPages(path) {
  const rows = [];
  for (let page = 1; page <= 30; page += 1) {
    const response = ghJson([
      'api',
      `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`,
    ]);
    const batch = Array.isArray(response) ? response : response.jobs;
    if (!Array.isArray(batch))
      fail(`paginated response is malformed for ${path}`);
    rows.push(...batch);
    if (batch.length < 100) return rows;
  }
  fail(`paginated response exceeded the safety limit for ${path}`);
}

function graphql(query, variables) {
  const args = ['api', 'graphql', '-f', `query=${query}`];
  for (const [name, value] of Object.entries(variables)) {
    if (value !== null && value !== undefined) {
      args.push(Number.isInteger(value) ? '-F' : '-f', `${name}=${value}`);
    }
  }
  const response = ghJson(args);
  if (response.errors?.length) fail(response.errors[0].message);
  return response.data;
}

const TIMELINE_QUERY = `query($owner:String!,$name:String!,$number:Int!,$cursor:String){repository(owner:$owner,name:$name){pullRequest(number:$number){timelineItems(first:100,after:$cursor,itemTypes:[ADDED_TO_MERGE_QUEUE_EVENT,REMOVED_FROM_MERGE_QUEUE_EVENT,PULL_REQUEST_COMMIT,HEAD_REF_FORCE_PUSHED_EVENT]){nodes{__typename ... on AddedToMergeQueueEvent{createdAt} ... on RemovedFromMergeQueueEvent{createdAt reason beforeCommit{oid}} ... on PullRequestCommit{commit{oid}} ... on HeadRefForcePushedEvent{createdAt afterCommit{oid}}} pageInfo{hasNextPage endCursor}}}}}`;
const PR_QUERY = `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){id state headRefOid isInMergeQueue mergeQueueEntry{id position headCommit{oid} mergeQueue{entries{totalCount}}} autoMergeRequest{enabledAt}}}}`;

function readTimeline(repository, prNumber) {
  const [owner, name] = repository.split('/');
  const nodes = [];
  let cursor = null;
  do {
    const connection = graphql(TIMELINE_QUERY, {
      owner,
      name,
      number: prNumber,
      cursor,
    })?.repository?.pullRequest?.timelineItems;
    if (!connection || !Array.isArray(connection.nodes)) {
      fail('pull request timeline is unavailable');
    }
    nodes.push(...connection.nodes);
    cursor = connection.pageInfo?.hasNextPage
      ? connection.pageInfo.endCursor
      : null;
  } while (cursor);
  return nodes;
}

function readPullRequest(repository, prNumber) {
  const [owner, name] = repository.split('/');
  const pr = graphql(PR_QUERY, { owner, name, number: prNumber })?.repository
    ?.pullRequest;
  if (!pr) fail(`PR #${prNumber} is unavailable`);
  return pr;
}

// Failure annotations of the jobs whose admission step failed. Unreadable
// evidence returns '' and leaves the failure to the source classes.
function admissionEvidence(repository, jobs) {
  const failedJobs = jobs.filter(
    job =>
      Array.isArray(job?.steps) &&
      job.steps.some(
        step => step?.name === ADMISSION_STEP && step?.conclusion === 'failure'
      )
  );
  const messages = [];
  for (const job of failedJobs) {
    const checkRunId = String(job.check_run_url ?? '').match(
      /\/check-runs\/([1-9][0-9]*)$/
    )?.[1];
    if (!checkRunId) return '';
    try {
      const notes = restPages(
        `repos/${repository}/check-runs/${checkRunId}/annotations`
      ).filter(note => note?.annotation_level === 'failure');
      if (notes.some(note => typeof note.message !== 'string')) return '';
      messages.push(...notes.map(note => note.message));
    } catch {
      return '';
    }
  }
  return messages.join('\n');
}

function instructionContractEvidence(repository, run, jobs, baseSha) {
  const failedJobs = jobs.filter(
    job =>
      Array.isArray(job?.steps) &&
      job.steps.some(
        step =>
          step?.name === INSTRUCTION_CONTRACT_STEP &&
          step?.conclusion === 'failure'
      )
  );
  if (failedJobs.length === 0) return {};
  const messages = [];
  for (const job of failedJobs) {
    if (!Number.isSafeInteger(job.id) || job.id < 1) return {};
    let errors;
    try {
      const checkRunId = String(job.check_run_url ?? '').match(
        /\/check-runs\/([1-9][0-9]*)$/
      )?.[1];
      if (!checkRunId) throw new Error('check-run identity unavailable');
      const notes = restPages(
        `repos/${repository}/check-runs/${checkRunId}/annotations`
      );
      if (
        notes.some(
          note =>
            note?.annotation_level !== 'failure' ||
            typeof note.message !== 'string' ||
            !note.message.trim()
        )
      )
        return {};
      errors = notes.map(note => note.message);
    } catch {
      // Missing or incomplete annotations require the complete job log instead.
    }
    if (!errors?.length) {
      try {
        errors = instructionErrorsFromLog(
          gh([
            'run',
            'view',
            String(run.id),
            '--repo',
            repository,
            '--job',
            String(job.id),
            '--log',
          ])
        );
      } catch {
        // Missing logs leave the failure unclassified.
      }
    }
    if (!errors || !hasOnlyBudgetErrors(errors.join('\n'))) return {};
    messages.push(...errors);
  }
  const annotationText = messages.join('\n');
  try {
    const compare = ghJson([
      'api',
      `repos/${repository}/compare/${baseSha}...${String(run.head_sha).toLowerCase()}`,
    ]);
    if (!Array.isArray(compare.files) || compare.files.length >= 300) {
      return { annotationText };
    }
    return {
      annotationText,
      changedFiles: compare.files
        .map(file => file?.filename)
        .filter(name => typeof name === 'string'),
    };
  } catch {
    return { annotationText };
  }
}

// The current log is only consumed for a failing `ci-fast (remaining)` job.
// The ahead log is also read when that job SUCCEEDED (JOV-8760): an ahead run
// that failed in another job still proves, through its successful structural
// timings table, that this group's failing commands passed on the base —
// skipping the successful log left every such group waiting unattributed.
function ciFastRemainingLog(
  repository,
  jobs,
  { includeSuccessful = false } = {}
) {
  const job = jobs.find(item => item?.name === CI_FAST_REMAINING_JOB);
  const accepted = includeSuccessful ? ['failure', 'success'] : ['failure'];
  if (
    !job ||
    !accepted.includes(job.conclusion) ||
    !Number.isSafeInteger(job.id)
  )
    return null;
  return gh(['api', `repos/${repository}/actions/jobs/${job.id}/logs`]);
}

// Shadow only (canon/MERGE_QUEUE_STEWARD.md invariant 4): did this group's
// failing signal also fail in a recent group that does not contain the PR?
// The verdict is logged, never applied: holds and enrollment are unchanged
// until the shadow record qualifies a non-attributable class. Membership is
// every queue entry ahead of main in the peer group (its base chain included),
// so a PR riding in a peer's base counts as contained. Bounded to 5 peers and
// never throws.
export const PEER_RECURRENCE_WINDOW_MS = 6 * 60 * 60 * 1000;
export const PEER_RECURRENCE_MAX_PEERS = 5;

export function peerContainsPr(compareCommits, peerPrNumber, prNumber) {
  if (peerPrNumber === prNumber) return true;
  if (!Array.isArray(compareCommits)) return null;
  const suffix = new RegExp(`\\(#${prNumber}\\)$`);
  return compareCommits.some(commit =>
    suffix.test(
      String(commit?.commit?.message ?? '')
        .split('\n')[0]
        .trim()
    )
  );
}

export function readPeerRecurrence(repository, prNumber, run, jobs) {
  try {
    const currentCiFastLog = ciFastRemainingLog(repository, jobs);
    const eligibility = attributeAgainstPeerRuns({
      currentJobs: jobs,
      currentCiFastLog,
      peers: [],
    });
    if (!eligibility.reason.startsWith('signal-not-seen-without-pr:'))
      return eligibility;
    const end = Date.parse(run.updated_at ?? run.created_at);
    const mainSha = ghJson(['api', `repos/${repository}/commits/main`]).sha;
    const listed = ghJson([
      'api',
      `repos/${repository}/actions/workflows/${CI_WORKFLOW_ID}/runs?event=merge_group&status=failure&per_page=30`,
    ]).workflow_runs;
    const candidates = (Array.isArray(listed) ? listed : [])
      .filter(peer => peer?.id !== run.id && peer?.conclusion === 'failure')
      .filter(peer => {
        const at = Date.parse(peer.created_at);
        return at <= end && end - at <= PEER_RECURRENCE_WINDOW_MS;
      })
      .slice(0, PEER_RECURRENCE_MAX_PEERS);
    const peers = candidates.map(peer => {
      const peerJobs = restPages(
        `repos/${repository}/actions/runs/${peer.id}/jobs?filter=latest`
      );
      const compare = ghJson([
        'api',
        `repos/${repository}/compare/${mainSha}...${peer.head_sha}`,
      ]);
      return {
        runId: peer.id,
        conclusion: peer.conclusion,
        containsPr: peerContainsPr(
          compare?.commits,
          parseMergeQueueBranch(peer.head_branch)?.prNumber,
          prNumber
        ),
        ciFastLog: ciFastRemainingLog(repository, peerJobs),
      };
    });
    return {
      ...attributeAgainstPeerRuns({
        currentJobs: jobs,
        currentCiFastLog,
        peers,
      }),
      peersExamined: peers.map(({ runId, containsPr }) => ({
        runId,
        containsPr,
      })),
    };
  } catch (error) {
    return {
      recurring: false,
      reason: `evidence-read-failed:${error instanceof Error ? error.message.slice(0, 120) : 'unknown'}`,
    };
  }
}

// Only a completed, failed ahead run can prove this group's own failure; any
// read error keeps today's wait (no attribution).
/** @returns {AheadGroup} */
function withAheadAttribution(repository, jobs, aheadGroup) {
  if (
    aheadGroup?.baseOnMain !== false ||
    aheadGroup.aheadConclusion !== 'failure' ||
    !Number.isSafeInteger(aheadGroup.aheadRunId)
  ) {
    return aheadGroup;
  }
  try {
    const aheadJobs = restPages(
      `repos/${repository}/actions/runs/${aheadGroup.aheadRunId}/jobs?filter=latest`
    );
    return {
      ...aheadGroup,
      signatureAttribution: attributeAgainstAheadRun({
        currentJobs: jobs,
        aheadJobs,
        aheadConclusion: aheadGroup.aheadConclusion,
        currentCiFastLog: ciFastRemainingLog(repository, jobs),
        aheadCiFastLog: ciFastRemainingLog(repository, aheadJobs, {
          includeSuccessful: true,
        }),
      }),
    };
  } catch {
    return {
      ...aheadGroup,
      signatureAttribution: {
        attributable: false,
        reason: 'evidence-read-failed',
      },
    };
  }
}

// Is the group's base on main, and how did the CI run of the group ahead end?
// Any unreadable answer returns {} (attributable), the pre-existing behavior.
/** @returns {AheadGroup} */
function readAheadGroup(repository, baseSha) {
  try {
    const compare = ghJson([
      'api',
      `repos/${repository}/compare/${baseSha}...main`,
    ]);
    if (
      !['ahead', 'identical', 'behind', 'diverged'].includes(compare?.status)
    ) {
      return {};
    }
    if (compare.status === 'ahead' || compare.status === 'identical') {
      return { baseOnMain: true };
    }
    const runs = ghJson([
      'api',
      `repos/${repository}/actions/runs?head_sha=${baseSha}&event=merge_group&per_page=20`,
    ]).workflow_runs;
    if (!Array.isArray(runs)) return {};
    const ahead = runs
      .filter(item => item?.workflow_id === CI_WORKFLOW_ID)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
    return {
      baseOnMain: false,
      aheadConclusion: ahead?.conclusion ?? null,
      aheadRunId: Number.isSafeInteger(ahead?.id) ? ahead.id : null,
    };
  } catch {
    return {};
  }
}

async function main(argv) {
  if (argv.length !== 2 || argv[0] !== '--event-path') {
    fail(
      'usage: merge-group-failure-hold.mjs --event-path <workflow-run-event>'
    );
  }
  const event = JSON.parse(readFileSync(argv[1], 'utf8'));
  const repository = event?.repository?.full_name;
  const eventRunId = event?.workflow_run?.id;
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '') ||
    !Number.isSafeInteger(eventRunId) ||
    eventRunId < 1
  ) {
    fail('workflow_run event identity is incomplete');
  }
  const run = ghJson(['api', `repos/${repository}/actions/runs/${eventRunId}`]);
  if (run.repository?.full_name !== repository || run.id !== eventRunId) {
    fail('live workflow run identity does not match the event');
  }
  const front = validateRun(run, repository);
  const timeline = readTimeline(repository, front.prNumber);
  const jobs = restPages(
    `repos/${repository}/actions/runs/${run.id}/jobs?filter=latest`
  );
  const failedSteps = jobs.flatMap(job =>
    Array.isArray(job.steps)
      ? job.steps
          .filter(step => step?.conclusion === 'failure')
          .map(step => step.name)
      : []
  );
  if (!isHeldWorkflowFailure(run, failedSteps)) {
    // Other PR Size Guard failures keep their existing handling: no hold.
    process.stdout.write(
      `${JSON.stringify({ skipped: true, reason: 'not-a-held-workflow-failure', workflowRunId: run.id })}\n`
    );
    return;
  }
  const evidence = instructionContractEvidence(
    repository,
    run,
    jobs,
    front.baseSha
  );
  const admissionText = failedSteps.includes(ADMISSION_STEP)
    ? admissionEvidence(repository, jobs)
    : '';
  const fetchTimeoutText = failedSteps.includes(FETCH_STEP)
    ? fetchTimeoutEvidence(run, jobs, job => {
        const checkRunId = String(job.check_run_url ?? '').match(
          /\/check-runs\/([1-9][0-9]*)$/
        )?.[1];
        if (!checkRunId) throw new Error('check-run identity unavailable');
        return restPages(
          `repos/${repository}/check-runs/${checkRunId}/annotations`
        );
      })
    : '';
  const preview = classifyMergeGroupFailure({
    conclusion: run.conclusion,
    failedSteps,
    annotationText: evidence.annotationText,
    changedFiles: evidence.changedFiles,
    admissionText,
    fetchTimeoutText,
  });
  const mainSha =
    preview === 'base-branch'
      ? String(
          ghJson(['api', `repos/${repository}/commits/main`]).sha ?? ''
        ).toLowerCase()
      : undefined;
  const sourceHeadSha = sourceHeadForRun(timeline, run.created_at);
  const statuses = restPages(
    `repos/${repository}/commits/${sourceHeadSha}/statuses`
  );
  const result = await applyMergeGroupFailure(
    {
      repository,
      run,
      timeline,
      failedSteps,
      statuses,
      annotationText: evidence.annotationText,
      changedFiles: evidence.changedFiles,
      mainSha,
      admissionText,
      fetchTimeoutText,
      aheadGroup: withAheadAttribution(
        repository,
        jobs,
        readAheadGroup(repository, front.baseSha)
      ),
    },
    {
      writeStatus: async receipt =>
        gh([
          'api',
          '-X',
          'POST',
          `repos/${repository}/statuses/${receipt.sha}`,
          ...Object.entries({
            state: receipt.state,
            context: receipt.context,
            description: receipt.description,
            target_url: receipt.targetUrl,
          }).flatMap(([key, value]) => ['-f', `${key}=${value}`]),
        ]),
      readPullRequest: async number => readPullRequest(repository, number),
      dequeuePullRequest: async id =>
        graphql(
          'mutation($id:ID!){dequeuePullRequest(input:{id:$id}){clientMutationId}}',
          { id }
        ),
      disableAutoMerge: async id =>
        graphql(
          'mutation($id:ID!){disablePullRequestAutoMerge(input:{pullRequestId:$id}){clientMutationId}}',
          { id }
        ),
      recordDequeue: data => recordDequeueReason({ repository, ...data }),
    }
  );
  const serialized = JSON.stringify(result);
  // Failure holds and admission recovery have separate trusted receipts.
  if (process.env.GITHUB_OUTPUT && !result.superseded && !result.skipped) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `failure_receipt=${serialized}\n`
    );
  }
  if (process.env.GITHUB_OUTPUT && result.admissionRecoveryReceipt) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `admission_recovery_receipt=${JSON.stringify(result.admissionRecoveryReceipt)}\n`
    );
  }
  process.stdout.write(`${serialized}\n`);
  if (preview === 'deterministic-source' && !result.skipped) {
    const peerRecurrence = {
      schema: 'jovie-merge-group-peer-recurrence/v1',
      mode: 'shadow',
      prNumber: front.prNumber,
      workflowRunId: run.id,
      ...readPeerRecurrence(repository, front.prNumber, run, jobs),
    };
    const line = JSON.stringify(peerRecurrence);
    // Not a job output: failure_receipt stays the only trusted hold output.
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `\n### Peer recurrence (shadow)\n\n\`${peerRecurrence.reason}\`\n\n\`\`\`json\n${line}\n\`\`\`\n`
      );
    if (peerRecurrence.recurring)
      process.stdout.write(
        `::notice title=peer recurrence (shadow)::#${front.prNumber} failing signals also failed without it in run(s) ${peerRecurrence.peerRunIds.join(', ')}\n`
      );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
