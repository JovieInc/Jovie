#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { upsertLinearIssueByTitleFingerprint } from './lib/linear-issue-intake.mjs';

export function fingerprintSyntheticFailure(failedTests) {
  const normalized = String(failedTests ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  const digest = createHash('sha256')
    .update(normalized || 'unknown')
    .digest('hex')
    .slice(0, 12);
  return `synthetic-monitoring:${digest}`;
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
Scheduled production synthetic monitoring failed. Deduped by failed-test fingerprint.

## Why it matters
A persistently red 6-hour schedule is one missed Slack message away from invisible.

## Classification
Required

## Acceptance criteria or triage question
Reproduce the failed synthetics and keep this issue open until the schedule is green.

## Dependency
None

Fingerprint: \`${fingerprint}\`

\`\`\`
${failed}
\`\`\`
${runUrl ? `\nRun: ${runUrl}` : ''}`;

  return upsertLinearIssueByTitleFingerprint({
    fingerprint,
    title,
    description,
    priority: 1,
    apiKey,
    fetchImpl,
  });
}

async function main() {
  const result = await fileSyntheticMonitoringLinearIssue({
    failedTests: process.env.FAILED_TESTS,
    runUrl: process.env.RUN_URL,
  });
  if (!result.ok) {
    throw new Error(`Synthetic Linear intake failed: ${result.reason}`);
  }
  console.log(JSON.stringify(result));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
