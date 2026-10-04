#!/usr/bin/env node

import { planFlakyTestFiling } from './lib/flaky-test-filing.mjs';
import { upsertLinearIssueByTitleFingerprint } from './lib/linear-issue-intake.mjs';

async function main() {
  const ratchetFailed =
    process.env.RATCHET_FAILED === 'true' ||
    process.env.RATCHET_STATUS === 'failure';
  const plan = planFlakyTestFiling({
    ratchetFailed,
    flakyCount: process.env.FLAKY_COUNT || '0',
    runUrl: process.env.RUN_URL || '',
  });
  if (!plan) {
    console.log('Skipping remediation:flaky-test-filing (ratchet is green).');
    return;
  }
  const result = await upsertLinearIssueByTitleFingerprint({
    fingerprint: plan.fingerprint,
    title: plan.title,
    description: plan.description,
    priority: plan.priority,
    createStateName: plan.createStateName,
    reopenTerminal: plan.reopenTerminal,
  });
  if (!result.ok) {
    throw new Error(`Linear intake failed: ${result.reason}`);
  }
  console.log(JSON.stringify(result));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
