#!/usr/bin/env node
// Re-request squash auto-merge after a merge-group failure dequeues a PR
// whose own head is still green, when the failure belongs to another PR in
// the group or to the base branch. Bounded to REARM_CAP successful rearms
// per head SHA. A repeated decision for the same CI run does not increment.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export const REARM_CONTEXT = 'jovie-queue-victim-rearm/v1';
export const REARM_CAP = 2;
const SHA = /^[0-9a-f]{40}$/;
const REARM_DESCRIPTION =
  /^n=([1-9][0-9]*);sha=([0-9a-f]{40});run=([1-9][0-9]*)$/;
const BUDGET_FILE = /([A-Za-z0-9_./-]+\.md): \d+ bytes exceeds \d+/;
const BLOCKING = new Set([
  'hold',
  'gated',
  'incident',
  'do-not-merge',
  'queue-poison',
]);

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
    if (candidate.state !== 'OPEN' || candidate.isDraft) return skip('closed');
    if (candidate.baseRefName !== 'main' || candidate.isCrossRepository) {
      return skip('base');
    }
    if (candidate.labelsTruncated) return skip('labels');
    if ((candidate.labels ?? []).some(label => BLOCKING.has(label))) {
      return skip('blocking-label');
    }
    if (candidate.inQueue || candidate.autoMerge) return skip('already-armed');
    if (candidate.mergeStateStatus !== 'CLEAN') return skip('head-not-green');
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

export function rearmDescription({ n, headSha, runId }) {
  const description = `n=${n};sha=${headSha};run=${runId}`;
  if (description.length > 140)
    fail('rearm description exceeds 140 characters');
  return description;
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
      current.mergeStateStatus !== 'CLEAN'
    ) {
      continue;
    }
    if (decision.increment) {
      await io.writeStatus({
        sha: decision.headSha,
        description: rearmDescription(decision),
        targetUrl: io.targetUrl,
      });
    }
    await io.enable(decision.prNumber);
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
    'query=query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){headRefOid mergeStateStatus isInMergeQueue autoMergeRequest{enabledAt}}}}',
    '-F',
    `owner=${owner}`,
    '-F',
    `name=${name}`,
    '-F',
    `number=${prNumber}`,
  ]).data.repository.pullRequest;
  return {
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
    enable(prNumber) {
      gh([
        'pr',
        'merge',
        String(prNumber),
        '--repo',
        repository,
        '--auto',
        '--squash',
      ]);
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
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}

if (
  process.argv[1] &&
  process.argv[1].endsWith('merge-group-victim-rearm.mjs')
) {
  main();
}
