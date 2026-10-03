#!/usr/bin/env node
// Replay scoring for the review kernel. A seed file lists historical PR heads:
//   [{ "id": "...", "receipt": "<path to pr-review-receipt.json>",
//      "clean": false, "expected": [{ "path": "apps/...", "line": 42 }] }]
// Receipts are produced by running cli.mjs against each base/head pair.
// --ledger <path> merges each case's outcomes into a model-outcomes/v1
// ledger, which ./rank.mjs reads (PR_REVIEW_OUTCOMES) so model choice follows
// measured cost per successful review.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { emptyLedger, mergeLedger } from './ledger.mjs';

const LINE_TOLERANCE = 15;

function matches(finding, expected) {
  if (finding.location.path !== expected.path) return false;
  if (!Number.isInteger(expected.line)) return true;
  return Math.abs(finding.location.line - expected.line) <= LINE_TOLERANCE;
}

/**
 * Score posted-quality findings (state `verified`) against labelled defects.
 * Precision counts only findings on defective PRs that match a known defect;
 * any verified finding on a clean PR is a false alarm.
 */
export function scoreReplay(cases) {
  let truePositives = 0;
  let falsePositives = 0;
  let expectedTotal = 0;
  let recalled = 0;
  let cleanWithAlarm = 0;
  let cleanTotal = 0;
  let incomplete = 0;
  let usd = 0;
  for (const entry of cases) {
    const { receipt } = entry;
    usd += receipt.spend?.usd ?? 0;
    if (receipt.status !== 'complete') incomplete += 1;
    const posted = receipt.findings.filter(f => f.state === 'verified');
    const expected = entry.expected ?? [];
    if (entry.clean) {
      cleanTotal += 1;
      if (posted.length > 0) cleanWithAlarm += 1;
      falsePositives += posted.length;
      continue;
    }
    expectedTotal += expected.length;
    recalled += expected.filter(e => posted.some(f => matches(f, e))).length;
    for (const finding of posted) {
      if (expected.some(e => matches(finding, e))) truePositives += 1;
      else falsePositives += 1;
    }
  }
  const ratio = (a, b) => (b === 0 ? null : Number((a / b).toFixed(4)));
  return {
    cases: cases.length,
    precision: ratio(truePositives, truePositives + falsePositives),
    recall: ratio(recalled, expectedTotal),
    cleanFalseAlarmRate: ratio(cleanWithAlarm, cleanTotal),
    incompleteRate: ratio(incomplete, cases.length),
    usdTotal: Number(usd.toFixed(4)),
    usdPerReview: ratio(usd, cases.length),
  };
}

/**
 * One outcome per model per completed case. A case succeeds when every
 * labelled defect was found and no verified finding is a false alarm. Stale or
 * incomplete receipts are skipped so provider outages do not count as misses.
 */
export function outcomesFromCases(cases) {
  const outcomes = [];
  for (const entry of cases) {
    const { receipt } = entry;
    if (receipt.status !== 'complete' || !receipt.routing) continue;
    const posted = receipt.findings.filter(f => f.state === 'verified');
    const expected = entry.clean ? [] : (entry.expected ?? []);
    const found = expected.every(e => posted.some(f => matches(f, e)));
    const noFalseAlarm = posted.every(f => expected.some(e => matches(f, e)));
    const success = found && noFalseAlarm;
    const roles = Object.entries(receipt.routing);
    for (const [roleName, role] of roles) {
      const usage = receipt.stats?.usage?.[role.model] ?? {};
      outcomes.push({
        modelId: role.registryId,
        capability: roleName === 'verification' ? 'review-verify' : 'review',
        success,
        tokensIn: usage.inputTokens ?? 0,
        tokensOut: usage.outputTokens ?? 0,
        minutes: (receipt.stats?.minutes ?? 0) / roles.length,
      });
    }
  }
  return outcomes;
}

/** Merge scored cases into a ledger, one entry per case id. */
export function recordOutcomes(ledger, cases, now) {
  const updates = {};
  for (const entry of cases) {
    const outcomes = outcomesFromCases([entry]);
    if (outcomes.length === 0) continue;
    updates[entry.id] = {
      headSha: entry.headSha ?? null,
      clean: Boolean(entry.clean),
      outcomes,
    };
  }
  return mergeLedger(ledger, updates, now);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const seedPath = process.argv[2];
  if (!seedPath) {
    process.stderr.write('usage: replay.mjs <seed.json>\n');
    process.exit(2);
  }
  const seed = JSON.parse(readFileSync(seedPath, 'utf8'));
  const base = resolve(seedPath, '..');
  const cases = seed.map(entry => ({
    ...entry,
    receipt: JSON.parse(readFileSync(resolve(base, entry.receipt), 'utf8')),
  }));
  const score = scoreReplay(cases);
  const ledgerIndex = process.argv.indexOf('--ledger');
  if (ledgerIndex > 0 && process.argv[ledgerIndex + 1]) {
    const ledgerPath = process.argv[ledgerIndex + 1];
    const previous = existsSync(ledgerPath)
      ? JSON.parse(readFileSync(ledgerPath, 'utf8'))
      : emptyLedger();
    const ledger = recordOutcomes(previous, cases);
    writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
    score.ledgerCases = Object.keys(ledger.cases).length;
  }
  process.stdout.write(`${JSON.stringify(score, null, 2)}\n`);
}
