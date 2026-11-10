#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  closeLinearIssueByFingerprint,
  logRemediationDryRun,
  remediationTriggersEnabled,
  upsertLinearIssueByTitleFingerprint,
} from './lib/linear-issue-intake.mjs';
import { withLinearRateLimitRetry } from './lib/linear-rate-limit-retry.mjs';

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

const WEB_AI_KEY = 'web-ai-health';

/**
 * Linear rate limits defer the signal (visible warning + job summary) instead
 * of failing the probe verdict; every other failure still throws.
 * @param {{ env?: typeof process.env, fetchImpl?: typeof fetch }} [options]
 */
export async function runWebAiHealthIntake({
  env = process.env,
  fetchImpl,
} = {}) {
  const statusOverride = env.WEB_AI_HEALTH_STATUS;
  const receiptPath = env.WEB_AI_HEALTH_RECEIPT_PATH;
  const receipt = receiptPath
    ? JSON.parse(await readFile(receiptPath, 'utf8'))
    : { status: statusOverride };
  const passed = receipt?.status === 'passed' || statusOverride === 'passed';
  if (!remediationTriggersEnabled()) {
    const dry = logRemediationDryRun({
      action: passed ? 'resolve' : 'upsert',
      key: WEB_AI_KEY,
      fingerprint: passed
        ? WEB_AI_KEY
        : buildWebAiHealthSignalPayload(receipt, env.RUN_URL).fingerprint,
    });
    console.log(JSON.stringify(dry));
    return dry;
  }
  if (passed) {
    const result = await withLinearRateLimitRetry(
      () =>
        closeLinearIssueByFingerprint({
          fingerprint: WEB_AI_KEY,
          labelKey: WEB_AI_KEY,
          comment: 'Web AI health receipt passed.',
          runId: env.GITHUB_RUN_ID,
          fetchImpl,
        }),
      { label: 'Web AI health resolve' }
    );
    if (!result.ok) {
      throw new Error(`Web AI health Linear resolve failed: ${result.reason}`);
    }
    return result;
  }
  const result = await withLinearRateLimitRetry(
    () =>
      fileWebAiHealthLinearIssue({
        receipt,
        runUrl: env.RUN_URL,
        fetchImpl,
      }),
    { label: 'Web AI health intake' }
  );
  if (!result.ok) {
    throw new Error(`Web AI health Linear intake failed: ${result.reason}`);
  }
  return result;
}

async function main() {
  console.log(JSON.stringify(await runWebAiHealthIntake()));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
