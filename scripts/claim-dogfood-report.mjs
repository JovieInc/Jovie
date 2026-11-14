#!/usr/bin/env node
// Claim checkout dogfood receipts (.github/workflows/claim-checkout-dogfood.yml).
//
//   stage-events  write jovie-stage-event/v1 rows (entity claim-dogfood) to
//                 $RECEIPT_DIR/stage-events.ndjson so wait/setup/journey
//                 p50/p95 are measurable per run.
//   intake        file or reopen one fingerprinted Linear issue (and post to
//                 Slack) on red; resolve it on green.
//   layout-intake the same for the layout-shift budget (perf class), under
//                 its own fingerprint, so a layout breach never reopens or
//                 resolves the revenue journey's P0.
//   layout-outcome success|failure|unmeasured from the layout spec's exit
//                 status and Playwright JSON report (skipped is unmeasured).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  closeLinearIssueByFingerprint,
  logRemediationDryRun,
  remediationTriggersEnabled,
  upsertLinearIssueByTitleFingerprint,
} from './lib/linear-issue-intake.mjs';
import { parseStageEventFeed } from './lib/stage-events.mjs';

export const CLAIM_DOGFOOD_KEY = 'claim-checkout-dogfood';
export const CLAIM_LAYOUT_BUDGET_KEY = 'claim-checkout-layout-budget';
const ENTITY = 'claim-dogfood';
const SOURCE = 'claim-dogfood-receipts';

const iso = value => {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
};

/** GitHub step outcome → stage-event outcome. */
export function journeyOutcome(stepOutcome) {
  if (stepOutcome === 'success') return 'completed';
  if (stepOutcome === 'failure') return 'failed';
  return 'abandoned';
}

/**
 * Stage rows for one dogfood run. A stage is only emitted when both of its
 * timestamps exist; nothing is invented.
 *   wait     staging deploy finished (or dispatch) -> job started
 *   setup    job started -> server ready (Neon branch, migrate, build)
 *   journey  browser journey start -> finish, outcome = test result
 */
export function buildClaimDogfoodEvents(env) {
  const entityId = `claim-checkout-dogfood#${env.RUN_ID}@${env.RUN_ATTEMPT ?? '1'}`;
  const sourceReceipt = env.RUN_URL || `github-run:${env.RUN_ID}`;
  const actor = env.DOGFOOD_TRIGGER || null;
  const dueAt = iso(env.DOGFOOD_DUE_AT);
  const startedAt = iso(env.JOB_STARTED_AT);
  const journeyStart = iso(env.JOURNEY_STARTED_AT);
  const journeyEnd = iso(env.JOURNEY_FINISHED_AT);
  const base = {
    schema: 'jovie-stage-event/v1',
    entityType: ENTITY,
    entityId,
    actor,
    sourceReceipt,
  };
  const events = [];
  if (dueAt && startedAt && Date.parse(startedAt) >= Date.parse(dueAt)) {
    events.push({
      ...base,
      stage: 'wait',
      enteredAt: dueAt,
      exitedAt: startedAt,
      outcome: 'advanced',
    });
  }
  if (startedAt) {
    events.push({
      ...base,
      stage: 'setup',
      enteredAt: startedAt,
      exitedAt: journeyStart,
      outcome: journeyStart ? 'advanced' : 'failed',
    });
  }
  if (journeyStart) {
    events.push({
      ...base,
      stage: 'journey',
      enteredAt: journeyStart,
      exitedAt: journeyEnd,
      outcome: journeyEnd ? journeyOutcome(env.JOURNEY_OUTCOME) : 'open',
    });
  }
  return events;
}

function writeStageEvents(env = process.env) {
  const manifest = JSON.parse(
    readFileSync(
      new URL('../docs/metrics/stage-manifest.json', import.meta.url),
      'utf8'
    )
  );
  const events = buildClaimDogfoodEvents(env);
  const text = events.map(event => JSON.stringify(event)).join('\n');
  const { rejected } = parseStageEventFeed(text, manifest);
  if (rejected.length) {
    throw new Error(
      `invalid claim-dogfood stage events: ${JSON.stringify(rejected)}`
    );
  }
  const dir = env.RECEIPT_DIR || SOURCE;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'stage-events.ndjson'), text ? `${text}\n` : '');
  console.log(`claim-dogfood: ${events.length} stage events written`);
}

export async function reportClaimDogfoodResult(
  { outcome, runUrl = '', runId = '' },
  {
    env = process.env,
    upsert = upsertLinearIssueByTitleFingerprint,
    close = closeLinearIssueByFingerprint,
    notify = postSlack,
  } = {}
) {
  if (outcome === 'success') {
    if (!remediationTriggersEnabled(env)) {
      return logRemediationDryRun({
        action: 'resolve',
        key: CLAIM_DOGFOOD_KEY,
        fingerprint: CLAIM_DOGFOOD_KEY,
      });
    }
    return close({
      fingerprint: CLAIM_DOGFOOD_KEY,
      labelKey: CLAIM_DOGFOOD_KEY,
      comment: 'Claim checkout dogfood is green.',
      runId,
      apiKey: env.LINEAR_API_KEY,
    });
  }
  const fingerprint = `${CLAIM_DOGFOOD_KEY}:${String(outcome || '').trim() || 'missing'}`;
  await notify(
    env,
    `Claim checkout dogfood is red (${outcome}). Run: ${runUrl}`
  );
  if (!remediationTriggersEnabled(env)) {
    return logRemediationDryRun({
      action: 'upsert',
      key: CLAIM_DOGFOOD_KEY,
      fingerprint,
    });
  }
  return upsert({
    fingerprint,
    labelKey: CLAIM_DOGFOOD_KEY,
    title: `P0: $12 claim checkout dogfood is red (${fingerprint})`,
    description: [
      '## Source',
      '- Workflow: claim-checkout-dogfood.yml (after each staging deploy, and daily via golden-path-nightly.yml)',
      `- Run: ${runUrl}`,
      '',
      '## Why it matters',
      'The browser dogfood of the live $12 artist claim (pricing -> /claim search -> fixture artist -> Stripe test checkout -> webhook -> Pro, plus the high-reach pending_verification -> Ovie card -> reject/refund -> approve branch) failed. Buyers may be hitting the same break.',
      '',
      '## Repro',
      'See docs in apps/web/tests/e2e/claim-checkout.spec.ts and ~/conductor/ops-wt/handoff/checkout-dogfood.md: run the spec with Stripe test keys against a local server with E2E_USE_TEST_AUTH_BYPASS=1.',
      '',
      `Fingerprint: ${fingerprint}`,
    ].join('\n'),
    priority: 1,
    createStateName: 'Todo',
    reopenTerminal: true,
    apiKey: env.LINEAR_API_KEY,
  });
}

/**
 * Layout step verdict from Playwright's exit status and its JSON report.
 * Green only when every layout test ran and passed: getStripeContextOrSkip
 * skips the tests when Stripe test prerequisites are unavailable and
 * Playwright still exits 0, so a skipped or empty run is `unmeasured`.
 */
export function layoutBudgetOutcome(status, report) {
  if (Number(status) !== 0) return 'failure';
  const count = key => Number(report?.stats?.[key] ?? 0) || 0;
  const ran = count('expected') + count('flaky');
  return ran > 0 && count('skipped') === 0 && count('unexpected') === 0
    ? 'success'
    : 'unmeasured';
}

function readLayoutReport(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Layout-shift budget (perf class) for /claim and /billing/success. Its own
 * fingerprinted issue: green resolves it, a breach files or reopens it, and
 * an unmeasured run (tests skipped) leaves it as it is; the layout-budget
 * check is red for that run.
 */
export async function reportClaimLayoutBudgetResult(
  { outcome, runUrl = '', runId = '' },
  {
    env = process.env,
    upsert = upsertLinearIssueByTitleFingerprint,
    close = closeLinearIssueByFingerprint,
    notify = postSlack,
  } = {}
) {
  const key = CLAIM_LAYOUT_BUDGET_KEY;
  if (outcome !== 'success' && outcome !== 'failure') {
    console.log(
      `claim-dogfood: layout budget ${outcome || 'missing'}; ${key} left as it is`
    );
    return { ok: true, action: 'unmeasured', key };
  }
  const enabled = remediationTriggersEnabled(env);
  if (outcome === 'success') {
    if (!enabled) {
      return logRemediationDryRun({ action: 'resolve', key, fingerprint: key });
    }
    return close({
      fingerprint: key,
      labelKey: key,
      comment: 'Claim checkout layout-shift budget is green.',
      runId,
      apiKey: env.LINEAR_API_KEY,
    });
  }
  await notify(
    env,
    `Claim checkout layout-shift budget is breached (perf; checkout itself is reported separately). Run: ${runUrl}`
  );
  if (!enabled) {
    return logRemediationDryRun({ action: 'upsert', key, fingerprint: key });
  }
  return upsert({
    fingerprint: key,
    labelKey: key,
    title: `Perf: claim checkout layout-shift budget breached (${key})`,
    description: [
      '## Source',
      '- Workflow: claim-checkout-dogfood.yml, check "Claim checkout layout budget (perf)"',
      `- Run: ${runUrl}`,
      '',
      '## Why it matters',
      'Cumulative layout shift on /claim or /billing/success reached the 0.1 Web Vitals ceiling. A paying artist sees the screen jump. The functional checkout is a separate check and is not implied broken.',
      '',
      '## Repro',
      'Run apps/web/tests/e2e/claim-checkout-layout.perf.spec.ts with Stripe test keys against a local server with E2E_USE_TEST_AUTH_BYPASS=1.',
      '',
      `Fingerprint: ${key}`,
    ].join('\n'),
    priority: 3,
    createStateName: 'Todo',
    reopenTerminal: true,
    apiKey: env.LINEAR_API_KEY,
  });
}

async function postSlack(env, text) {
  if (!env.SLACK_WEBHOOK_URL) return;
  try {
    await fetch(env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    console.warn(
      `claim-dogfood: Slack alert failed: ${error?.message ?? error}`
    );
  }
}

/**
 * `layout-intake`: a Linear or Slack failure is a warning, never a failure of
 * the dogfood job, so the revenue journey and the perf class never share one
 * red. The layout-budget check carries the perf verdict on its own.
 */
export async function layoutIntakeCommand(
  env = process.env,
  report = reportClaimLayoutBudgetResult
) {
  const outcome = await report({
    outcome: env.LAYOUT_OUTCOME,
    runUrl: env.RUN_URL,
    runId: env.RUN_ID,
  });
  console.log(JSON.stringify(outcome));
  if (outcome && outcome.ok === false) {
    console.log(
      `::warning::Claim layout Linear intake failed: ${outcome.reason}`
    );
  }
  return outcome;
}

async function main(command) {
  if (command === 'stage-events') return writeStageEvents();
  if (command === 'intake') {
    const outcome = await reportClaimDogfoodResult({
      outcome: process.env.JOURNEY_OUTCOME,
      runUrl: process.env.RUN_URL,
      runId: process.env.RUN_ID,
    });
    console.log(JSON.stringify(outcome));
    if (outcome && outcome.ok === false) {
      throw new Error(`Claim dogfood Linear intake failed: ${outcome.reason}`);
    }
    return;
  }
  if (command === 'layout-intake') {
    await layoutIntakeCommand();
    return;
  }
  if (command === 'layout-outcome') {
    // layout-outcome <playwright exit status> <playwright JSON report>
    console.log(
      layoutBudgetOutcome(process.argv[3], readLayoutReport(process.argv[4]))
    );
    return;
  }
  throw new Error(
    `usage: claim-dogfood-report.mjs stage-events|intake|layout-intake|layout-outcome (got ${command})`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main(process.argv[2]);
}
