#!/usr/bin/env node
/**
 * JOV-13853 data-backed ship gate.
 *   check   — fail if changed paths include .pen blobs
 *   validate — validate a jovie.pen-data-backed-ship/v1 receipt
 *   pilot   — print the docs/guard pilot receipt (no .pen)
 */
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

function usage() {
  console.log(`Usage:
  node scripts/design/pen-data-backed-ship.mjs check [--base origin/main] [--changed-files path]
  node scripts/design/pen-data-backed-ship.mjs validate --receipt path.json
  node scripts/design/pen-data-backed-ship.mjs pilot

Schema: ${PEN_DATA_BACKED_SHIP_SCHEMA}
Docs: docs/design-system/DATA_BACKED_SHIP_PATH.md
`);
}

function arg(argv, name) {
  const cleaned = argv.filter(flag => flag !== '--');
  const i = cleaned.indexOf(`--${name}`);
  return i > -1 && cleaned[i + 1] && !cleaned[i + 1].startsWith('--')
    ? cleaned[i + 1]
    : null;
}

function gitLines(args) {
  const result = spawnSync('git', args, {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')}: ${result.stderr || result.stdout}`);
  }
  return result.stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

function gitChangedFiles(base) {
  const mergeBase = spawnSync('git', ['merge-base', base, 'HEAD'], {
    cwd: REPO,
    encoding: 'utf8',
  });
  const range =
    mergeBase.status === 0 && mergeBase.stdout.trim()
      ? `${mergeBase.stdout.trim()}...HEAD`
      : `${base}...HEAD`;
  // Commits on the branch plus the working tree, so a local pilot proves
  // before push that no .pen blob is staged or untracked.
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
  if (file) {
    return readFileSync(resolve(file), 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
  }
  return gitChangedFiles(arg(argv, 'base') || 'origin/main');
}

export function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === 'help') {
    usage();
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
    const receipt = JSON.parse(readFileSync(resolve(receiptPath), 'utf8'));
    const result = validateDataBackedShipReceipt(receipt);
    console.log(JSON.stringify({ mode: 'validate', ...result }, null, 2));
    return result.ok ? 0 : 1;
  }

  if (command === 'pilot') {
    const receipt = buildPilotShipReceipt();
    const result = validateDataBackedShipReceipt(receipt);
    console.log(
      JSON.stringify({ mode: 'pilot', receipt, validation: result }, null, 2)
    );
    return result.ok ? 0 : 1;
  }

  usage();
  return 2;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  process.exitCode = main();
}
