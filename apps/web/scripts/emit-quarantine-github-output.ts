#!/usr/bin/env tsx

import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  isQuarantineLedgerValid,
  parseQuarantineLedger,
} from '@/lib/testing/quarantine-ledger';

const ledgerPath = resolve(process.cwd(), 'tests/quarantine.json');

function main() {
  const raw = JSON.parse(readFileSync(ledgerPath, 'utf8')) as unknown;
  const parsed = parseQuarantineLedger(raw);

  if (!isQuarantineLedgerValid(parsed)) {
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
    `unit_default_retries=${parsed.ledger.retryBudget.unitDefaultRetries}`,
    `quarantine_unit_retries=${parsed.ledger.retryBudget.quarantineUnitRetries}`,
    `quarantine_e2e_retries=${parsed.ledger.retryBudget.quarantineE2eRetries}`,
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

main();
