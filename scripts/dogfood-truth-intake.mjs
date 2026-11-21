#!/usr/bin/env node
// Dogfood account truth loop (JOV-7140). The daily synthetic-monitoring job
// reads /api/cron/dogfood-truth, then this files one Linear issue per red
// finding key in Todo (Symphony picks Todo up and ships the fix) and resolves
// every known key that came back green. The next day's run is the
// verification: a fix only counts once its key stops appearing.

import {
  closeLinearIssueByFingerprint,
  logRemediationDryRun,
  remediationTriggersEnabled,
  upsertLinearIssueByTitleFingerprint,
} from './lib/linear-issue-intake.mjs';
import { withLinearRateLimitRetry } from './lib/linear-rate-limit-retry.mjs';

/** Every key the probe can emit; a key absent from a clean run is resolved. */
export const DOGFOOD_TRUTH_KEYS = Object.freeze([
  'dogfood-design-partner-missing',
  'dogfood-apple-unavailable',
  'dogfood-apple-unbound',
  'dogfood-apple-scan-stale',
  'dogfood-catalog-missing',
  'dogfood-catalog-hidden',
  'dogfood-cycle-not-running',
  'dogfood-cycle-failed',
]);

/**
 * A probe that failed or returned no checks proves nothing, so it resolves
 * nothing: only keys whose check ran can go green.
 */
export function planDogfoodTruthIntake(report) {
  if (
    !report ||
    !Array.isArray(report.findings) ||
    !Array.isArray(report.checks)
  ) {
    return { verdict: 'unmeasured', upserts: [], resolves: [] };
  }
  const red = new Map(report.findings.map(f => [f.key, f]));
  const unknown = [...red.keys()].filter(k => !DOGFOOD_TRUTH_KEYS.includes(k));
  if (unknown.length > 0) {
    throw new Error(`Unknown dogfood truth keys: ${unknown.join(', ')}`);
  }
  // Unbound or unavailable Apple Music skips the catalog checks below it.
  const appleSkipped =
    red.has('dogfood-apple-unbound') || red.has('dogfood-apple-unavailable');
  const appleDependent = new Set([
    'dogfood-apple-scan-stale',
    'dogfood-catalog-missing',
    'dogfood-catalog-hidden',
  ]);
  const partnerMissing = red.has('dogfood-design-partner-missing');
  const resolves = DOGFOOD_TRUTH_KEYS.filter(key => {
    if (red.has(key)) return false;
    if (partnerMissing) return false;
    if (appleSkipped && appleDependent.has(key)) return false;
    return true;
  });
  return {
    verdict: red.size === 0 ? 'green' : 'red',
    upserts: [...red.values()],
    resolves,
  };
}

function issueDescription(finding, report) {
  return [
    `Dogfood account truth found this on the design partner's own account (jov.ie/${report.creatorUsername ?? 'unknown'}), checked ${report.checkedAt}.`,
    '',
    finding.detail,
    '',
    'Evidence:',
    '```json',
    JSON.stringify(finding.evidence ?? {}, null, 2),
    '```',
    '',
    'Fix the product so this holds for every artist, not a one-off data edit. The daily synthetic-monitoring `dogfood-truth` job re-checks; this issue resolves itself when the key stops appearing.',
    "Fan-facing corrections to the account itself still need the founder's yes.",
  ].join('\n');
}

export async function applyDogfoodTruthPlan(
  plan,
  report,
  { runId, fetchImpl } = {}
) {
  if (!remediationTriggersEnabled()) {
    return logRemediationDryRun({
      action: 'dogfood-truth',
      key: 'dogfood-truth',
      fingerprint: 'dogfood-truth',
      upserts: plan.upserts.map(f => f.key),
      resolves: plan.resolves,
    });
  }
  const results = [];
  for (const finding of plan.upserts) {
    results.push(
      await withLinearRateLimitRetry(
        () =>
          upsertLinearIssueByTitleFingerprint({
            fingerprint: finding.key,
            labelKey: finding.key,
            title: `P1: dogfood: ${finding.title} (${finding.key})`,
            description: issueDescription(finding, report),
            priority: 2,
            createStateName: 'Todo',
            reopenTerminal: true,
            fetchImpl,
          }),
        { label: `dogfood truth ${finding.key}` }
      )
    );
  }
  for (const key of plan.resolves) {
    results.push(
      await withLinearRateLimitRetry(
        () =>
          closeLinearIssueByFingerprint({
            fingerprint: key,
            labelKey: key,
            comment: `The daily dogfood account truth check came back green for ${key}.`,
            runId,
            fetchImpl,
          }),
        { label: `dogfood truth resolve ${key}` }
      )
    );
  }
  const failed = results.filter(
    r => r && r.ok === false && r.reason !== 'not_found'
  );
  return { ok: failed.length === 0, results, failed };
}

export function summarize(report, plan) {
  const lines = [`Dogfood account truth: ${plan.verdict}`];
  for (const f of plan.upserts) lines.push(`- red ${f.key}: ${f.title}`);
  if (plan.verdict === 'green') lines.push('- every check passed');
  return lines.join('\n');
}

export async function runDogfoodTruthIntake({
  env = process.env,
  fetchImpl,
} = {}) {
  const report = JSON.parse(env.DOGFOOD_TRUTH_JSON || 'null');
  const plan = planDogfoodTruthIntake(report);
  if (plan.verdict === 'unmeasured') {
    throw new Error(
      'Dogfood truth probe returned no report; nothing resolved.'
    );
  }
  const result = await applyDogfoodTruthPlan(plan, report, {
    runId: env.GITHUB_RUN_ID,
    fetchImpl,
  });
  if (result && result.ok === false) {
    throw new Error(
      `Dogfood truth intake failed for ${result.failed.length} issue(s)`
    );
  }
  return { plan, summary: summarize(report, plan) };
}

async function main() {
  const { plan, summary } = await runDogfoodTruthIntake();
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  }
  // Red is the loop's signal, not a broken job: the issues carry the work.
  console.log(JSON.stringify({ verdict: plan.verdict }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
