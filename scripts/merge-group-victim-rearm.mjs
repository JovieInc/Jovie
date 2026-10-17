#!/usr/bin/env node
// Re-enqueue a PR after a merge-group failure dequeues it while its own head
// is still green, when the failure belongs to another PR in the group or to
// the base branch. The mutation is enqueuePullRequest on the verified head,
// the same call the enroll job uses. The merge queue owns the merge method,
// so this path does not arm auto-merge or choose a strategy. Bounded to REARM_CAP
// successful rearms per head SHA. A repeated decision for the same CI run
// does not increment. A head the failure hold already blocked (its second
// failure on the same revision) is never rearmed: it waits for a new head
// (JOV-7708).

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { ADMISSION_BLOCKING_LABELS } from './lib/admission-hold-labels.mjs';

export const REARM_CONTEXT = 'jovie-queue-victim-rearm/v1';
export const REARM_CAP = 2;
const SHA = /^[0-9a-f]{40}$/;
const REARM_DESCRIPTION =
  /^n=([1-9][0-9]*);sha=([0-9a-f]{40});run=([1-9][0-9]*)$/;
const BUDGET_FILE = /([A-Za-z0-9_./-]+\.md): \d+ bytes exceeds \d+/;
// GitHub reports BLOCKED while any required check is pending or red, so
// UNSTABLE means every required check is green and only a non-required context
// (for example a lane's jovie-execution/* receipt) is pending or red. The enroll
// controller admits the same states; requiring CLEAN stranded victims whose
// head carried a pending lane receipt.
export const REARM_MERGE_STATES = new Set(['CLEAN', 'HAS_HOOKS', 'UNSTABLE']);
// Rearming a held PR enqueues it, and a held member fails every group.
const BLOCKING = new Set(ADMISSION_BLOCKING_LABELS);

function fail(message) {
  throw new Error(`merge-group-victim-rearm: ${message}`);
}

export function implicatedPathsFromAnnotations(annotations) {
  const paths = new Set();
  for (const annotation of annotations ?? []) {
    const path = String(annotation?.path ?? '').replace(/^\.\//, '');
    if (path && !path.startsWith('.github/')) paths.add(path);
    const budget = BUDGET_FILE.exec(String(annotation?.message ?? ''));
    if (budget) paths.add(budget[1]);
  }
  return [...paths];
}

export function trustedRearmRecords(statuses) {
  const records = [];
  for (const status of statuses ?? []) {
    if (status?.context !== REARM_CONTEXT) continue;
    if (String(status.state ?? '').toLowerCase() !== 'success') continue;
    const login = status.creator?.login;
    const type = status.creator?.type ?? status.creator?.__typename;
    if (type !== 'Bot' || !['jovie-bot', 'jovie-bot[bot]'].includes(login)) {
      continue;
    }
    const match = REARM_DESCRIPTION.exec(String(status.description ?? ''));
    if (!match) continue;
    records.push({
      n: Number(match[1]),
      sha: match[2],
      runId: Number(match[3]),
    });
  }
  return records;
}

function classify(candidate, candidates, paths) {
  if (paths.length === 0) return { reason: 'unclassified' };
  const owns = path => (candidate.files ?? []).includes(path);
  if (paths.some(owns)) return { reason: 'own-failure' };
  const otherOwns = path =>
    candidates.some(
      other =>
        other.prNumber !== candidate.prNumber &&
        (other.files ?? []).includes(path)
    );
  if (paths.some(otherOwns)) return { classification: 'another-pr' };
  if (candidates.some(item => item.filesTruncated)) {
    return { reason: 'evidence-truncated' };
  }
  return { classification: 'base-branch' };
}

/**
 * @returns {Array<{ action: 'rearm' | 'skip', prNumber: number, headSha?: string, classification?: string, n?: number, increment?: boolean, reason?: string, runId?: number }>}
 */
export function planVictimRearms({
  runId,
  implicatedPaths,
  candidates,
  cap = REARM_CAP,
  heldRevision = null,
}) {
  if (!Number.isSafeInteger(runId) || runId < 1) fail('run id is missing');
  if (!Number.isSafeInteger(cap) || cap < 1) fail('cap is missing');
  const paths = [
    ...new Set(
      (implicatedPaths ?? []).filter(path => typeof path === 'string' && path)
    ),
  ];
  return (candidates ?? []).map(candidate => {
    const skip = reason => ({
      action: 'skip',
      prNumber: candidate.prNumber,
      reason,
    });
    if (!SHA.test(candidate.headSha ?? '')) return skip('head-sha');
    if (
      heldRevision?.prNumber === candidate.prNumber &&
      heldRevision.headSha === candidate.headSha
    ) {
      return skip('revision-held');
    }
    if (candidate.state !== 'OPEN' || candidate.isDraft) return skip('closed');
    if (candidate.baseRefName !== 'main' || candidate.isCrossRepository) {
      return skip('base');
    }
    if (candidate.labelsTruncated) return skip('labels');
    if ((candidate.labels ?? []).some(label => BLOCKING.has(label))) {
      return skip('blocking-label');
    }
    if (candidate.inQueue || candidate.autoMerge) return skip('already-armed');
    if (!REARM_MERGE_STATES.has(candidate.mergeStateStatus)) {
      return skip('head-not-green');
    }
    if (candidate.filesTruncated || candidate.statusesTruncated) {
      return skip('evidence-truncated');
    }
    const verdict = classify(candidate, candidates, paths);
    if (!verdict.classification) return skip(verdict.reason);
    const records = trustedRearmRecords(candidate.statuses).filter(
      record => record.sha === candidate.headSha
    );
    const seen = records.find(record => record.runId === runId);
    if (seen) {
      return {
        action: 'rearm',
        prNumber: candidate.prNumber,
        headSha: candidate.headSha,
        classification: verdict.classification,
        n: seen.n,
        increment: false,
        runId,
      };
    }
    const n = Math.max(0, ...records.map(record => record.n)) + 1;
    if (n > cap) return skip('cap');
    return {
      action: 'rearm',
      prNumber: candidate.prNumber,
      headSha: candidate.headSha,
      classification: verdict.classification,
      n,
      increment: true,
      runId,
    };
  });
}

/**
 * The failure-hold job's receipt names the exact revision it blocked until a
 * new head. Anything else (absent, unparsable, or retryable) blocks nothing.
 * @returns {{ prNumber: number, headSha: string } | null}
 */
export function heldRevisionFromReceipt(raw, repository) {
  if (!raw) return null;
  let receipt;
  try {
    receipt = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    receipt?.schema !== 'jovie-merge-group-failure-hold/v1' ||
    receipt.repository !== repository ||
    receipt.retryDisposition !== 'blocked-until-new-source-head' ||
    !Number.isSafeInteger(receipt.prNumber) ||
    !SHA.test(String(receipt.sourceHeadSha ?? ''))
  ) {
    return null;
  }
  return { prNumber: receipt.prNumber, headSha: receipt.sourceHeadSha };
}

export function rearmDescription({ n, headSha, runId }) {
  const description = `n=${n};sha=${headSha};run=${runId}`;
  if (description.length > 140)
    fail('rearm description exceeds 140 characters');
  return description;
}

// Kept in lockstep with the enroll job's Enqueue green PRs mutation.
// No mergeMethod: the ruleset sets the strategy for main.
export const ENQUEUE_PULL_REQUEST_MUTATION =
  'mutation($id:ID!,$oid:GitObjectID!){enqueuePullRequest(input:{pullRequestId:$id,expectedHeadOid:$oid}){mergeQueueEntry{position}}}';

const NODE_ID = /^[A-Za-z0-9+/=_-]{3,256}$/;

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

export function isIntegrationPermissionDenied(error) {
  return /resource not accessible by integration/i.test(errorText(error));
}

function assertPullNumber(prNumber) {
  if (!Number.isSafeInteger(prNumber) || prNumber < 1) {
    fail('pr number is missing');
  }
  return prNumber;
}

export class RearmPermissionError extends Error {
  /**
   * @param {number} prNumber
   * @param {unknown} [cause]
   */
  constructor(prNumber, cause) {
    const number = assertPullNumber(prNumber);
    const detail = `Rearm of #${number} denied: Resource not accessible by integration (enqueuePullRequest)`;
    super(`::error::${detail}`, cause === undefined ? undefined : { cause });
    this.name = 'RearmPermissionError';
    /** @type {'ENQUEUE_PERMISSION_DENIED'} */
    this.code = 'ENQUEUE_PERMISSION_DENIED';
    /** @type {number} */
    this.prNumber = number;
    /** @type {string} */
    this.annotation = `::error::${detail}`;
    /** @type {string} */
    this.summary = detail;
  }
}

/** @param {number} prNumber @param {unknown} [cause] */
export function permissionDeniedRearm(prNumber, cause) {
  return new RearmPermissionError(prNumber, cause);
}

export function enqueuePullRequestArgs({ nodeId, headOid }) {
  if (!NODE_ID.test(String(nodeId ?? ''))) fail('pull request id is missing');
  const oid = String(headOid ?? '').toLowerCase();
  if (!SHA.test(oid)) fail('expected head oid is missing');
  return [
    'api',
    'graphql',
    '-f',
    `query=${ENQUEUE_PULL_REQUEST_MUTATION}`,
    '-f',
    `id=${nodeId}`,
    '-f',
    `oid=${oid}`,
  ];
}

function asGraphqlBody(raw) {
  if (raw && typeof raw === 'object') return raw;
  return JSON.parse(String(raw ?? ''));
}

/**
 * Enqueue one verified head. A token that cannot call enqueuePullRequest
 * throws ENQUEUE_PERMISSION_DENIED instead of returning success.
 */
export function enqueueVictim({ prNumber, nodeId, headOid, exec }) {
  const number = assertPullNumber(prNumber);
  const args = enqueuePullRequestArgs({ nodeId, headOid });
  let raw;
  try {
    raw = exec(args);
  } catch (error) {
    if (isIntegrationPermissionDenied(error)) {
      throw permissionDeniedRearm(number, error);
    }
    throw error;
  }
  const body = asGraphqlBody(raw);
  if (isIntegrationPermissionDenied(JSON.stringify(body?.errors ?? ''))) {
    throw permissionDeniedRearm(number);
  }
  const position = body?.data?.enqueuePullRequest?.mergeQueueEntry?.position;
  if (!Number.isInteger(position)) {
    fail(`enqueue of #${number} returned no queue position`);
  }
  return { position };
}

/** @returns {1} the step always fails; permission denials are annotated */
export function surfaceRearmFailure(error, { writeError, writeSummary }) {
  if (error instanceof RearmPermissionError) {
    writeError(error.annotation);
    writeSummary(error.summary);
    return 1;
  }
  writeError(error instanceof Error ? error.message : String(error));
  return 1;
}

/**
 * @param {unknown} error
 * @param {{
 *   env?: { GITHUB_STEP_SUMMARY?: string },
 *   stderr?: { write(line: string): void },
 *   appendFile?: (path: string, data: string) => void,
 * }} [io]
 */
export function commitRearmFailure(
  error,
  {
    env = process.env,
    stderr = process.stderr,
    appendFile = appendFileSync,
  } = {}
) {
  return surfaceRearmFailure(error, {
    writeError(line) {
      stderr.write(line.endsWith('\n') ? line : `${line}\n`);
    },
    writeSummary(line) {
      const summaryPath = env.GITHUB_STEP_SUMMARY;
      if (!summaryPath) return;
      appendFile(summaryPath, line.endsWith('\n') ? line : `${line}\n`);
    },
  });
}

export async function applyVictimRearms(decisions, io) {
  const applied = [];
  for (const decision of decisions) {
    if (decision.action !== 'rearm') continue;
    const current = await io.readPullRequest(decision.prNumber);
    if (
      current?.headSha !== decision.headSha ||
      current.inQueue ||
      current.autoMerge ||
      !REARM_MERGE_STATES.has(current.mergeStateStatus)
    ) {
      continue;
    }
    // The cap counts successful enqueues only. A denied or failed mutation
    // leaves no receipt, so a later run can try this head again.
    await io.enable(decision.prNumber, current);
    if (decision.increment) {
      await io.writeStatus({
        sha: decision.headSha,
        description: rearmDescription(decision),
        targetUrl: io.targetUrl,
      });
    }
    applied.push(decision);
  }
  return applied;
}

function gh(args, env = process.env) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  });
}

function ghJson(args) {
  return JSON.parse(gh(args));
}

function restPages(path, cap = 5, key = '') {
  const rows = [];
  for (let page = 1; page <= cap; page += 1) {
    const body = ghJson([
      'api',
      `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`,
    ]);
    const list = Array.isArray(body) ? body : key ? (body?.[key] ?? []) : [];
    rows.push(...list);
    if (list.length < 100) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

function loadCandidates(repository, headSha, frontPr) {
  const numbers = new Set([frontPr]);
  try {
    const associated = ghJson([
      'api',
      '--paginate',
      `repos/${repository}/commits/${headSha}/pulls`,
    ]);
    for (const pr of associated) {
      if (Number.isSafeInteger(pr?.number) && pr.number > 0)
        numbers.add(pr.number);
    }
  } catch {
    // The front PR from the queue ref is enough when the commit has no pulls.
  }
  const [owner, name] = repository.split('/');
  return [...numbers].map(prNumber => {
    const data = ghJson([
      'api',
      'graphql',
      '-f',
      `query=query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){number state isDraft baseRefName headRefOid mergeStateStatus isInMergeQueue isCrossRepository autoMergeRequest{enabledAt} labels(first:100){pageInfo{hasNextPage} nodes{name}}}}}`,
      '-F',
      `owner=${owner}`,
      '-F',
      `name=${name}`,
      '-F',
      `number=${prNumber}`,
    ]).data.repository.pullRequest;
    const files = restPages(`repos/${repository}/pulls/${prNumber}/files`);
    const statuses = data?.headRefOid
      ? restPages(`repos/${repository}/commits/${data.headRefOid}/statuses`)
      : { rows: [], truncated: false };
    return {
      prNumber,
      state: data?.state,
      isDraft: data?.isDraft === true,
      baseRefName: data?.baseRefName,
      headSha: String(data?.headRefOid ?? '').toLowerCase(),
      mergeStateStatus: data?.mergeStateStatus,
      inQueue: data?.isInMergeQueue === true,
      isCrossRepository: data?.isCrossRepository === true,
      autoMerge: Boolean(data?.autoMergeRequest),
      labelsTruncated: data?.labels?.pageInfo?.hasNextPage === true,
      labels: (data?.labels?.nodes ?? []).map(label =>
        String(label.name ?? '').toLowerCase()
      ),
      files: files.rows.map(file => file.filename).filter(Boolean),
      filesTruncated: files.truncated,
      statuses: statuses.rows,
      statusesTruncated: statuses.truncated,
    };
  });
}

function loadAnnotations(repository, runId) {
  const jobs = restPages(
    `repos/${repository}/actions/runs/${runId}/jobs`,
    10,
    'jobs'
  );
  if (jobs.truncated) return [];
  const annotations = [];
  for (const job of jobs.rows) {
    if (job.conclusion !== 'failure') continue;
    const checkRunId = String(job.check_run_url ?? '').match(/(\d+)$/)?.[1];
    if (!checkRunId) continue;
    const page = restPages(
      `repos/${repository}/check-runs/${checkRunId}/annotations`,
      3
    );
    if (page.truncated) return [];
    annotations.push(...page.rows);
  }
  return implicatedPathsFromAnnotations(annotations);
}

function readArmState(repository, prNumber) {
  const [owner, name] = repository.split('/');
  const data = ghJson([
    'api',
    'graphql',
    '-f',
    'query=query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){id headRefOid mergeStateStatus isInMergeQueue autoMergeRequest{enabledAt}}}}',
    '-F',
    `owner=${owner}`,
    '-F',
    `name=${name}`,
    '-F',
    `number=${prNumber}`,
  ]).data.repository.pullRequest;
  return {
    nodeId: typeof data?.id === 'string' ? data.id : '',
    headSha: String(data?.headRefOid ?? '').toLowerCase(),
    mergeStateStatus: data?.mergeStateStatus,
    inQueue: data?.isInMergeQueue === true,
    autoMerge: Boolean(data?.autoMergeRequest),
  };
}

function main() {
  const eventFlag = process.argv.indexOf('--event-path');
  const eventPath = eventFlag === -1 ? '' : process.argv[eventFlag + 1];
  if (!eventPath)
    fail('usage: merge-group-victim-rearm.mjs --event-path <file>');
  const event = JSON.parse(readFileSync(eventPath, 'utf8'));
  const run = event.workflow_run;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository || run?.head_repository?.full_name !== repository) {
    console.log('skip: run is not this repository');
    return;
  }
  if (run.event !== 'merge_group' || run.conclusion !== 'failure') {
    console.log('skip: not a failed merge group');
    return;
  }
  const front =
    /^gh-readonly-queue\/main\/pr-([1-9][0-9]*)-([0-9a-f]{40})$/.exec(
      String(run.head_branch ?? '')
    );
  if (!front || !SHA.test(String(run.head_sha ?? '').toLowerCase())) {
    fail('run is not an exact main merge-queue ref');
  }
  const implicatedPaths = loadAnnotations(repository, run.id);
  const candidates = loadCandidates(
    repository,
    String(run.head_sha).toLowerCase(),
    Number(front[1])
  );
  const decisions = planVictimRearms({
    runId: run.id,
    implicatedPaths,
    candidates,
    heldRevision: heldRevisionFromReceipt(
      process.env.FAILURE_HOLD_RECEIPT,
      repository
    ),
  });
  const targetUrl = `https://github.com/${repository}/actions/runs/${run.id}`;
  applyVictimRearms(decisions, {
    targetUrl,
    readPullRequest(prNumber) {
      return readArmState(repository, prNumber);
    },
    writeStatus({ sha, description, targetUrl: url }) {
      gh([
        'api',
        `repos/${repository}/statuses/${sha}`,
        '-f',
        'state=success',
        '-f',
        `context=${REARM_CONTEXT}`,
        '-f',
        `description=${description}`,
        '-f',
        `target_url=${url}`,
      ]);
    },
    enable(prNumber, current) {
      const result = enqueueVictim({
        prNumber,
        nodeId: current?.nodeId,
        headOid: current?.headSha,
        exec: args => gh(args),
      });
      console.log(`enqueued #${prNumber} at position ${result.position}`);
    },
  })
    .then(applied => {
      for (const decision of decisions) {
        console.log(
          decision.action === 'rearm'
            ? `rearm #${decision.prNumber} class=${decision.classification} n=${decision.n} increment=${decision.increment}`
            : `skip #${decision.prNumber} ${decision.reason}`
        );
      }
      console.log(`applied=${applied.length}`);
    })
    .catch(error => {
      process.exitCode = commitRearmFailure(error);
    });
}

if (
  process.argv[1] &&
  process.argv[1].endsWith('merge-group-victim-rearm.mjs')
) {
  main();
}
