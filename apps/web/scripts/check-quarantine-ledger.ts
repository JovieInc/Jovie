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
}

main();
