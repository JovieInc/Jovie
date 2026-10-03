#!/usr/bin/env node

import {
  addLinearIssueComment,
  closeLinearIssueByFingerprint,
  logRemediationDryRun,
  remediationTriggersEnabled,
  upsertLinearIssueByTitleFingerprint,
} from './lib/linear-issue-intake.mjs';

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

async function main() {
  const testStatus = process.env.TEST_STATUS || 'error';
  const flakyCount = Number.parseInt(process.env.FLAKY_TESTS || '0', 10);
  const failedTests = process.env.FAILED_TESTS || '';
  const failedRetry = testStatus === 'failed' && failedTests.trim().length > 0;
  const previousConclusion = process.env.PREVIOUS_CONCLUSION || null;
  const plan = planSyntheticMonitoringAction({
    testStatus,
    flakyCount,
    failedRetry,
    previousConclusion,
    runAttempt: Number.parseInt(process.env.GITHUB_RUN_ATTEMPT || '1', 10),
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
    return;
  }
  if (plan.action === 'flake') {
    console.log(
      `::notice::synthetic flake (${plan.reason}); not filed. Flake count feeds remediation:flaky-test-filing through the ratchet.`
    );
    console.log(JSON.stringify({ ok: true, action: 'flake', ...plan }));
    return;
  }
  if (plan.action === 'hold') {
    console.log(JSON.stringify({ ok: true, action: 'hold', ...plan }));
    return;
  }
  if (plan.action === 'resolve') {
    const result = await closeLinearIssueByFingerprint({
      fingerprint: SYNTHETIC_REMEDIATION_KEY,
      labelKey: SYNTHETIC_REMEDIATION_KEY,
      comment: 'Synthetic monitoring recovered on two consecutive green runs.',
      runId: process.env.GITHUB_RUN_ID,
    });
    if (!result.ok) {
      throw new Error(`Synthetic Linear resolve failed: ${result.reason}`);
    }
    console.log(JSON.stringify(result));
    return;
  }
  const result = await fileSyntheticMonitoringLinearIssue({
    failedTests,
    runUrl: process.env.RUN_URL,
  });
  if (!result.ok) {
    throw new Error(`Synthetic Linear intake failed: ${result.reason}`);
  }
  if (result.id) {
    await addLinearIssueComment({
      issueId: result.id,
      body: `Failed tests (${process.env.GITHUB_RUN_ID ?? 'unknown'}):\n\n\`\`\`\n${failedTests || 'unknown'}\n\`\`\`\n${process.env.RUN_URL ?? ''}`,
    });
  }
  console.log(JSON.stringify(result));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
