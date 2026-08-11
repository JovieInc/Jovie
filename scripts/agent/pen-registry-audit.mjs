#!/usr/bin/env node
import { readFileSync } from 'node:fs';

import {
  auditPenRegistryLedger,
  exitCodeForAudit,
  PEN_REGISTRY_AUDIT_SCHEMA,
  renderLedgerLines,
  validateLedgerExport,
} from './pen-registry-ledger-lib.mjs';

function usage() {
  return (
    `Usage: node scripts/agent/pen-registry-audit.mjs <ledger.json> [--render]\n\n` +
    `Audits a pen-registry-ledger/v1 export of the canonical Pen document.\n` +
    `Exit 0: ledger is singular and contradiction-free. Exit 1: audit failures.\n` +
    `Exit 2: malformed export or invocation. --render prints the mechanically\n` +
    `generated visible ledger rows (only on a passing audit).\n`
  );
}

function parseArgs(argv) {
  const input = { render: false, ledgerPath: null };
  for (let index = 2; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') return { help: true, input };
    if (arg === '--render') {
      input.render = true;
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown argument: ${arg}`);
    } else if (input.ledgerPath === null) {
      input.ledgerPath = arg;
    } else {
      throw new Error(`Unexpected extra argument: ${arg}`);
    }
  }
  if (!input.help && input.ledgerPath === null) {
    throw new Error('A ledger export path is required.');
  }
  return { help: false, input };
}

function main() {
  try {
    const { help, input } = parseArgs(process.argv);
    if (help) {
      process.stdout.write(usage());
      return;
    }
    let ledger;
    try {
      ledger = JSON.parse(readFileSync(input.ledgerPath, 'utf8'));
    } catch (error) {
      throw new Error(
        `Cannot read ledger export ${input.ledgerPath}: ` +
          (error instanceof Error ? error.message : String(error))
      );
    }
    const problems = validateLedgerExport(ledger);
    if (problems.length > 0) {
      process.stdout.write(
        `${JSON.stringify({
          schema: PEN_REGISTRY_AUDIT_SCHEMA,
          verdict: 'error',
          problems,
        })}\n`
      );
      process.exitCode = 2;
      return;
    }
    const receipt = auditPenRegistryLedger(ledger);
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
    if (input.render && receipt.verdict === 'pass') {
      for (const line of renderLedgerLines(ledger)) {
        process.stdout.write(`${line}\n`);
      }
    }
    process.exitCode = exitCodeForAudit(receipt);
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({
        schema: PEN_REGISTRY_AUDIT_SCHEMA,
        verdict: 'error',
        error: error instanceof Error ? error.message : String(error),
      })}\n`
    );
    process.exitCode = 2;
  }
}

main();
