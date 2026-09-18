#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { upsertLinearIssueByTitleFingerprint } from './lib/linear-issue-intake.mjs';

export function fingerprintM2RevenuePathFailure(failedSteps) {
  const normalized = String(failedSteps ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  const digest = createHash('sha256')
    .update(normalized || 'unknown')
    .digest('hex')
    .slice(0, 12);
  return `m2-revenue-path:${digest}`;
}

export function formatFailedM2Steps(receipt) {
  if (!receipt || typeof receipt !== 'object') return 'unknown';
  const steps = Array.isArray(receipt.steps) ? receipt.steps : [];
  const failed = steps
    .filter(step => step && step.ok === false)
    .map(step => {
      const name = String(step.name ?? 'unknown');
      const detail = String(step.detail ?? 'failed').replace(/\s+/g, ' ');
      return `${name}: ${detail}`;
    });
  return failed.length > 0 ? failed.join('\n') : 'unknown';
}

export async function fileM2RevenuePathLinearIssue({
  receipt,
  runUrl = '',
  apiKey = process.env.LINEAR_API_KEY,
  fetchImpl = fetch,
}) {
  const failedSteps = formatFailedM2Steps(receipt);
  const fingerprint = fingerprintM2RevenuePathFailure(failedSteps);
  const target =
    receipt && typeof receipt.target === 'string' ? receipt.target : 'unknown';
  const repro =
    receipt && typeof receipt.repro === 'string'
      ? receipt.repro
      : 'pnpm --filter=@jovie/web exec tsx scripts/m2-revenue-path-canary.ts --base-url https://jov.ie';
  const title = `P0: M2 revenue-path canary failed (${fingerprint})`;
  const description = `## Source
- Current issue: JOV-6439
- Source PR: ${runUrl || 'not opened yet'}
- Source branch/session: m2-revenue-path-canary.yml

## Follow-up
Daily M2 revenue-path canary (signed-out → claim → $199 Pro checkout → activation) is red. This is not generic uptime.

## Why it matters
A broken money path can look green on the health gate while checkout or activation is dark.

## Classification
Required

## Acceptance criteria or triage question
Reproduce the failed step, keep this issue open until the scheduled canary is green.

## Dependency
None

Fingerprint: \`${fingerprint}\`
Target: \`${target}\`

### Repro
\`\`\`
${repro}
\`\`\`

### Failed steps
\`\`\`
${failedSteps}
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

function parseReceipt(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function main() {
  const receipt = parseReceipt(process.env.M2_CANARY_RECEIPT_JSON);
  const result = await fileM2RevenuePathLinearIssue({
    receipt,
    runUrl: process.env.RUN_URL,
  });
  if (!result.ok) {
    throw new Error(`M2 revenue-path Linear intake failed: ${result.reason}`);
  }
  console.log(JSON.stringify(result));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
