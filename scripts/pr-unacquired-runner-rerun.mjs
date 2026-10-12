#!/usr/bin/env node
// Re-run a pull_request workflow run whose jobs GitHub never handed to a
// hosted runner ("The job was not acquired by Runner of type hosted even after
// multiple attempts"). GitHub cancels such a job after ~15 minutes. When the
// job is a required context (PR Ready, PR Size Guard, ...) or feeds one, the
// PR stays BLOCKED on a CANCELLED/FAILED check at an unchanged head until
// someone pushes. On 2026-10-05 this pinned #20767 (only PR Ready cancelled,
// every real gate green) and #20786 for six days, and the lanes classified the
// aggregate failure as a model fix that had nothing to change.
//
// The run is re-requested (failed and cancelled jobs plus dependents) only
// when an exact cancelled job carries the hosted-acquisition annotation, the
// run still belongs to an open PR's current head, and the run has not already
// been re-attempted RERUN_ATTEMPT_CAP times. The caller skips the lane repair
// label when a rerun was requested; the rerun's own completion relays again.

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

export const RERUN_ATTEMPT_CAP = 2;
export const UNACQUIRED_MESSAGE =
  /job was not acquired by Runner of type hosted/i;
const SHA = /^[0-9a-f]{40}$/;
const RERUNNABLE_CONCLUSIONS = new Set(['failure']);
const MAX_ANNOTATION_READS = 5;

/** A cancelled job that never reached a runner and ran no step. */
export function neverStarted(job) {
  return (
    job?.conclusion === 'cancelled' &&
    !job.runner_id &&
    !job.runner_name &&
    (job.steps ?? []).length === 0
  );
}

/**
 * Pure decision over already-fetched evidence.
 * @param {{ run: any, pulls: any[], unacquiredJobIds: number[] }} input
 */
export function planUnacquiredRerun({ run, pulls, unacquiredJobIds }) {
  const skip = reason => ({ rerun: false, reason });
  if (run?.event !== 'pull_request') return skip('not a pull_request run');
  if (!RERUNNABLE_CONCLUSIONS.has(run.conclusion))
    return skip(`run conclusion ${run.conclusion ?? 'unknown'}`);
  if (!SHA.test(String(run.head_sha ?? ''))) return skip('run head unknown');
  const attempt = Number(run.run_attempt);
  if (!Number.isSafeInteger(attempt) || attempt < 1)
    return skip('run attempt unknown');
  if (attempt > RERUN_ATTEMPT_CAP)
    return skip(`attempt ${attempt} exceeds rerun cap ${RERUN_ATTEMPT_CAP}`);
  const pr = (pulls ?? []).find(
    pull => pull?.state === 'open' && pull?.head?.sha === run.head_sha
  );
  if (!pr) return skip('no open PR at this exact head');
  if (!unacquiredJobIds?.length) return skip('no hosted-acquisition failure');
  return {
    rerun: true,
    reason: `PR #${pr.number}: ${unacquiredJobIds.length} job(s) never acquired a hosted runner`,
    pr: pr.number,
    jobs: [...unacquiredJobIds],
  };
}

/**
 * Fetch only what the decision needs. The run comes from the workflow_run
 * payload; the common case (no never-started job) costs one jobs read, and
 * annotations and PRs are read only for a real acquisition candidate.
 * @param {(path: string) => any} api
 */
export function collectEvidence(api, repository, run) {
  const attempt = Number(run?.run_attempt);
  const runLevel = planUnacquiredRerun({
    run,
    pulls: [{ state: 'open', head: { sha: run?.head_sha } }],
    unacquiredJobIds: [0],
  });
  if (!runLevel.rerun) return { run, pulls: [], unacquiredJobIds: [] };
  const jobs =
    api(
      `repos/${repository}/actions/runs/${run.id}/attempts/${attempt}/jobs?per_page=100`
    )?.jobs ?? [];
  const unacquiredJobIds = [];
  for (const job of jobs.filter(neverStarted).slice(0, MAX_ANNOTATION_READS)) {
    const annotations = api(
      `repos/${repository}/check-runs/${job.id}/annotations?per_page=50`
    );
    if (
      (annotations ?? []).some(note =>
        UNACQUIRED_MESSAGE.test(String(note?.message ?? ''))
      )
    )
      unacquiredJobIds.push(job.id);
  }
  const pulls =
    unacquiredJobIds.length && SHA.test(String(run?.head_sha ?? ''))
      ? api(`repos/${repository}/commits/${run.head_sha}/pulls?per_page=20`)
      : [];
  return { run, pulls, unacquiredJobIds };
}

function ghApi(path) {
  return JSON.parse(
    execFileSync('gh', ['api', '-H', 'Cache-Control: no-cache', path], {
      encoding: 'utf8',
    })
  );
}

export function main(env = process.env, api = ghApi, rerun = undefined) {
  const repository = env.GH_REPOSITORY;
  if (!/^[\w.-]+\/[\w.-]+$/.test(String(repository ?? '')))
    throw new Error('GH_REPOSITORY must be owner/name');
  const run = JSON.parse(
    readFileSync(String(env.GITHUB_EVENT_PATH), 'utf8')
  )?.workflow_run;
  const runId = String(run?.id ?? '');
  if (!/^[1-9][0-9]*$/.test(runId))
    throw new Error('event must carry a workflow_run with a positive id');
  const plan = planUnacquiredRerun(collectEvidence(api, repository, run));
  const doRerun =
    rerun ??
    (id =>
      execFileSync(
        'gh',
        ['run', 'rerun', id, '--failed', '--repo', repository],
        {
          stdio: 'inherit',
        }
      ));
  if (plan.rerun) doRerun(runId);
  console.log(
    `${plan.rerun ? 'Re-requested' : 'No rerun for'} run ${runId}: ${plan.reason}`
  );
  if (env.GITHUB_OUTPUT)
    appendFileSync(env.GITHUB_OUTPUT, `requested=${plan.rerun}\n`);
  return plan;
}

if (process.argv[1]?.endsWith('pr-unacquired-runner-rerun.mjs')) main();
