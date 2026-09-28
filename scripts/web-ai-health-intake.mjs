#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { upsertLinearIssueByTitleFingerprint } from './lib/linear-issue-intake.mjs';

function failureRows(receipt) {
  return receipt.results.filter(result => result.ok === false);
}

export function fingerprintWebAiHealthFailure(receipt) {
  const material = failureRows(receipt)
    .map(result => `${result.surface}:${result.model}:${result.failureCause}`)
    .sort()
    .join('|');
  const digest = createHash('sha256')
    .update(`${receipt.gatewayAllowlist.name}|${material || 'unknown'}`)
    .digest('hex')
    .slice(0, 12);
  return `web-ai-health:${digest}`;
}

function tableCell(value) {
  return String(value ?? 'unknown')
    .replaceAll('|', '\\|')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

export function buildWebAiHealthSignalPayload(receipt, runUrl) {
  const failures = failureRows(receipt);
  const fingerprint = fingerprintWebAiHealthFailure(receipt);
  const primaryCause = failures[0]?.failureCause ?? 'unknown';
  const rows = failures
    .map(
      result =>
        `| ${tableCell(result.surface)} | ${tableCell(result.model)} | ${tableCell(result.failureCause)} | ${tableCell(result.message)} |`
    )
    .join('\n');
  const title = `High: Web AI health ${primaryCause} (${fingerprint})`;
  const description = `## Signal
- Severity: high
- Route: bug
- Environment: production
- Gateway allowlist: ${receipt.gatewayAllowlist.name}
- Checked at: ${receipt.checkedAt}

## Source
- Current issue: JOV-6938
- Source PR: ${runUrl || 'not opened yet'}
- Source branch/session: synthetic-monitoring.yml / web-ai-health

## Follow-up
One or more production Web AI surfaces failed the daily real-model probe.

| Surface | Model | Cause | Message |
| --- | --- | --- | --- |
${rows || '| unknown | unknown | request_error | Health receipt contained no classified failures. |'}

## Why it matters
The same Gateway policy boundary serves web chat, insights, pitches, titles, and packaging. A red result can make customer-facing AI silently return nothing.

## Classification
Required

## Acceptance criteria or triage question
Restore every failed surface, verify a fresh production receipt is green, and confirm the named Gateway allowlist still matches runtime model selection.

## Dependency
None

Fingerprint: \`${fingerprint}\`
${runUrl ? `\nRun: ${runUrl}` : ''}`;

  return { fingerprint, title, description };
}

export async function fileWebAiHealthLinearIssue({
  receipt,
  runUrl,
  apiKey = process.env.LINEAR_API_KEY,
  fetchImpl = fetch,
  upsertImpl = upsertLinearIssueByTitleFingerprint,
}) {
  if (receipt.status === 'passed') {
    return { ok: true, action: 'noop' };
  }
  const payload = buildWebAiHealthSignalPayload(receipt, runUrl);
  return upsertImpl({
    ...payload,
    priority: 2,
    createStateName: 'Todo',
    reopenTerminal: true,
    apiKey,
    fetchImpl,
  });
}

async function main() {
  const receiptPath = process.env.WEB_AI_HEALTH_RECEIPT_PATH;
  if (!receiptPath) {
    throw new Error('WEB_AI_HEALTH_RECEIPT_PATH is required');
  }
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  const result = await fileWebAiHealthLinearIssue({
    receipt,
    runUrl: process.env.RUN_URL,
  });
  if (!result.ok) {
    throw new Error(`Web AI health Linear intake failed: ${result.reason}`);
  }
  console.log(JSON.stringify(result));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
