#!/usr/bin/env node
// Daily chat outcome judge loop. The synthetic-monitoring job reads
// /api/cron/chat-outcome-judge, then this files one Linear repair issue per
// stalled chat intent (make merch, create a task, set up a release, write a
// bio) in Todo, and resolves every intent that was judged and came back clean.
// An intent with no turns in the window proves nothing and resolves nothing.

import {
  closeLinearIssueByFingerprint,
  logRemediationDryRun,
  remediationTriggersEnabled,
  upsertLinearIssueByTitleFingerprint,
} from './lib/linear-issue-intake.mjs';
import { withLinearRateLimitRetry } from './lib/linear-rate-limit-retry.mjs';

export const CHAT_OUTCOME_KEYS = Object.freeze([
  'chat-stall-merch',
  'chat-stall-task',
  'chat-stall-release',
  'chat-stall-bio',
]);

export function planChatOutcomeIntake(report) {
  if (
    !report ||
    !Array.isArray(report.findings) ||
    !Array.isArray(report.checks)
  ) {
    return { verdict: 'unmeasured', upserts: [], resolves: [] };
  }
  const red = new Map(report.findings.map(f => [f.key, f]));
  const unknown = [...red.keys()].filter(k => !CHAT_OUTCOME_KEYS.includes(k));
  if (unknown.length > 0) {
    throw new Error(`Unknown chat outcome keys: ${unknown.join(', ')}`);
  }
  const resolves = CHAT_OUTCOME_KEYS.filter(
    key => !red.has(key) && report.checks.includes(key)
  );
  return {
    verdict: red.size === 0 ? 'green' : 'red',
    upserts: [...red.values()],
    resolves,
  };
}

function issueDescription(finding, report) {
  return [
    `The daily chat outcome judge found this in real artist chats (${report.windowHours}h window ending ${report.checkedAt}).`,
    '',
    finding.detail,
    '',
    'Evidence (ids and counts only; read the conversations in the admin chat viewer):',
    '```json',
    JSON.stringify(finding.evidence ?? {}, null, 2),
    '```',
    '',
    'Fix the product so the ask is carried out with a sensible default. Add the failing transcript shape to apps/web/lib/eval/turn-outcome.test.ts as a red case. The judge re-checks daily; this issue resolves itself when the key stops appearing.',
  ].join('\n');
}

export async function applyChatOutcomePlan(
  plan,
  report,
  { runId, fetchImpl } = {}
) {
  if (!remediationTriggersEnabled()) {
    return logRemediationDryRun({
      action: 'chat-outcome',
      key: 'chat-outcome',
      fingerprint: 'chat-outcome',
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
            title: `P1: chat: ${finding.title} (${finding.key})`,
            description: issueDescription(finding, report),
            priority: 2,
            createStateName: 'Todo',
            reopenTerminal: true,
            fetchImpl,
          }),
        { label: `chat outcome ${finding.key}` }
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
            comment: `The daily chat outcome judge came back clean for ${key}.`,
            runId,
            fetchImpl,
          }),
        { label: `chat outcome resolve ${key}` }
      )
    );
  }
  const failed = results.filter(
    r => r && r.ok === false && r.reason !== 'not_found'
  );
  return { ok: failed.length === 0, results, failed };
}

export function summarize(report, plan) {
  const lines = [`Chat outcome judge: ${plan.verdict}`];
  const t = report.totals ?? {};
  lines.push(
    `- ${t.turns ?? 0} turns, ${t.actionTurns ?? 0} action asks, ${t.stalled ?? 0} stalled, ${t.trailingAsks ?? 0} acted-then-asked, ${t.overBudget ?? 0} over length`
  );
  for (const f of plan.upserts) lines.push(`- red ${f.key}: ${f.title}`);
  return lines.join('\n');
}

export async function runChatOutcomeIntake({
  env = process.env,
  fetchImpl,
} = {}) {
  const report = JSON.parse(env.CHAT_OUTCOME_JSON || 'null');
  const plan = planChatOutcomeIntake(report);
  if (plan.verdict === 'unmeasured') {
    throw new Error('Chat outcome judge returned no report; nothing resolved.');
  }
  const result = await applyChatOutcomePlan(plan, report, {
    runId: env.GITHUB_RUN_ID,
    fetchImpl,
  });
  if (result && result.ok === false) {
    throw new Error(
      `Chat outcome intake failed for ${result.failed.length} issue(s)`
    );
  }
  return { plan, summary: summarize(report, plan) };
}

async function main() {
  const { plan, summary } = await runChatOutcomeIntake();
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  }
  console.log(JSON.stringify({ verdict: plan.verdict }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
