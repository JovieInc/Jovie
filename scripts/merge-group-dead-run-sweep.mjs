#!/usr/bin/env node
// Cancel merge_group runs whose queue group no longer exists, across EVERY
// workflow that runs on merge_group (CI, Private Data Guard, PR Targets Main,
// PR Size Guard, Company Guards, PR Fleet Rules, Fork PR Gate, ...).
//
// GitHub deletes a group's gh-readonly-queue/main/pr-<n>-<sha> ref when the
// group is dequeued or rebuilt, but every run it started stays queued or keeps
// its runner. On 2026-11-11 (~21:10Z) 64 of the queued/in-progress merge_group
// runs belonged to deleted refs while live groups sat queued past the
// ruleset's 30-minute check timeout, were dequeued as UNMERGEABLE, re-formed
// and spawned more runs. ci-merge-group-supersede (ci.yml) only cancels older
// CI runs of the same PR from inside the next group's CI, so it never touched
// the other workflows or a PR that was dequeued outright.
//
// Rules (pure, see planDeadRunCancels):
// - a ref git still lists is a live group: never cancel its run;
// - a run whose head SHA is on main landed: never cancel it (Main Queue
//   Provenance proves the main push from that CI run's completed success);
// - anything that is not an unfinished merge_group run on a main queue ref is
//   left alone.
// Reads happen in that order (runs, then refs, then main) so a group that is
// created or lands mid-sweep is always seen as live or landed.
//
// Every read uses the Jovie Bot installation token (READ_TOKEN, its own
// bucket); only the cancel requests spend the repo GITHUB_TOKEN (CANCEL_TOKEN,
// actions: write), capped at MAX_CANCELS per run. Any failed read logs a
// warning and cancels nothing; the sweep gates nothing and always exits 0.
// api-budget: github-app-core 120/hr - estimate: 30 sweeps/hr in a dequeue storm (one concurrency slot coalesces the rest) x 4 reads (three run listings and recent main)
// api-budget: github-actions-token 100/hr - one cancel per dead merge-group run; dead runs are bounded by the groups that die, capped at MAX_CANCELS per sweep

import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const QUEUE_BRANCH =
  /^gh-readonly-queue\/main\/pr-[1-9][0-9]*-[0-9a-f]{40}$/;
// Statuses of a run that has not finished: queued and pending runs wait for a
// runner (or a concurrency slot); in_progress runs hold one.
export const UNFINISHED_STATUSES = ['queued', 'pending', 'in_progress'];
export const MAX_PAGES = 5;
export const MAX_CANCELS = 100;
const SHA = /^[0-9a-f]{40}$/;

/**
 * Pure decision over already-fetched evidence.
 * @param {{
 *   runs: Array<{ id?: unknown, event?: string, status?: string, head_branch?: string | null, head_sha?: string, name?: string }>,
 *   liveRefs: Iterable<string>,
 *   mainShas: Iterable<string>,
 *   maxCancels?: number,
 * }} input
 * @returns {{ cancel: Array<{ id: number, branch: string, workflow: string }>, live: number, landed: number }}
 */
export function planDeadRunCancels({
  runs,
  liveRefs,
  mainShas,
  maxCancels = MAX_CANCELS,
}) {
  const live = new Set(liveRefs);
  const landed = new Set(mainShas);
  const seen = new Set();
  const cancel = [];
  let keptLive = 0;
  let keptLanded = 0;
  for (const run of runs ?? []) {
    const id = Number(run?.id);
    if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    if (run.event !== 'merge_group') continue;
    if (!UNFINISHED_STATUSES.includes(String(run.status))) continue;
    const branch = String(run.head_branch ?? '');
    if (!QUEUE_BRANCH.test(branch)) continue;
    if (live.has(`refs/heads/${branch}`)) {
      keptLive += 1;
      continue;
    }
    if (landed.has(String(run.head_sha ?? ''))) {
      keptLanded += 1;
      continue;
    }
    if (cancel.length < maxCancels)
      cancel.push({ id, branch, workflow: String(run.name ?? 'unknown') });
  }
  return { cancel, live: keptLive, landed: keptLanded };
}

/** `git ls-remote` output -> ref names. */
export function parseLsRemote(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map(line => line.split('\t'))
    .filter(([sha, ref]) => SHA.test(sha ?? '') && ref)
    .map(([, ref]) => ref.trim());
}

// GitHub REST goes through the shared budgeted client per
// .claude/rules/external-apis.md; exit 75 (quota deferred) is a failed read.
const API_CLIENT_CLI = 'packages/api-client/cli.ts';

function run(command, args, env) {
  const outcome = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, ...env },
  });
  return { ok: outcome.status === 0, stdout: String(outcome.stdout ?? '') };
}

/** Default I/O: the api-client gh wrapper for REST, git ls-remote for refs. */
export function makeIo(env = process.env) {
  const gh = (token, args) =>
    run(
      process.execPath,
      [API_CLIENT_CLI, 'gh', '--priority', 'repair', '--', 'api', ...args],
      { GH_TOKEN: token, GH_PROMPT_DISABLED: '1' }
    );
  return {
    read(path) {
      const r = gh(env.READ_TOKEN, [path]);
      try {
        return r.ok ? JSON.parse(r.stdout) : null;
      } catch {
        return null;
      }
    },
    liveRefs() {
      const server = env.GIT_SERVER || 'https://github.com';
      const basic = Buffer.from(`x-access-token:${env.READ_TOKEN}`).toString(
        'base64'
      );
      // The token reaches git only as config env, never in argv.
      const r = run(
        'git',
        [
          'ls-remote',
          `${server}/${env.REPOSITORY}`,
          'refs/heads/gh-readonly-queue/main/*',
        ],
        {
          GIT_CONFIG_COUNT: '1',
          GIT_CONFIG_KEY_0: `http.${server}/.extraheader`,
          GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}`,
          GIT_TERMINAL_PROMPT: '0',
        }
      );
      return r.ok ? parseLsRemote(r.stdout) : null;
    },
    cancel(id) {
      return gh(env.CANCEL_TOKEN, [
        '-X',
        'POST',
        `repos/${env.REPOSITORY}/actions/runs/${id}/cancel`,
      ]).ok;
    },
  };
}

const say = (level, message) =>
  process.stdout.write(`::${level}::${String(message).replace(/\n/g, ' ')}\n`);

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {ReturnType<typeof makeIo>} [io]
 * @param {(level: string, message: string) => unknown} [log]
 */
export function main(env = process.env, io = makeIo(env), log = say) {
  const repo = env.REPOSITORY;
  if (!env.READ_TOKEN || !repo) {
    log('warning', 'No Jovie Bot read token or repository; sweep skipped.');
    return { cancelled: [] };
  }
  const runs = [];
  for (const status of UNFINISHED_STATUSES) {
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const body = io.read(
        `repos/${repo}/actions/runs?event=merge_group&status=${status}&per_page=100&page=${page}`
      );
      if (!Array.isArray(body?.workflow_runs)) {
        log(
          'warning',
          `Could not list ${status} merge_group runs; sweep skipped.`
        );
        return { cancelled: [] };
      }
      runs.push(...body.workflow_runs);
      if (body.workflow_runs.length < 100) break;
    }
  }
  const liveRefs = io.liveRefs();
  if (!liveRefs) {
    log('warning', 'Could not list live queue refs; sweep skipped.');
    return { cancelled: [] };
  }
  const commits = io.read(`repos/${repo}/commits?sha=main&per_page=100`);
  if (!Array.isArray(commits)) {
    log('warning', 'Could not read recent main commits; sweep skipped.');
    return { cancelled: [] };
  }
  const plan = planDeadRunCancels({
    runs,
    liveRefs,
    mainShas: commits.map(commit => commit?.sha),
  });
  log(
    'notice',
    `${runs.length} unfinished merge_group runs: ${plan.cancel.length} dead, ${plan.live} on live groups, ${plan.landed} landed.`
  );
  const cancelled = [];
  for (const { id, branch, workflow } of plan.cancel) {
    if (io.cancel(id)) {
      cancelled.push(id);
      log('notice', `Cancelled ${workflow} run ${id}: ${branch} is gone.`);
    } else log('warning', `Cancel request for run ${id} failed.`);
  }
  return { cancelled };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
