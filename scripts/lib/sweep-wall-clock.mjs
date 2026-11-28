#!/usr/bin/env node
/**
 * Wall-clock budget and deferral reporting for the Linear validation
 * lifecycle writer (JOV-7887). Kept beside linear-sync-on-merge.mjs so the
 * writer stays inside its size-500 ceiling; these pieces are pure clock and
 * reporting helpers with no Linear or GitHub transport of their own.
 */

import { appendFileSync } from 'node:fs';

/**
 * JOV-7887: a full sweep used to run until the job's runner timeout killed
 * it, and the kill also skipped the cursor save, so every sweep restarted
 * the same overrun and ~60% of sweep runs were cancelled. The workflow
 * exports one shared wall-clock deadline for every evaluation invocation in
 * the job; the sweep stops before starting another batch once too little of
 * it remains and defers the remainder from the cursor instead.
 */
export const SWEEP_MIN_BATCH_WINDOW_MS = 90_000;

/**
 * Remaining wall-clock budget before the job-exported deadline, or null when
 * no deadline was exported (merge events, receipt wakes, tests, direct runs).
 * @param {string | undefined} deadlineAt
 * @param {number} [now]
 * @returns {number | null}
 */
export function sweepBudgetRemainingMs(deadlineAt, now = Date.now()) {
  if (!deadlineAt) return null;
  const deadline = Date.parse(deadlineAt);
  return Number.isFinite(deadline) ? deadline - now : null;
}

/**
 * Make a quota deferral visible: step output for the workflow's hold-and-retry
 * and a summary line. Exit stays 0 (the 403 is not a verdict on any issue).
 * @param {{ softFailed: boolean }} disposition
 * @param {NodeJS.ProcessEnv} [env]
 */
export function reportQuotaDeferral(disposition, env = process.env) {
  if (!disposition?.softFailed) return false;
  try {
    if (env.GITHUB_OUTPUT)
      appendFileSync(env.GITHUB_OUTPUT, 'quota_deferred=true\n');
    if (env.GITHUB_STEP_SUMMARY)
      appendFileSync(
        env.GITHUB_STEP_SUMMARY,
        '- Linear sync DEFERRED: GitHub installation quota 403; no lifecycle evaluation completed.\n'
      );
  } catch {
    // Visibility must never turn a deferral into a crash.
  }
  return true;
}

/**
 * A resolved deferral must set quota_deferred (exit stays 0). Without the
 * flag the hold skipped and the run went green unfinished (41157880216).
 * deferral_kind=linear skips that GitHub hold (43041615689).
 *
 * A wall-clock pause is not a quota event (JOV-7887): no quota_deferred
 * output, so the GitHub-quota hold and its retry never run for it. The
 * summary keeps the pause visible; the cursor already holds the resume
 * point.
 *
 * @param {{ action?: string, deferred?: number, deferralKind?: string } | null | undefined} result
 * @param {NodeJS.ProcessEnv} [env]
 */
export function reportSweepDeferral(result, env = process.env) {
  if (!result) return false;
  if (result.action === 'budget_deferred') {
    const paused =
      result.deferred && result.deferred > 0
        ? `${result.deferred} issue(s) left for the next sweep by the job wall-clock budget`
        : 'the job wall-clock budget stopped the sweep before any lifecycle evaluation';
    try {
      if (env.GITHUB_STEP_SUMMARY)
        appendFileSync(
          env.GITHUB_STEP_SUMMARY,
          `- Linear sync paused before the job wall-clock budget: ${paused}; the cursor resumes there.\n`
        );
    } catch {
      // Visibility must never turn a deferral into a crash.
    }
    return true;
  }
  if (result.action !== 'deferred') return false;
  const detail =
    result.deferred && result.deferred > 0
      ? `${result.deferred} issue(s) deferred to the next sweep by the rate limit; the retry resumes from the cursor`
      : 'the rate limit stopped the sweep before any lifecycle evaluation';
  try {
    if (env.GITHUB_OUTPUT) {
      const kind = result.deferralKind
        ? `deferral_kind=${result.deferralKind}\n`
        : '';
      appendFileSync(env.GITHUB_OUTPUT, `quota_deferred=true\n${kind}`);
    }
    if (env.GITHUB_STEP_SUMMARY)
      appendFileSync(
        env.GITHUB_STEP_SUMMARY,
        `- Linear sync DEFERRED: ${detail}.\n`
      );
  } catch {
    // Visibility must never turn a deferral into a crash.
  }
  return true;
}
