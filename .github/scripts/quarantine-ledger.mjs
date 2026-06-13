#!/usr/bin/env node
/**
 * CI helper for apps/web/tests/quarantine.json ledger.
 *
 * Usage:
 *   node .github/scripts/quarantine-ledger.mjs validate
 *   node .github/scripts/quarantine-ledger.mjs emit-github-output
 */

import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const LEDGER_PATH = resolve(process.cwd(), 'apps/web/tests/quarantine.json');

const DEFAULT_RETRY_BUDGET = {
  unitDefaultRetries: 1,
  quarantineUnitRetries: 2,
  e2eDefaultRetries: 0,
  quarantineE2eRetries: 2,
  maxRetryAttemptsPerCiRun: 120,
  unitShardCount: 6,
};

function parseLedger(raw) {
  const issues = [];
  if (!raw || typeof raw !== 'object') {
    return {
      issues: [{ path: 'root', message: 'Expected JSON object' }],
      unitPaths: [],
      e2ePaths: [],
      retryBudget: DEFAULT_RETRY_BUDGET,
      summary: null,
    };
  }

  const retryBudget = { ...DEFAULT_RETRY_BUDGET, ...(raw.retryBudget ?? {}) };
  const entries = Array.isArray(raw.entries)
    ? raw.entries
    : [
        ...(raw.unit ?? []).map((path, index) => ({
          id: `legacy-unit-${index}`,
          kind: 'unit',
          path,
          owner: 'platform',
          firstSeenAt: '2026-01-01',
          reproductionCommand: `pnpm --filter @jovie/web exec vitest run ${path}`,
          fixIssueUrl: 'https://linear.app/jovie/issue/JOV-782',
          expiresAt: '2026-12-31',
        })),
        ...(raw.e2e ?? []).map((path, index) => ({
          id: `legacy-e2e-${index}`,
          kind: 'e2e',
          path,
          owner: 'platform',
          firstSeenAt: '2026-01-01',
          reproductionCommand: `cd apps/web && pnpm playwright test ${path.replace(/^apps\/web\//, '')}`,
          fixIssueUrl: 'https://linear.app/jovie/issue/JOV-782',
          expiresAt: '2026-12-31',
        })),
      ];

  const required = [
    'id',
    'kind',
    'path',
    'owner',
    'firstSeenAt',
    'reproductionCommand',
    'fixIssueUrl',
    'expiresAt',
  ];

  const unitPaths = [];
  const e2ePaths = [];

  for (const [index, entry] of entries.entries()) {
    for (const field of required) {
      if (typeof entry?.[field] !== 'string' || entry[field].trim() === '') {
        issues.push({
          path: `entries[${index}].${field}`,
          message: 'Required non-empty string',
        });
      }
    }

    if (entry?.kind === 'unit') {
      unitPaths.push(entry.path);
      if (entry.path?.startsWith('apps/web/')) {
        issues.push({
          path: `entries[${index}].path`,
          message: 'Unit paths must be relative to apps/web',
        });
      }
    } else if (entry?.kind === 'e2e') {
      e2ePaths.push(entry.path);
      if (!entry.path?.startsWith('apps/web/')) {
        issues.push({
          path: `entries[${index}].path`,
          message: 'E2E paths must be repo-root relative',
        });
      }
    } else {
      issues.push({
        path: `entries[${index}].kind`,
        message: 'Expected unit or e2e',
      });
    }
  }

  const estimatedRetryAttemptsPerRun =
    retryBudget.unitShardCount * retryBudget.unitDefaultRetries +
    unitPaths.length * retryBudget.quarantineUnitRetries +
    e2ePaths.length * retryBudget.quarantineE2eRetries;

  if (estimatedRetryAttemptsPerRun > retryBudget.maxRetryAttemptsPerCiRun) {
    issues.push({
      path: 'retryBudget.maxRetryAttemptsPerCiRun',
      message: `Estimated retry attempts (${estimatedRetryAttemptsPerRun}) exceed cap (${retryBudget.maxRetryAttemptsPerCiRun})`,
    });
  }

  return {
    issues,
    unitPaths,
    e2ePaths,
    retryBudget,
    summary: {
      activeCount: entries.length,
      estimatedRetryAttemptsPerRun,
      retryBudgetCap: retryBudget.maxRetryAttemptsPerCiRun,
      withinRetryBudget:
        estimatedRetryAttemptsPerRun <= retryBudget.maxRetryAttemptsPerCiRun,
    },
  };
}

function validate() {
  const raw = JSON.parse(readFileSync(LEDGER_PATH, 'utf8'));
  const parsed = parseLedger(raw);

  if (parsed.issues.length > 0) {
    console.error('Quarantine ledger validation failed:\n');
    for (const issue of parsed.issues) {
      console.error(`- ${issue.path}: ${issue.message}`);
    }
    process.exit(1);
  }

  console.log('Quarantine ledger is valid.');
  console.log(
    `Retry budget: ${parsed.summary.estimatedRetryAttemptsPerRun}/${parsed.summary.retryBudgetCap}`
  );
}

function emitGithubOutput() {
  const raw = JSON.parse(readFileSync(LEDGER_PATH, 'utf8'));
  const parsed = parseLedger(raw);

  if (parsed.issues.length > 0) {
    console.error('Quarantine ledger validation failed:\n');
    for (const issue of parsed.issues) {
      console.error(`- ${issue.path}: ${issue.message}`);
    }
    process.exit(1);
  }

  const unitFiles = parsed.unitPaths.join(' ');
  const unitExcludes = parsed.unitPaths
    .map(path => `--exclude=${path}`)
    .join(' ');
  const e2eFiles = parsed.e2ePaths.join(' ');

  const lines = [
    `unit_files=${unitFiles}`,
    `unit_excludes=${unitExcludes}`,
    `e2e_files=${e2eFiles}`,
    `has_unit=${parsed.unitPaths.length > 0 ? 'true' : 'false'}`,
    `has_quarantine=${parsed.e2ePaths.length > 0 ? 'true' : 'false'}`,
    `quarantined_specs=${e2eFiles}`,
    `unit_default_retries=${parsed.retryBudget.unitDefaultRetries}`,
    `quarantine_unit_retries=${parsed.retryBudget.quarantineUnitRetries}`,
    `quarantine_e2e_retries=${parsed.retryBudget.quarantineE2eRetries}`,
    `retry_budget_usage=${parsed.summary.estimatedRetryAttemptsPerRun}`,
    `retry_budget_cap=${parsed.summary.retryBudgetCap}`,
  ];

  const output = process.env.GITHUB_OUTPUT;
  if (output) {
    appendFileSync(output, `${lines.join('\n')}\n`);
  } else {
    console.log(lines.join('\n'));
  }
}

const command = process.argv[2] ?? 'validate';

if (command === 'validate') {
  validate();
} else if (command === 'emit-github-output') {
  emitGithubOutput();
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}
