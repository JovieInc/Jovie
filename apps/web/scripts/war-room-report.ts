#!/usr/bin/env tsx
/**
 * Deterministic Default Alive war-room report (JOV-1853 / JOV-1861).
 *
 * Reads the war-room ledger and emits HUD-ready JSON to stdout.
 * No LLM calls and no server-only finance imports in this path.
 * Live Mercury/Stripe reconciliation runs on the /admin/ops server panel.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildWarRoomHudSnapshot,
  parseWarRoomLedger,
} from '@/lib/admin/war-room';

interface CliOptions {
  readonly ledgerPath: string;
  readonly outputPath: string | null;
}

function parseArgs(argv: string[]): CliOptions {
  let ledgerPath = resolve(process.cwd(), 'lib/admin/war-room-ledger.json');
  let outputPath: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--ledger' && argv[index + 1]) {
      ledgerPath = resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === '--out' && argv[index + 1]) {
      outputPath = resolve(argv[index + 1]);
      index += 1;
    }
  }

  return { ledgerPath, outputPath };
}

function loadWarRoomLedgerFromFile(filePath: string) {
  const raw = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
  return parseWarRoomLedger(raw);
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const parsed = loadWarRoomLedgerFromFile(options.ledgerPath);

  if (!parsed.ledger) {
    console.error('War room ledger validation failed:');
    for (const issue of parsed.issues) {
      console.error(`- ${issue.path}: ${issue.message}`);
    }
    process.exit(1);
  }

  const snapshot = buildWarRoomHudSnapshot({
    ledger: parsed.ledger,
    ledgerPath: options.ledgerPath,
    validationIssues: parsed.issues,
  });

  const json = `${JSON.stringify(snapshot, null, 2)}\n`;

  if (options.outputPath) {
    writeFileSync(options.outputPath, json, 'utf8');
  }

  process.stdout.write(json);
}

main();
