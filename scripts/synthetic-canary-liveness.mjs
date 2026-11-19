#!/usr/bin/env node
/** JOV-6813: independent observer, called by the existing liveness backstop. */
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createGitHubClient } from '../packages/api-client/github.ts';
import { QUOTA_DEFERRED_MARKER } from './lib/github-rate-limit.mjs';

export const MAX_SILENCE_MINUTES = 420; // Six-hour interval + one-hour grace.
export const RUN_GRACE_MINUTES = 60; // Includes runner queue time; job timeout is 20m.
const CANARY = 'Production Synthetic Tests';
const DAILY = 'Web AI Health (Daily)';
export const DAILY_TITLE = 'Production Synthetic Monitoring (47 7 * * *)';
const CANARY_TITLE = 'Production Synthetic Monitoring (17 */6 * * *)';
const INFRASTRUCTURE_READ_KINDS = new Set([
  'shed',
  'budget',
  'exhausted',
  'budget_exhausted',
]);

/**
 * The shared client throws ApiError (exit 75) when a poll read is shed, over
 * budget, or out of retries. That is infrastructure, not a canary verdict.
 * A returned HTTP status is a different failure and stays fail-closed.
 * @param {unknown} error
 */
function isInfrastructureReadFailure(error) {
  if (!error || typeof error !== 'object') return false;
  const exitCode = /** @type {{ exitCode?: unknown }} */ (error).exitCode;
  const kind = /** @type {{ kind?: unknown }} */ (error).kind;
  return (
    exitCode === 75 &&
    typeof kind === 'string' &&
    INFRASTRUCTURE_READ_KINDS.has(kind)
  );
}

/**
 * @typedef {{rest: (method: string, path: string, body?: unknown, options?: object) =>
 * Promise<{status: number, json: () => unknown}>}} WorkflowReader
 */

/** @param {WorkflowReader} github */
async function read(github, path) {
  const response = await github.rest('GET', path, undefined, {
    priority: 'poll',
    timeoutMs: 10_000,
    maxAttempts: 2,
    maxWaitMs: 5_000,
  });
  if (response.status !== 200) throw new Error('evidence-unavailable');
  const body = await response.json();
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('invalid-evidence');
  }
  return /** @type {Record<string, unknown>} */ (body);
}

/** @param {{github: WorkflowReader, repo: string, now?: number}} options */
export async function checkSyntheticCanary({ github, repo, now = Date.now() }) {
  /**
   * @param {boolean} ok
   * @param {string} reason
   * @param {{ id?: number } | undefined} [run]
   * @param {{ missedSlot?: boolean, deferred?: boolean }} [extra]
   */
  const result = (ok, reason, run, extra = {}) => ({
    ok,
    reason,
    // True only for the recoverable scheduler-drop class (stale heartbeat,
    // nothing in flight); consumers must never read it as a pass signal.
    missedSlot: false,
    runUrl: run
      ? `https://github.com/${repo}/actions/runs/${run.id}`
      : `https://github.com/${repo}/actions/workflows/synthetic-monitoring.yml`,
    ...extra,
  });
  try {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !Number.isFinite(now)) {
      throw new Error('invalid-context');
    }
    // No event filter: GitHub's scheduler drops and delays cron slots (2026-10-30
    // 18:17Z slot never fired; the 47 7 cron landed 6h47m late), and a manually
    // or automatically dispatched canary runs the identical probes (the
    // synthetic-test job admits workflow_dispatch), so it is heartbeat evidence
    // too — without it a dropped slot could only ever alarm, never recover.
    const { workflow_runs: runs } = await read(
      github,
      `/repos/${repo}/actions/workflows/synthetic-monitoring.yml/runs?branch=main&per_page=10`
    );
    if (!Array.isArray(runs)) throw new Error('invalid-runs');
    const candidates = runs
      .filter(
        run =>
          (run.event === 'schedule' || run.event === 'workflow_dispatch') &&
          run.head_branch === 'main'
      )
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    let pending = false;
    for (const run of candidates) {
      // A successful daily AI probe must never reset the six-hour heartbeat.
      if (run.display_title === DAILY_TITLE) continue;
      const age = (now - Date.parse(run.created_at)) / 60_000;
      if (
        !Number.isFinite(age) ||
        age < 0 ||
        !Number.isSafeInteger(run.id) ||
        !Number.isSafeInteger(run.run_attempt)
      )
        throw new Error('invalid-run');
      if (age > MAX_SILENCE_MINUTES) {
        return result(false, 'No scheduled canary within 7 hours', run, {
          // A fresher candidate in flight (the fallback's own re-dispatch,
          // still queued) means the slot is already being recovered —
          // re-dispatching would queue a duplicate every check interval.
          missedSlot: !pending,
        });
      }
      // Bind to this attempt: an older green attempt cannot hide a skipped rerun.
      const { jobs, total_count: total } = await read(
        github,
        `/repos/${repo}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`
      );
      if (!Array.isArray(jobs) || total !== jobs.length) {
        throw new Error('incomplete-jobs');
      }
      const canary = jobs.find(job => job.name === CANARY);
      const daily = jobs.find(job => job.name === DAILY);
      // Migration: runs created before run-name was added have no schedule tag.
      if (
        run.display_title !== CANARY_TITLE &&
        canary?.conclusion === 'skipped' &&
        daily &&
        daily.conclusion !== 'skipped'
      )
        continue;
      if (run.status === 'completed' && run.conclusion !== 'success') {
        return result(
          false,
          `Scheduled canary run concluded ${run.conclusion}`,
          run
        );
      }
      if (canary?.status === 'completed' && canary.conclusion !== 'success') {
        return result(
          false,
          `Scheduled canary job concluded ${canary.conclusion}`,
          run
        );
      }
      if (canary?.status === 'completed' && canary.conclusion === 'success') {
        return result(
          true,
          pending
            ? 'Previous canary healthy; next run pending'
            : 'Scheduled canary healthy',
          run
        );
      }
      if (run.status === 'completed') {
        return result(false, 'Completed run has no completed canary job', run);
      }
      if (age > RUN_GRACE_MINUTES) {
        return result(
          false,
          'Scheduled canary queued or running for over 1 hour',
          run
        );
      }
      // A fresh queued run is not a heartbeat. Still require a recent success.
      pending = true;
    }
    return result(
      false,
      'No recent completed scheduled canary found',
      undefined,
      {
        // With no candidate run in flight (pending), the scheduler itself
        // stopped producing canary runs — recoverable. With one in flight,
        // re-dispatching would only queue a duplicate.
        missedSlot: !pending,
      }
    );
  } catch (error) {
    // Do not publish raw API errors (which may contain credential material).
    // A thrown exit-75 read is retried by the next 20-minute bucket. It must
    // not reopen JOV-6813. Returned non-200 and every other throw stay red.
    if (isInfrastructureReadFailure(error)) {
      return result(false, 'Synthetic canary evidence deferred', undefined, {
        deferred: true,
      });
    }
    return result(false, 'Synthetic canary evidence unavailable');
  }
}

/**
 * Self-heal for a dropped scheduler slot: re-kick the canary via
 * workflow_dispatch. Requires a token with actions:write — the observer's
 * read-only GITHUB_TOKEN gets a 403 and stays failed until the workflow
 * grants it. A rejected dispatch never softens the dead-man verdict.
 * @param {{github: WorkflowReader, repo: string}} options
 */
export async function dispatchSyntheticCanary({ github, repo }) {
  const response = await github.rest(
    'POST',
    `/repos/${repo}/actions/workflows/synthetic-monitoring.yml/dispatches`,
    { ref: 'main' },
    {
      priority: 'poll',
      timeoutMs: 10_000,
      // One attempt: a timed-out-but-accepted dispatch retried would enqueue a
      // duplicate canary run; a missed re-kick is retried by the next check.
      maxAttempts: 1,
      maxWaitMs: 5_000,
    }
  );
  if (response.status !== 204) throw new Error('dispatch-rejected');
}

/** @param {{env?: NodeJS.ProcessEnv, github?: WorkflowReader, now?: number}} [options] */
export async function main({
  env = process.env,
  github,
  now = Date.now(),
} = {}) {
  const client =
    github ??
    createGitHubClient({ token: env.GH_TOKEN || env.GITHUB_TOKEN || '' });
  const repo = env.GITHUB_REPOSITORY || 'JovieInc/Jovie';
  const checked = await checkSyntheticCanary({ github: client, repo, now });
  // Fallback for the scheduler-drop class only (no heartbeat for 7 hours and
  // nothing in flight). Off by default: enable with SYNTHETIC_CANARY_DISPATCH=1
  // once the calling workflow carries actions:write. Opt-in, single-shot, and
  // never allowed to turn a failed check green.
  let missedSlotDispatched = false;
  if (checked.missedSlot && env.SYNTHETIC_CANARY_DISPATCH === '1') {
    try {
      await dispatchSyntheticCanary({ github: client, repo });
      missedSlotDispatched = true;
    } catch {
      missedSlotDispatched = false;
    }
  }
  const status = checked.deferred
    ? 'deferred'
    : checked.ok
      ? 'passed'
      : 'failed';
  if (env.GITHUB_OUTPUT) {
    appendFileSync(
      env.GITHUB_OUTPUT,
      `test_status=${status}\nfailed_tests=JOV-6813 dead-man: ${checked.reason}\nrun_url=${checked.runUrl}\n`
    );
  }
  if (env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      env.GITHUB_STEP_SUMMARY,
      `### Synthetic canary dead-man\n\n${new Date(now).toISOString()}: **${status}** — ${checked.reason}\n\n[Canary evidence](${checked.runUrl})\n`
    );
    if (checked.missedSlot) {
      appendFileSync(
        env.GITHUB_STEP_SUMMARY,
        `\nMissed-slot fallback: ${
          missedSlotDispatched
            ? 'canary re-dispatched'
            : env.SYNTHETIC_CANARY_DISPATCH === '1'
              ? 'dispatch rejected (token needs actions:write)'
              : 'disabled (set SYNTHETIC_CANARY_DISPATCH=1 with an actions:write token)'
        }\n`
      );
    }
  }
  if (checked.deferred) {
    console.warn(
      `::warning title=Synthetic canary evidence deferred::${QUOTA_DEFERRED_MARKER}: the next check retries. Not a canary failure.`
    );
  }
  console.log(
    JSON.stringify({
      checkedAt: new Date(now).toISOString(),
      missedSlotDispatched,
      ...checked,
    })
  );
  return checked.deferred || checked.ok ? 0 : 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    process.exitCode = await main();
  } catch {
    console.error('Synthetic watchdog could not publish its receipt');
    process.exitCode = 1;
  }
}
