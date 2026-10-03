#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  DETERMINISTIC_MERGE_GROUP_FAILURE_STEPS,
  MERGE_GROUP_FAILURE_CONCLUSIONS,
  RETRYABLE_PRODUCT_FAILURE_STEPS,
} from './lib/merge-queue-guard.mjs';

export const FAILURE_HOLD_SCHEMA = 'jovie-merge-group-failure-hold/v1';
export const FAILURE_HOLD_CONTEXT = 'jovie-queue-failure-hold/v1';
export const FAILURE_RETRY_CONTEXT = 'jovie-queue-failure-retry/v1';
export const CI_WORKFLOW_ID = 178737329;
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
const BUDGET_EXCESS = /bytes exceeds \d+/;
const INSTRUCTION_CONTRACT_STEP = 'Evaluate repository instruction contracts';
const RETRY_DESCRIPTION =
  /^(spent|released):run=([1-9][0-9]*);try=([1-9][0-9]*)$/;
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

export function classifyMergeGroupFailure({
  conclusion,
  failedSteps = [],
  annotationText = '',
  changedFiles,
} = {}) {
  if (!MERGE_GROUP_FAILURE_CONCLUSIONS.has(conclusion)) {
    fail(`unsupported terminal conclusion ${JSON.stringify(conclusion)}`);
  }
  const steps = Array.isArray(failedSteps)
    ? [...new Set(failedSteps.filter(step => typeof step === 'string'))]
    : [];
  if (conclusion === 'failure' || conclusion === 'action_required') {
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
    // A capped instruction file that is already over on the queue base fails
    // every PR. That is repairable by moving main, not by holding the victim.
    if (
      steps.includes(INSTRUCTION_CONTRACT_STEP) &&
      BUDGET_EXCESS.test(String(annotationText)) &&
      Array.isArray(changedFiles)
    ) {
      return changedFiles.some(file => AGENT_CONTEXT_BUDGET_FILES.has(file))
        ? 'deterministic-source'
        : 'base-branch';
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
    !['jovie-bot', 'jovie-bot[bot]'].includes(creator.login)
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
    !['jovie-bot', 'jovie-bot[bot]'].includes(creator.login)
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

// The exact commit endpoint scopes failures: deterministic blocks immediately;
// other failures receive one queue-authority retry.
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
    return resolved
      ? result('retry-once', 'base-branch-resolved')
      : result('block', 'base-branch-failure');
  }
  if (latest.failureNumber >= 2) {
    return result('block', 'revision-retry-exhausted');
  }
  // Newest statuses win: a proven rejection releases only its reservation.
  const latestRetry = retries.find(
    retry =>
      retry.runId === latest.runId && retry.runAttempt === latest.runAttempt
  );
  return latestRetry && !latestRetry.released
    ? result('block', 'revision-retry-spent')
    : result('retry-once', 'bounded-infrastructure-recovery');
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
    run.workflow_id !== CI_WORKFLOW_ID ||
    run.event !== 'merge_group' ||
    run.status !== 'completed' ||
    run.path !== '.github/workflows/ci.yml' ||
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

// Persist the exact-source failure before removing native merge intent. A new
// head keeps the old receipt and receives no dequeue/disable mutation.
// Dequeue denial is non-fatal: this token cannot call dequeuePullRequest, and
// GitHub already removes the PR when the merge_group run fails.
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
  },
  { writeStatus, readPullRequest, dequeuePullRequest, disableAutoMerge }
) {
  const front = validateRun(run, repository);
  const sourceHeadSha = sourceHeadForRun(timeline, run.created_at);
  const classification = classifyMergeGroupFailure({
    conclusion: run.conclusion,
    failedSteps,
    annotationText,
    changedFiles,
  });
  const recordedMainSha = String(mainSha ?? '').toLowerCase();
  if (classification === 'base-branch' && !SHA.test(recordedMainSha)) {
    fail('current main sha is unavailable');
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

  let current = await readPullRequest(front.prNumber);
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
        await dequeuePullRequest(current.id);
        dequeued = true;
        dequeueOutcome = 'dequeued';
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
  if (currentMatches() && current.autoMergeRequest) {
    current = await readPullRequest(front.prNumber);
    if (currentMatches() && current.autoMergeRequest) {
      await disableAutoMerge(current.id);
      autoMergeDisabled = true;
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
    mergeGroupHeadSha: String(run.head_sha).toLowerCase(),
    mergeGroupBaseSha: front.baseSha,
    workflowRunId: run.id,
    workflowRunAttempt: run.run_attempt,
    classification,
    failureNumber,
    mainSha: classification === 'base-branch' ? recordedMainSha : null,
    retryDisposition:
      classification === 'base-branch'
        ? 'requeue-after-base-moves'
        : classification === 'deterministic-source' || failureNumber >= 2
          ? 'blocked-until-new-source-head'
          : 'one-queue-authority-retry',
    statusWritten: !duplicate,
    currentHeadSha:
      typeof current?.headRefOid === 'string'
        ? current.headRefOid.toLowerCase()
        : null,
    exactHeadStillCurrent: currentMatches(),
    dequeued,
    dequeueOutcome,
    autoMergeDisabled,
  };
}

function gh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
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
const PR_QUERY = `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){id state headRefOid isInMergeQueue mergeQueueEntry{id} autoMergeRequest{enabledAt}}}}`;

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

function instructionContractEvidence(repository, run, jobs, baseSha) {
  const failedJobs = jobs.filter(
    job =>
      Number.isSafeInteger(job?.id) &&
      Array.isArray(job.steps) &&
      job.steps.some(
        step =>
          step?.name === INSTRUCTION_CONTRACT_STEP &&
          step?.conclusion === 'failure'
      )
  );
  if (failedJobs.length === 0) return {};
  const messages = [];
  for (const job of failedJobs) {
    try {
      const notes = ghJson([
        'api',
        `repos/${repository}/check-runs/${job.id}/annotations`,
      ]);
      if (Array.isArray(notes)) {
        for (const note of notes) {
          if (typeof note?.message === 'string') messages.push(note.message);
        }
      }
    } catch {
      // Annotations are optional; the job log is the fallback.
    }
    if (!BUDGET_EXCESS.test(messages.join('\n'))) {
      try {
        messages.push(
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
  }
  const annotationText = messages.join('\n');
  if (!BUDGET_EXCESS.test(annotationText)) return { annotationText };
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
  const evidence = instructionContractEvidence(
    repository,
    run,
    jobs,
    front.baseSha
  );
  const preview = classifyMergeGroupFailure({
    conclusion: run.conclusion,
    failedSteps,
    annotationText: evidence.annotationText,
    changedFiles: evidence.changedFiles,
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
    }
  );
  const serialized = JSON.stringify(result);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `failure_receipt=${serialized}\n`
    );
  }
  process.stdout.write(`${serialized}\n`);
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
