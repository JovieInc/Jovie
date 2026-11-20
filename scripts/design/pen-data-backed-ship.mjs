#!/usr/bin/env node
/** JOV-13853: check | validate | pilot — no .pen through the merge queue. */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  buildPilotShipReceipt,
  checkChangedPathsForPenBlobs,
  PEN_DATA_BACKED_SHIP_SCHEMA,
  validateDataBackedShipReceipt,
} from './pen-data-backed-ship-lib.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function arg(argv, name) {
  const a = argv.filter(f => f !== '--');
  const i = a.indexOf(`--${name}`);
  return i > -1 && a[i + 1] && !a[i + 1].startsWith('--') ? a[i + 1] : null;
}

function gitLines(args) {
  const r = spawnSync('git', args, {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr || r.stdout}`);
  return r.stdout.split('\n').map(l => l.trim()).filter(Boolean);
}

function gitChangedFiles(base) {
  const mb = spawnSync('git', ['merge-base', base, 'HEAD'], {
    cwd: REPO,
    encoding: 'utf8',
  });
  const range =
    mb.status === 0 && mb.stdout.trim()
      ? `${mb.stdout.trim()}...HEAD`
      : `${base}...HEAD`;
  return [
    ...new Set([
      ...gitLines(['diff', '--name-only', '--diff-filter=ACMR', range]),
      ...gitLines(['diff', '--name-only', '--diff-filter=ACMR']),
      ...gitLines(['diff', '--name-only', '--cached', '--diff-filter=ACMR']),
      ...gitLines(['ls-files', '--others', '--exclude-standard']),
    ]),
  ].sort();
}

function loadChangedFiles(argv) {
  const file = arg(argv, 'changed-files');
  if (file)
    return readFileSync(resolve(file), 'utf8')
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);
  return gitChangedFiles(arg(argv, 'base') || 'origin/main');
}

export function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === 'help') {
    console.log(`Usage:
  node scripts/design/pen-data-backed-ship.mjs check [--base origin/main] [--changed-files path]
  node scripts/design/pen-data-backed-ship.mjs validate --receipt path.json
  node scripts/design/pen-data-backed-ship.mjs pilot
Schema: ${PEN_DATA_BACKED_SHIP_SCHEMA}
Docs: docs/design-system/DATA_BACKED_SHIP_PATH.md`);
    return 0;
  }
  if (command === 'check') {
    const paths = loadChangedFiles(rest);
    const result = checkChangedPathsForPenBlobs(paths);
    console.log(
      JSON.stringify(
        {
          schema: PEN_DATA_BACKED_SHIP_SCHEMA,
          mode: 'check',
          ok: result.ok,
          changedCount: paths.length,
          penBlobs: result.penBlobs,
          blockers: result.blockers,
        },
        null,
        2
      )
    );
    return result.ok ? 0 : 1;
  }
  if (command === 'validate') {
    const receiptPath = arg(rest, 'receipt');
    if (!receiptPath) {
      console.error('validate requires --receipt <path.json>');
      return 2;
    }
    const result = validateDataBackedShipReceipt(
      JSON.parse(readFileSync(resolve(receiptPath), 'utf8'))
    );
    console.log(JSON.stringify({ mode: 'validate', ...result }, null, 2));
    return result.ok ? 0 : 1;
  }
  if (command === 'pilot') {
    const receipt = buildPilotShipReceipt();
    const validation = validateDataBackedShipReceipt(receipt);
    console.log(JSON.stringify({ mode: 'pilot', receipt, validation }, null, 2));
    return validation.ok ? 0 : 1;
  }
  return 2;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  process.exitCode = main();
}
