#!/usr/bin/env tsx

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  formatQuarantineValidationReport,
  isQuarantineLedgerValid,
  parseQuarantineLedger,
} from '@/lib/testing/quarantine-ledger';

const ledgerPath = resolve(process.cwd(), 'tests/quarantine.json');

function main() {
  const raw = JSON.parse(readFileSync(ledgerPath, 'utf8')) as unknown;
  const parsed = parseQuarantineLedger(raw);

  console.log(formatQuarantineValidationReport(parsed));

  if (!isQuarantineLedgerValid(parsed)) {
    process.exit(1);
  }

  // An expired entry no longer buys extra retries, so it is dead weight that
  // hides an unfixed flake. Fix the test or remove the entry.
  if (parsed.summary.expiredCount > 0) {
    console.error(
      `Quarantine ledger has ${parsed.summary.expiredCount} expired entries; fix the test or remove the entry.`
    );
    process.exit(1);
  }
}

main();
