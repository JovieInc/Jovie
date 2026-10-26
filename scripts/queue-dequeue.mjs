#!/usr/bin/env node
/**
 * Guarded merge-queue dequeue. Every dequeue rebuilds the groups behind it (2026-10-25/26: 46
 * "manual" removals in 24h, half by the shared agent account, 14 re-enqueued within 5 minutes
 * as reorder-by-dequeue). This tool is the only sanctioned way for an agent to dequeue:
 *
 *   node scripts/queue-dequeue.mjs --pr 123 --reason "why, at least 15 characters" [--code poison]
 *
 * It requires a reason, refuses PRs that are not in the queue, refuses a third dequeue of the
 * same PR within an hour and more than 6 dequeues an hour from one actor, comments the reason on
 * the PR, appends a JSONL record, then dequeues. --dry-run prints the plan only.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

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
  return execFileSync('gh', args, {
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

export function readHistory(logPath) {
  try {
    return readFileSync(logPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
  } catch {
    return [];
  }
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
  appendFileSync(logPath, `${JSON.stringify(record)}\n`);
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

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exitCode = run(process.argv.slice(2));
  } catch (error) {
    console.error(`queue-dequeue: ${error.message}`);
    process.exitCode = 2;
  }
}
