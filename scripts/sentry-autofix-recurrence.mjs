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

async function main() {
  const result = await runSentryRecurrenceObservations({});
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
