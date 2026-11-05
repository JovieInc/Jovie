#!/usr/bin/env node
/**
 * Manual, guarded dequeue helper. Requires a reason and a queued PR, records the
 * attempt before commenting and dequeuing, and retains the existing hourly caps.
 * History and exclusion are LOCAL to the configured file, not a fleet-wide quota.
 * An unreadable history or an existing exclusion file refuses the operation.
 * Killed attempts require ownership reconciliation; no stale lock is auto-removed.
 * Failed attempts after append remain counted; read the native outcome before retry.
 * --dry-run is a read-only plan, not a reservation. Qualification uses fake gh.
 */
// api-budget: github-user-core 20/hr - estimate: ten manual invocations/hr, at most two REST calls each before shared-client read retries.
// api-budget: github-user-graphql 40/hr - estimate: ten manual invocations/hr, at most four GraphQL calls each; no polling loop.
import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  closeSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CODES = [
  'poison',
  'conflict',
  'hold',
  'stale-head',
  'superseded',
  'other',
];
export const MIN_REASON = 15;
export const PER_PR_PER_HOUR = 2;
export const PER_ACTOR_PER_HOUR = 6;

export function parseArgs(argv) {
  const out = { dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--pr') out.pr = Number(argv[++i]);
    else if (arg === '--reason') out.reason = argv[++i];
    else if (arg === '--code') out.code = argv[++i];
    else throw new Error(`unknown argument ${arg}`);
  }
  return out;
}

/** @returns {string[]} problems; empty when the dequeue may proceed. */
export function validate(args, state, history, nowMs) {
  const problems = [];
  if (!Number.isInteger(args.pr) || args.pr < 1)
    problems.push('--pr must be a PR number');
  if (!args.reason || args.reason.trim().length < MIN_REASON)
    problems.push(`--reason must say why, at least ${MIN_REASON} characters`);
  if (args.code && !CODES.includes(args.code))
    problems.push(`--code must be one of ${CODES.join(', ')}`);
  if (!state?.inQueue)
    problems.push(`#${args.pr} is not in the merge queue; nothing to dequeue`);
  if (typeof state?.actor !== 'string' || !state.actor.trim())
    problems.push('authenticated actor unavailable');
  const hourAgo = nowMs - 3600_000;
  const recent = history.filter(row => Date.parse(row.at) >= hourAgo);
  if (recent.filter(row => row.pr === args.pr).length >= PER_PR_PER_HOUR)
    problems.push(
      `#${args.pr} was already dequeued ${PER_PR_PER_HOUR} times in the last hour; fix the cause instead of reordering`
    );
  if (
    recent.filter(row => row.actor === state?.actor).length >=
    PER_ACTOR_PER_HOUR
  )
    problems.push(
      `${state?.actor} already made ${PER_ACTOR_PER_HOUR} dequeues in the last hour`
    );
  return problems;
}

function defaultGh(args, input) {
  return execFileSync(
    process.execPath,
    [
      fileURLToPath(new URL('../packages/api-client/cli.ts', import.meta.url)),
      'gh',
      '--priority',
      'repair',
      '--',
      ...args,
    ],
    {
      encoding: 'utf8',
      input,
      stdio: ['pipe', 'pipe', 'pipe'],
    }
  );
}

export function readHistory(logPath) {
  let text;
  try {
    text = readFileSync(logPath, 'utf8');
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    )
      return [];
    throw new Error(
      'dequeue history is unreadable; refusing to reset hourly limits',
      { cause: error }
    );
  }
  let rows;
  try {
    rows = text
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
  } catch (error) {
    throw new Error(
      'dequeue history is malformed; refusing to reset hourly limits',
      { cause: error }
    );
  }
  for (const row of rows) {
    if (
      !row ||
      typeof row !== 'object' ||
      Array.isArray(row) ||
      typeof row.at !== 'string' ||
      !Number.isFinite(Date.parse(row.at)) ||
      !Number.isSafeInteger(row.pr) ||
      row.pr < 1 ||
      typeof row.actor !== 'string' ||
      !row.actor.trim()
    )
      throw new Error(
        'dequeue history has an invalid record; refusing to reset hourly limits'
      );
  }
  return rows;
}

export function run(
  argv,
  {
    gh = defaultGh,
    now = Date.now,
    logPath = defaultLog(),
    out = console.log,
  } = {}
) {
  const args = parseArgs(argv);
  const options = { gh, now, logPath, out };
  if (args.dryRun) return executeAttempt(args, options);
  mkdirSync(dirname(logPath), { recursive: true, mode: 0o700 });
  const lockPath = `${logPath}.lock`;
  let fd;
  try {
    fd = openSync(lockPath, 'wx', 0o600);
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'EEXIST'
    )
      throw new Error(
        'dequeue history is locked; reconcile the previous attempt before retrying'
      );
    throw error;
  }
  try {
    writeFileSync(
      fd,
      `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`
    );
    return executeAttempt(args, options);
  } finally {
    try {
      const owned = fstatSync(fd);
      const current = lstatSync(lockPath);
      if (owned.dev !== current.dev || owned.ino !== current.ino)
        throw new Error(
          'dequeue exclusion changed ownership; retained for reconciliation'
        );
      unlinkSync(lockPath);
    } finally {
      closeSync(fd);
    }
  }
}

function executeAttempt(args, { gh, now, logPath, out }) {
  const actor = JSON.parse(gh(['api', 'user'])).login;
  const query =
    'query($n:Int!){repository(owner:"JovieInc",name:"Jovie"){pullRequest(number:$n){id mergeQueueEntry{state position}}}}';
  const pr = JSON.parse(
    gh(['api', 'graphql', '-f', `query=${query}`, '-F', `n=${args.pr}`])
  ).data.repository.pullRequest;
  const state = {
    inQueue: Boolean(pr?.mergeQueueEntry),
    actor,
    entry: pr?.mergeQueueEntry,
  };
  const problems = validate(args, state, readHistory(logPath), now());
  if (problems.length) {
    out(`REFUSED: ${problems.join('; ')}`);
    return 1;
  }
  const record = {
    at: new Date(now()).toISOString(),
    pr: args.pr,
    actor,
    code: args.code ?? 'other',
    reason: args.reason.trim(),
    position: state.entry.position,
    queueState: state.entry.state,
  };
  if (args.dryRun) {
    out(`DRY RUN: would dequeue #${args.pr}: ${JSON.stringify(record)}`);
    return 0;
  }
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(logPath, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  gh([
    'pr',
    'comment',
    String(args.pr),
    '--repo',
    'JovieInc/Jovie',
    '--body',
    `Dequeued from the merge queue by ${actor} (${record.code}): ${record.reason}`,
  ]);
  gh([
    'api',
    'graphql',
    '-f',
    `query=mutation($id:ID!){dequeuePullRequest(input:{id:$id}){clientMutationId}}`,
    '-f',
    `id=${pr.id}`,
  ]);
  out(`Dequeued #${args.pr}. Logged to ${logPath}.`);
  return 0;
}

function defaultLog() {
  return (
    process.env.JOVIE_QUEUE_LOG ||
    join(homedir(), '.local', 'state', 'jovie-queue', 'dequeues.jsonl')
  );
}

if (import.meta.main) {
  try {
    process.exitCode = run(process.argv.slice(2));
  } catch (error) {
    console.error(`queue-dequeue: ${error.message}`);
    process.exitCode =
      error &&
      typeof error === 'object' &&
      'status' in error &&
      error.status === 75
        ? 75
        : 2;
  }
}
