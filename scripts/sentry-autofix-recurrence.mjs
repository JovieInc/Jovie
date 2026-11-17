#!/usr/bin/env node
// Runs the registered Sentry validation observations (Linear issues in
// Validating that carry a `sentry-observation:v1` registration) on the Ops/Gem
// Sentry recurrence clock. The legacy loop that resolved or reopened Sentry
// issues from merged "Sentry autofix" PRs was removed with sentry-autofix.yml
// (JOV-12619); every PR it found lacked an issue ID and was skipped.

import { remediationTriggersEnabled } from './lib/linear-issue-intake.mjs';
import { runSentryValidationObservations } from './lib/sentry-validation-observation.mjs';

/**
 * @param {{
 *   githubToken?: string,
 *   sentryToken?: string,
 *   repository?: string,
 *   now?: Date,
 *   linearApiKey?: string,
 *   fetchImpl?: typeof fetch,
 * }} [options]
 * @returns {Promise<{ok: boolean, reason?: string,
 * deferred?: import('./lib/sentry-validation-observation.mjs').ObservationDeferral,
 * observations?: Awaited<ReturnType<typeof runSentryValidationObservations>>}>}
 */
export async function runSentryRecurrenceObservations({
  githubToken = process.env.GH_TOKEN,
  sentryToken = process.env.SENTRY_AUTH_TOKEN,
  repository = process.env.GITHUB_REPOSITORY ?? 'JovieInc/Jovie',
  now = new Date(),
  linearApiKey = process.env.LINEAR_API_KEY,
  fetchImpl = fetch,
} = {}) {
  if (!githubToken) return { ok: false, reason: 'missing_github_token' };
  if (!sentryToken) return { ok: false, reason: 'missing_sentry_auth_token' };

  const observations = await runSentryValidationObservations({
    apiKey: linearApiKey,
    githubToken,
    sentryToken,
    repository,
    now,
    fetchImpl,
    writeReceipts: remediationTriggersEnabled(),
  });
  return {
    ok: observations.ok,
    observations,
    ...(observations.deferred ? { deferred: observations.deferred } : {}),
    ...(!observations.ok ? { reason: observations.reason } : {}),
  };
}

// JOV-6813 (2026-11-16 15:43Z): one transient gh HTTP 503 while downloading a
// production-marker artifact failed the whole hourly run as
// verified_production_artifact_unavailable; the two prior hourly runs passed.
// Retry the run on exactly that reason (3 attempts, fixed backoffs). The retry
// is write-safe: a conclusion receipt is only recorded when the exact body is
// not already on the issue (already_recorded), so a retried observation never
// double-records. Every other reason returns after one attempt, and after the
// last attempt the original failure stands -- nothing is skipped or softened.
const RUN_ATTEMPT_DELAYS_MS = [500, 1_500];

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Retry the observation run only while it fails to read the production
 * artifact evidence; a deterministic failure returns after one attempt.
 * @param {Parameters<typeof runSentryRecurrenceObservations>[0]} [options]
 * @param {number[]} [delaysMs] sleep before retry attempt N (attempts 2..N+1)
 * @returns {ReturnType<typeof runSentryRecurrenceObservations>}
 */
export async function runSentryRecurrenceObservationsWithRetry(
  options,
  delaysMs = RUN_ATTEMPT_DELAYS_MS
) {
  let last;
  for (let attempt = 0; attempt <= delaysMs.length; attempt += 1) {
    if (attempt > 0) sleepSync(delaysMs[attempt - 1]);
    last = await runSentryRecurrenceObservations(options);
    if (last.ok || last.reason !== 'verified_production_artifact_unavailable')
      return last;
  }
  return last;
}

async function main() {
  const result = await runSentryRecurrenceObservationsWithRetry({});
  console.log(JSON.stringify(result));
  if (!result.ok) throw new Error(result.reason);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    // Let the workflow pipe drain the structured failure result.
    process.exitCode = 1;
  });
}
