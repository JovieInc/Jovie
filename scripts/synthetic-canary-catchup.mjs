#!/usr/bin/env node
/** JOV-6813: missed-slot catch-up for the production synthetic canary.
 *
 * GitHub's cron scheduler drops or delays slots (the 2026-11-16 window lost
 * three of four). The dead-man (scripts/synthetic-canary-liveness.mjs)
 * correctly alarms on a drop and keeps counting scheduled runs only; this
 * actor restores probe coverage between slots: when no scheduled canary has
 * run inside the dead-man's 7-hour window and no catch-up dispatch has been
 * issued since the last scheduled run, it dispatches
 * synthetic-monitoring.yml via workflow_dispatch exactly once per gap. A
 * successful dispatch never turns the dead-man green, never loosens the
 * 7-hour threshold, and never skips or weakens the check. Quota exhaustion
 * defers (exit 75, `github-quota-deferred`); it is never a final verdict.
 */
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createGitHubClient } from '../packages/api-client/github.ts';
import {
  classifyGitHubFailure,
  EX_TEMPFAIL,
  QUOTA_DEFERRED_MARKER,
} from './lib/github-rate-limit.mjs';
import {
  DAILY_TITLE,
  MAX_SILENCE_MINUTES,
} from './synthetic-canary-liveness.mjs';

export const CANARY_WORKFLOW = 'synthetic-monitoring.yml';
export const DISPATCH_REF = 'main';
export const CONFIRM_ATTEMPTS = 5;
export const CONFIRM_DELAY_MS = 5_000;

/** @typedef {{rest: (method: string, path: string, body?: unknown, options?: object) =>
 * Promise<{status: number, headers?: unknown, json: () => unknown}>}} WorkflowReader */

class EvidenceError extends Error {
  /** @param {{status: number, headers?: unknown}} response */
  constructor(response) {
    super('evidence-unavailable');
    this.status = response.status;
    this.headers = response.headers;
  }
}

/** @param {WorkflowReader} github */
async function readRuns(github, path) {
  const response = await github.rest('GET', path, undefined, {
    priority: 'poll',
    timeoutMs: 10_000,
    maxAttempts: 2,
    maxWaitMs: 5_000,
  });
  if (response.status !== 200) throw new EvidenceError(response);
  const body = await response.json();
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new EvidenceError({ status: 200, headers: response.headers });
  }
  const { workflow_runs: runs } = /** @type {{workflow_runs?: unknown}} */ (
    body
  );
  if (!Array.isArray(runs)) throw new EvidenceError({ status: 200 });
  return /** @type {Array<Record<string, unknown>>} */ (runs);
}

/**
 * Newest scheduled main-branch canary run, mirroring the dead-man's filter:
 * the daily AI probe and anything off main cannot reset the heartbeat.
 * @param {Array<Record<string, unknown>>} runs
 * @param {number} now
 */
export function latestCanaryScheduledRun(runs, now) {
  const scheduled = runs
    .filter(
      run =>
        run.event === 'schedule' &&
        run.head_branch === 'main' &&
        run.display_title !== DAILY_TITLE
    )
    .sort(
      (a, b) =>
        Date.parse(/** @type {string} */ (b.created_at)) -
        Date.parse(/** @type {string} */ (a.created_at))
    );
  const newest = scheduled[0];
  if (!newest) return null;
  const created = Date.parse(/** @type {string} */ (newest.created_at));
  const age = (now - created) / 60_000;
  if (
    !Number.isFinite(created) ||
    !Number.isFinite(age) ||
    age < 0 ||
    !Number.isSafeInteger(newest.id)
  ) {
    throw new Error('invalid-run');
  }
  return { run: newest, created, age };
}

/**
 * Read the live run evidence and decide the catch-up action. Never dispatches
 * on unreadable or malformed evidence (fail closed, like the dead-man).
 * @param {WorkflowReader} github
 * @param {string} repo
 * @param {number} now
 */
export async function decideCatchup(github, repo, now) {
  const runs = await readRuns(
    github,
    `/repos/${repo}/actions/workflows/${CANARY_WORKFLOW}/runs?branch=main&event=schedule&per_page=10`
  );
  const last = latestCanaryScheduledRun(runs, now);
  if (!last) return { action: 'no-scheduled-run-evidence' };
  if (last.age <= MAX_SILENCE_MINUTES) {
    return { action: 'canary-schedule-healthy', lastScheduledRun: last.run };
  }
  const dispatched = await readRuns(
    github,
    `/repos/${repo}/actions/workflows/${CANARY_WORKFLOW}/runs?event=workflow_dispatch&per_page=10`
  );
  const newestDispatch = dispatched
    .filter(run => run.head_branch === 'main')
    .map(run => Date.parse(/** @type {string} */ (run.created_at)))
    .filter(created => Number.isFinite(created))
    .sort((a, b) => b - a)[0];
  if (newestDispatch !== undefined && newestDispatch >= last.created) {
    return { action: 'catch-up-already-issued', lastScheduledRun: last.run };
  }
  return { action: 'dispatch', lastScheduledRun: last.run };
}

/**
 * Dispatch the canary once, then confirm the run row appeared (the runs list
 * is the idempotency ledger: the next evaluation sees it and no-ops).
 * @param {WorkflowReader} github
 * @param {string} repo
 * @param {{now?: number, sleep?: (ms: number) => Promise<void>}} [options]
 */
export async function dispatchCatchup(github, repo, options = {}) {
  const sleep =
    options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now();
  const response = await github.rest(
    'POST',
    `/repos/${repo}/actions/workflows/${CANARY_WORKFLOW}/dispatches`,
    { ref: DISPATCH_REF }
  );
  if (response.status !== 204) {
    const { kind } = classifyGitHubFailure({
      status: response.status,
      headers: response.headers,
    });
    return { dispatched: false, deferred: kind !== 'none' };
  }
  for (let attempt = 0; attempt < CONFIRM_ATTEMPTS; attempt += 1) {
    await sleep(CONFIRM_DELAY_MS);
    const dispatched = await readRuns(
      github,
      `/repos/${repo}/actions/workflows/${CANARY_WORKFLOW}/runs?event=workflow_dispatch&per_page=10`
    );
    const confirmed = dispatched.some(
      run =>
        run.head_branch === 'main' &&
        Date.parse(/** @type {string} */ (run.created_at)) >= now - 60_000
    );
    if (confirmed)
      return { dispatched: true, deferred: false, confirmed: true };
  }
  return { dispatched: true, deferred: false, confirmed: false };
}

/**
 * Full catch-up flow. Exit contract: 0 nothing to do or dispatched and
 * confirmed, 75 quota or transient deferral, 1 unreadable evidence,
 * unconfirmed dispatch, or unexpected failure.
 * @param {{env?: NodeJS.ProcessEnv, github?: WorkflowReader, now?: number,
 * sleep?: (ms: number) => Promise<void>}} [options]
 */
export async function catchup(options = {}) {
  const { env = process.env, now = Date.now() } = options;
  const repo = env.GITHUB_REPOSITORY || 'JovieInc/Jovie';
  const github =
    options.github ??
    createGitHubClient({ token: env.GH_TOKEN || env.GITHUB_TOKEN || '' });
  try {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !Number.isFinite(now)) {
      throw new Error('invalid-context');
    }
    const decision = await decideCatchup(github, repo, now);
    if (decision.action !== 'dispatch') {
      return {
        ...decision,
        exitCode: decision.action === 'no-scheduled-run-evidence' ? 1 : 0,
      };
    }
    const outcome = await dispatchCatchup(github, repo, options);
    if (outcome.deferred) {
      return { ...decision, ...outcome, exitCode: EX_TEMPFAIL };
    }
    if (!outcome.dispatched) {
      return {
        ...decision,
        ...outcome,
        action: 'dispatch-failed',
        exitCode: 1,
      };
    }
    return { ...decision, ...outcome, exitCode: outcome.confirmed ? 0 : 1 };
  } catch (error) {
    const { kind } = classifyGitHubFailure({
      status: error instanceof EvidenceError ? error.status : null,
      headers: error instanceof EvidenceError ? error.headers : null,
      message: error instanceof Error ? error.message : '',
    });
    return {
      action: 'catch-up-error',
      exitCode: kind !== 'none' ? EX_TEMPFAIL : 1,
    };
  }
}

/** @param {{env?: NodeJS.ProcessEnv, github?: WorkflowReader, now?: number,
 * sleep?: (ms: number) => Promise<void>}} [options] */
export async function main(options = {}) {
  const result = await catchup(options);
  const { env = process.env, now = Date.now() } = options;
  const summary = `JOV-6813 catch-up: ${result.action} (exit ${result.exitCode})`;
  if (result.exitCode === EX_TEMPFAIL) {
    console.warn(
      `::warning title=Synthetic canary catch-up deferred::${QUOTA_DEFERRED_MARKER}: ${result.action}; the next liveness check retries after the quota reset.`
    );
  } else if (result.exitCode !== 0) {
    console.error(`::error::${summary}`);
  }
  if (env.GITHUB_STEP_SUMMARY) {
    appendFileSync(env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  }
  console.log(
    JSON.stringify({ checkedAt: new Date(now).toISOString(), ...result })
  );
  return result.exitCode;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    process.exitCode = await main();
  } catch {
    console.error('Synthetic canary catch-up could not publish its receipt');
    process.exitCode = 1;
  }
}
