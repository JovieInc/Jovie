#!/usr/bin/env node
// JOV-6920 revenue gate intake for the dispatched ci.yml Golden Path lane.
// ci.yml's Golden Path Report job calls this when the dispatched main run
// finishes, and golden-path-nightly.yml calls it when the dispatch itself
// fails or a green head is skipped. No caller waits on a run.

import { pathToFileURL } from 'node:url';
import {
  closeLinearIssueByFingerprint,
  logRemediationDryRun,
  remediationTriggersEnabled,
  upsertLinearIssueByTitleFingerprint,
} from './lib/linear-issue-intake.mjs';

export const GOLDEN_PATH_KEY = 'golden-path-nightly';

/** Job result (success/failure/cancelled/skipped) or "missing" when absent. */
export function goldenPathFingerprint(result) {
  return `${GOLDEN_PATH_KEY}:${String(result || '').trim() || 'missing'}`;
}

/**
 * @param {{ result?: string, runUrl?: string, mainSha?: string, runId?: string }} report
 * @param {{
 *   env?: Record<string, string | undefined>,
 *   upsert?: (args: any) => Promise<any>,
 *   close?: (args: any) => Promise<any>,
 * }} [deps]
 */
export async function reportGoldenPathResult(
  { result, runUrl = '', mainSha = '', runId = '' },
  {
    env = process.env,
    upsert = upsertLinearIssueByTitleFingerprint,
    close = closeLinearIssueByFingerprint,
  } = {}
) {
  if (result === 'success') {
    if (!remediationTriggersEnabled(env)) {
      return logRemediationDryRun({
        action: 'resolve',
        key: GOLDEN_PATH_KEY,
        fingerprint: GOLDEN_PATH_KEY,
      });
    }
    return close({
      fingerprint: GOLDEN_PATH_KEY,
      labelKey: GOLDEN_PATH_KEY,
      comment: 'Golden Path nightly is green.',
      runId,
      apiKey: env.LINEAR_API_KEY,
    });
  }
  const fingerprint = goldenPathFingerprint(result);
  if (!remediationTriggersEnabled(env)) {
    return logRemediationDryRun({
      action: 'upsert',
      key: GOLDEN_PATH_KEY,
      fingerprint,
    });
  }
  return upsert({
    fingerprint,
    labelKey: GOLDEN_PATH_KEY,
    title: `P0: Golden Path nightly is red (${fingerprint})`,
    description: [
      '## Source',
      '- Workflow: golden-path-nightly.yml dispatch of ci.yml (JOV-6920 revenue gate)',
      `- Golden Path run: ${runUrl}`,
      `- main: ${mainSha}`,
      '',
      '## Why it matters',
      'The real-auth signup -> claim -> live profile and checkout -> verified payment -> entitlement -> refund journey failed on main. The revenue gate is RED until this passes.',
      '',
      '## Acceptance',
      'Fix the failing step; this issue stays open until the nightly Golden Path is green again.',
      '',
      `Fingerprint: ${fingerprint}`,
    ].join('\n'),
    priority: 1,
    createStateName: 'Todo',
    reopenTerminal: true,
    apiKey: env.LINEAR_API_KEY,
  });
}

async function main() {
  const { GOLDEN_PATH_RESULT, RUN_URL, MAIN_SHA, GITHUB_RUN_ID } = process.env;
  const outcome = await reportGoldenPathResult({
    result: GOLDEN_PATH_RESULT,
    runUrl: RUN_URL,
    mainSha: MAIN_SHA,
    runId: GITHUB_RUN_ID,
  });
  console.log(JSON.stringify(outcome));
  if (outcome && outcome.ok === false) {
    throw new Error(`Golden Path Linear intake failed: ${outcome.reason}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
