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
//
// This hop is an optimization, never the signal carrier: the relay job in the
// same workflow run still labels the PR for the lanes. So an API failure here
// is downgraded to a ::warning:: plus requested=false under the shared-bucket
// doctrine of scripts/lib/github-rate-limit.mjs (a quota failure is retried or
// deferred, never a final red verdict). Before that doctrine, any non-zero gh
// exit crashed this job through execFileSync and reddened the whole Lane Fix
// Relay run on main while Queue lane repair had succeeded (JOV-7922, runs
// 41102970392 and 41121866631, both 2026-10-30).
// api-budget: github-actions-token 120/hr - pull_request-failure wakes: one jobs read, up to five annotation reads, one PR read and one rerun request each

import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

// The shared-bucket failure classifier is preferred but optional: the rerun
// job's trusted sparse checkout in .github/workflows/lane-fix-relay.yml does
// not carry scripts/lib/github-rate-limit.mjs yet (the App token that lands
// script PRs cannot write workflow files), so until that one-line checkout
// change lands the fallback below classifies without it. Both paths downgrade
// an API failure to a warning; only the retry timing and the marker wording
// differ.
const sharedClassifier = await import('./lib/github-rate-limit.mjs').then(
  mod => ({
    classify: mod.classifyGitHubFailure,
    planRetry: mod.planRetry,
  }),
  () => null
);
const QUOTA_DEFERRED_MARKER = 'github-quota-deferred';

export const RERUN_ATTEMPT_CAP = 2;
export const UNACQUIRED_MESSAGE =
  /job was not acquired by Runner of type hosted/i;
const SHA = /^[0-9a-f]{40}$/;
const RERUNNABLE_CONCLUSIONS = new Set(['failure']);
const MAX_ANNOTATION_READS = 5;
// The job's timeout-minutes is 3 and setup plus checkout cost ~15 s, so the
// evidence reads may wait out at most 60 s of retries and still leave the
// relay job (needs: rerun-unacquired) its own budget in the same run.
export const READ_ATTEMPTS = 3;
export const READ_TIMEOUT_MS = 20_000;
export const READ_MAX_WAIT_MS = 60_000;

/** A gh failure with its doctrine classification attached. */
export class GitHubApiError extends Error {
  constructor(message, kind) {
    super(message);
    this.name = 'GitHubApiError';
    this.kind = kind;
  }
}

// A coarse copy of the doctrine's quota signal, used ONLY when the shared
// classifier is not in the checkout: it decides the warning wording, never
// the verdict (every failure degrades either way).
const FALLBACK_QUOTA_TEXT =
  /\b(?:api rate limit (?:already )?exceeded|x-ratelimit-remaining:\s*0|secondary rate limit)\b/i;

/** @param {string} text gh stderr+stdout */
export function classifyFallbackFailure(text) {
  return {
    kind: FALLBACK_QUOTA_TEXT.test(String(text ?? ''))
      ? 'rate-limit'
      : 'unclassified',
    retryable: false,
  };
}

/** A pull_request job GitHub never handed to a hosted runner and ran no step. */
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

function captureGh(args, timeoutMs) {
  const outcome = spawnSync('gh', args, {
    encoding: 'utf8',
    timeout: timeoutMs,
  });
  return {
    ok: (outcome.status ?? 1) === 0,
    stdout: String(outcome.stdout ?? ''),
    text: [outcome.error?.message, outcome.stderr, outcome.stdout]
      .filter(Boolean)
      .join('\n'),
  };
}

const sleepSync = waitMs =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, waitMs);

const firstLine = text => {
  const line = String(text ?? '')
    .split(/\r?\n/)
    .find(Boolean);
  return (line ?? 'unknown error').slice(0, 240);
};

/**
 * gh api under the shared-bucket doctrine: transient and secondary failures
 * retry inside a small budget when the shared classifier is in the checkout;
 * quota exhaustion defers immediately because the reset never fits this job's
 * three-minute timeout. Without the classifier nothing retries and every
 * failure carries its coarse kind. A survivor throws GitHubApiError with the
 * classification attached; the caller downgrades it, this hop never reddens
 * the relay run.
 * @param {{
 *   attempts?: number,
 *   timeoutMs?: number,
 *   maxWaitMs?: number,
 *   now?: () => number,
 *   sleep?: (waitMs: number) => unknown,
 *   capture?: (args: string[], timeoutMs: number) => { ok: boolean, stdout: string, text: string },
 *   log?: (message: string) => unknown,
 *   classifier?: { classify: (failure: { message: string, now?: number }) => any, planRetry: (plan: any) => number | null } | null,
 * }} [options]
 * @returns {(path: string) => any}
 */
export function makeResilientApi({
  attempts = READ_ATTEMPTS,
  timeoutMs = READ_TIMEOUT_MS,
  maxWaitMs = READ_MAX_WAIT_MS,
  now = Date.now,
  sleep = sleepSync,
  capture = captureGh,
  log = message => process.stderr.write(`${message}\n`),
  classifier = sharedClassifier,
} = {}) {
  return function ghApi(path) {
    const deadlineMs = now() + maxWaitMs;
    for (let attempt = 1; ; attempt += 1) {
      const outcome = capture(
        ['api', '-H', 'Cache-Control: no-cache', path],
        timeoutMs
      );
      if (outcome.ok) return JSON.parse(outcome.stdout);
      const classification = classifier
        ? classifier.classify({ message: outcome.text, now: now() })
        : classifyFallbackFailure(outcome.text);
      const waitMs = classifier
        ? classifier.planRetry({
            classification,
            attempt,
            attempts,
            nowMs: now(),
            deadlineMs,
          })
        : null;
      if (waitMs === null)
        throw new GitHubApiError(
          `the github api read of ${path} failed (${classification.kind}): ${firstLine(
            outcome.text
          )}`,
          classification.kind
        );
      log(
        `[unacquired-rerun] ${classification.kind} on attempt ${attempt}/${attempts}; retrying in ${Math.ceil(waitMs / 1000)}s`
      );
      sleep(waitMs);
    }
  };
}

export const ghApi = makeResilientApi();

const defaultWarn = message =>
  process.stdout.write(
    `::warning::${String(message).replace(/\r?\n/g, ' ')}\n`
  );

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {(path: string) => any} [api]
 * @param {(id: string) => unknown} [rerun]
 * @param {{ warn?: (message: string) => unknown }} [reporting]
 */
export function main(
  env = process.env,
  api = ghApi,
  rerun = undefined,
  { warn = defaultWarn } = {}
) {
  const repository = env.GH_REPOSITORY;
  if (!/^[\w.-]+\/[\w.-]+$/.test(String(repository ?? '')))
    throw new Error('GH_REPOSITORY must be owner/name');
  const run = JSON.parse(
    readFileSync(String(env.GITHUB_EVENT_PATH), 'utf8')
  )?.workflow_run;
  const runId = String(run?.id ?? '');
  if (!/^[1-9][0-9]*$/.test(runId))
    throw new Error('event must carry a workflow_run with a positive id');
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
  let plan;
  try {
    plan = planUnacquiredRerun(collectEvidence(api, repository, run));
    if (plan.rerun) {
      try {
        doRerun(runId);
      } catch (error) {
        plan = {
          rerun: false,
          reason: `rerun request failed: ${firstLine(error?.message ?? error)}`,
        };
        warn(
          `the rerun request for run ${runId} failed; the relay still labels the PR for the lanes: ${firstLine(error?.message ?? error)}`
        );
      }
    }
  } catch (error) {
    // An evidence read that never succeeded is infrastructure, not a verdict
    // on any change. Downgrade and keep requested=false so the relay job in
    // this same run still labels the PR for the lanes (JOV-7922).
    const kind =
      error instanceof GitHubApiError
        ? error.kind
        : (sharedClassifier?.classify({
            message: String(error?.message ?? error),
          })?.kind ??
          classifyFallbackFailure(String(error?.message ?? error)).kind);
    plan = { rerun: false, reason: `evidence unavailable: GitHub ${kind}` };
    if (kind === 'none' || kind === 'unclassified')
      warn(
        `rerun evidence for run ${runId} is unavailable: ${firstLine(error?.message ?? error)}`
      );
    else
      warn(
        `${QUOTA_DEFERRED_MARKER}: GitHub ${kind} while reading rerun evidence for run ${runId}; not a verdict on this change. Re-run after the quota resets.`
      );
  }
  console.log(
    `${plan.rerun ? 'Re-requested' : 'No rerun for'} run ${runId}: ${plan.reason}`
  );
  if (env.GITHUB_OUTPUT)
    appendFileSync(env.GITHUB_OUTPUT, `requested=${plan.rerun}\n`);
  return plan;
}

if (process.argv[1]?.endsWith('pr-unacquired-runner-rerun.mjs')) main();
