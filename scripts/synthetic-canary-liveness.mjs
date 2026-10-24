#!/usr/bin/env node
/** JOV-6813: independent observer, called by the existing liveness backstop. */
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createGitHubClient } from '../packages/api-client/github.ts';

export const MAX_SILENCE_MINUTES = 420; // Six-hour interval + one-hour grace.
export const RUN_GRACE_MINUTES = 60; // Includes runner queue time; job timeout is 20m.
const CANARY = 'Production Synthetic Tests';
const DAILY = 'Web AI Health (Daily)';
const DAILY_TITLE = 'Production Synthetic Monitoring (47 7 * * *)';
const CANARY_TITLE = 'Production Synthetic Monitoring (17 */6 * * *)';

async function read(github, path) {
  const response = await github.rest('GET', path, undefined, {
    priority: 'poll',
    timeoutMs: 10_000,
    maxAttempts: 2,
    maxWaitMs: 5_000,
  });
  if (response.status !== 200) throw new Error('evidence-unavailable');
  return response.json();
}

export async function checkSyntheticCanary({ github, repo, now = Date.now() }) {
  const result = (ok, reason, run) => ({
    ok,
    reason,
    runUrl: run
      ? `https://github.com/${repo}/actions/runs/${run.id}`
      : `https://github.com/${repo}/actions/workflows/synthetic-monitoring.yml`,
  });
  try {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !Number.isFinite(now)) {
      throw new Error('invalid-context');
    }
    const { workflow_runs: runs } = await read(
      github,
      `/repos/${repo}/actions/workflows/synthetic-monitoring.yml/runs?branch=main&event=schedule&per_page=10`
    );
    if (!Array.isArray(runs)) throw new Error('invalid-runs');
    const scheduled = runs
      .filter(run => run.event === 'schedule' && run.head_branch === 'main')
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    let pending = false;
    for (const run of scheduled) {
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
        return result(false, 'No scheduled canary within 7 hours', run);
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
    return result(false, 'No recent completed scheduled canary found');
  } catch {
    // Do not publish raw API errors (which may contain credential material).
    return result(false, 'Synthetic canary evidence unavailable');
  }
}

export async function main({
  env = process.env,
  github,
  now = Date.now(),
} = {}) {
  const checked = await checkSyntheticCanary({
    github:
      github ??
      createGitHubClient({ token: env.GH_TOKEN || env.GITHUB_TOKEN || '' }),
    repo: env.GITHUB_REPOSITORY || 'JovieInc/Jovie',
    now,
  });
  const status = checked.ok ? 'passed' : 'failed';
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
  }
  console.log(
    JSON.stringify({ checkedAt: new Date(now).toISOString(), ...checked })
  );
  return checked.ok ? 0 : 1;
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
