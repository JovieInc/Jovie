#!/usr/bin/env node

import {
  addLinearIssueComment,
  closeLinearIssueByFingerprint,
  logRemediationDryRun,
  remediationTriggersEnabled,
  upsertLinearIssueByTitleFingerprint,
} from './lib/linear-issue-intake.mjs';
import {
  isLinearRateLimited,
  withLinearRateLimitRetry,
} from './lib/linear-rate-limit-retry.mjs';

export const SYNTHETIC_REMEDIATION_KEY = 'synthetic-monitoring';

/** Stable remediation key. Failed-test detail lives on the per-run comment. */
export function fingerprintSyntheticFailure(_failedTests) {
  return SYNTHETIC_REMEDIATION_KEY;
}

/**
 * @param {{
 *   testStatus?: string,
 *   flakyCount?: number,
 *   failedRetry?: boolean,
 *   previousConclusion?: string | null,
 *   runAttempt?: number,
 * }} input
 */
export function planSyntheticMonitoringAction({
  testStatus = 'error',
  flakyCount = 0,
  failedRetry = false,
  previousConclusion = null,
  runAttempt = 1,
} = {}) {
  const attempt = Number(runAttempt) || 1;
  const flakes = Number(flakyCount) || 0;
  if (flakes > 0 && !failedRetry) {
    return { action: 'flake', reason: 'flake' };
  }
  if (attempt > 1 && testStatus === 'passed') {
    return { action: 'flake', reason: 'rerun_passed' };
  }
  if (testStatus === 'passed') {
    if (previousConclusion === 'success') {
      return { action: 'resolve', reason: 'second_green' };
    }
    return { action: 'hold', reason: 'need_second_green' };
  }
  const red = testStatus === 'failed' || testStatus === 'error';
  if (red && (failedRetry || previousConclusion === 'failure')) {
    return {
      action: 'upsert',
      reason: failedRetry ? 'in_job_retry_failed' : 'consecutive_red',
    };
  }
  if (red) return { action: 'hold', reason: 'need_second_red' };
  return { action: 'hold', reason: 'unknown_status' };
}

export async function fileSyntheticMonitoringLinearIssue({
  failedTests,
  runUrl,
  apiKey = process.env.LINEAR_API_KEY,
  fetchImpl = fetch,
}) {
  const fingerprint = fingerprintSyntheticFailure(failedTests);
  const title = `P0: synthetic monitoring failed (${fingerprint})`;
  const failed = String(failedTests ?? 'unknown').trim() || 'unknown';
  const description = `## Source
- Current issue: ad-hoc
- Source PR: ${runUrl || 'not opened yet'}
- Source branch/session: synthetic-monitoring.yml

## Follow-up
Scheduled production synthetic monitoring failed. Deduped by the stable remediation key.

## Why it matters
A persistently red 6-hour schedule is one missed Slack message away from invisible.

## Classification
Required

## Acceptance criteria or triage question
Reproduce the failed synthetics and keep this issue open until two consecutive scheduled runs are green.

## Dependency
None

Fingerprint: \`${fingerprint}\`

\`\`\`
${failed}
\`\`\`
${runUrl ? `\nRun: ${runUrl}` : ''}`;

  return upsertLinearIssueByTitleFingerprint({
    fingerprint,
    labelKey: SYNTHETIC_REMEDIATION_KEY,
    title,
    description,
    priority: 1,
    reopenTerminal: true,
    apiKey,
    fetchImpl,
  });
}

/**
 * Linear rate limits defer the signal (visible warning + job summary) instead
 * of failing the probe verdict; every other failure still throws.
 * @param {{ env?: typeof process.env, fetchImpl?: typeof fetch }} [options]
 */
export async function runSyntheticMonitoringIntake({
  env = process.env,
  fetchImpl,
} = {}) {
  const testStatus = env.TEST_STATUS || 'error';
  const flakyCount = Number.parseInt(env.FLAKY_TESTS || '0', 10);
  const failedTests = env.FAILED_TESTS || '';
  const failedRetry = testStatus === 'failed' && failedTests.trim().length > 0;
  const previousConclusion = env.PREVIOUS_CONCLUSION || null;
  const plan = planSyntheticMonitoringAction({
    testStatus,
    flakyCount,
    failedRetry,
    previousConclusion,
    runAttempt: Number.parseInt(env.GITHUB_RUN_ATTEMPT || '1', 10),
  });
  const enabled = remediationTriggersEnabled();
  if (!enabled) {
    const dry = logRemediationDryRun({
      action: plan.action,
      key: SYNTHETIC_REMEDIATION_KEY,
      fingerprint: SYNTHETIC_REMEDIATION_KEY,
      reason: plan.reason,
    });
    console.log(JSON.stringify(dry));
    return dry;
  }
  if (plan.action === 'flake') {
    console.log(
      `::notice::synthetic flake (${plan.reason}); not filed. Flake count feeds remediation:flaky-test-filing through the ratchet.`
    );
    console.log(JSON.stringify({ ok: true, action: 'flake', ...plan }));
    return { ok: true, action: 'flake', ...plan };
  }
  if (plan.action === 'hold') {
    console.log(JSON.stringify({ ok: true, action: 'hold', ...plan }));
    return { ok: true, action: 'hold', ...plan };
  }
  if (plan.action === 'resolve') {
    const result = await withLinearRateLimitRetry(
      () =>
        closeLinearIssueByFingerprint({
          fingerprint: SYNTHETIC_REMEDIATION_KEY,
          labelKey: SYNTHETIC_REMEDIATION_KEY,
          comment:
            'Synthetic monitoring recovered on two consecutive green runs.',
          runId: env.GITHUB_RUN_ID,
          fetchImpl,
        }),
      { label: 'synthetic monitoring resolve' }
    );
    if (!result.ok) {
      throw new Error(`Synthetic Linear resolve failed: ${result.reason}`);
    }
    return result;
  }
  // Filing and the failed-test evidence comment are one idempotent unit: the
  // upsert dedupes by fingerprint, so a rate-limited comment retries the
  // whole unit instead of red on a bookkeeping delay. A real comment
  // failure after a successful filing stays best-effort (the issue exists);
  // only a rate-limited comment propagates so it can retry or defer.
  const result = await withLinearRateLimitRetry(
    async () => {
      const filed = await fileSyntheticMonitoringLinearIssue({
        failedTests,
        runUrl: env.RUN_URL,
        fetchImpl,
      });
      if (!filed.ok) return filed;
      if (filed.id) {
        const commented = await addLinearIssueComment({
          issueId: filed.id,
          body: `Failed tests (${env.GITHUB_RUN_ID ?? 'unknown'}):\n\n\`\`\`\n${failedTests || 'unknown'}\n\`\`\`\n${env.RUN_URL ?? ''}`,
          fetchImpl,
        });
        if (!commented.ok && isLinearRateLimited(commented)) return commented;
      }
      return filed;
    },
    { label: 'synthetic monitoring intake' }
  );
  if (!result.ok) {
    throw new Error(`Synthetic Linear intake failed: ${result.reason}`);
  }
  return result;
}

async function main() {
  console.log(JSON.stringify(await runSyntheticMonitoringIntake()));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
