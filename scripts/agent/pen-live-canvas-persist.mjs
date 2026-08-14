#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildPenLiveCanvasPersistReceipt,
  exitCodeForPenLiveCanvasPersist,
  PEN_LIVE_CANVAS_PERSIST_SCHEMA,
} from './pen-live-canvas-persist-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROFILE_PATH = join(HERE, 'pen-workspace-locks.json');

const VALUE_FLAGS = new Map([
  ['--phase', 'phase'],
  ['--profile', 'workspaceProfile'],
  ['--active-path', 'activePath'],
  ['--attach-mode', 'attachMode'],
  ['--writer', 'writer'],
  ['--batch-id', 'batchId'],
  ['--dirty-state', 'dirtyState'],
  ['--out-path', 'outPath'],
  ['--save-method', 'saveMethod'],
  ['--save-argument', 'saveArgument'],
  ['--persist-source', 'persistSource'],
  ['--save-response', 'saveResponse'],
  ['--mtime-before', 'mtimeBefore'],
  ['--mtime-after', 'mtimeAfter'],
  ['--size-before', 'sizeBefore'],
  ['--size-after', 'sizeAfter'],
  ['--recorded-at', 'recordedAt'],
]);

function usage() {
  return (
    `Usage: node scripts/agent/pen-live-canvas-persist.mjs [facts]\n\n` +
    `Attach: --phase attach --profile --active-path --attach-mode desktop\n` +
    `        --writer --batch-id --recorded-at\n` +
    `        Dirty/unsaved is not a bail.\n\n` +
    `Persist: --phase persist plus --save-method save() --save-acknowledged true\n` +
    `         --save-response Saved --mtime-before --mtime-after\n` +
    `         --size-before --size-after\n` +
    `         mtime on the locked canonical path must move.\n` +
    `The expected path is loaded from pen-workspace-locks.json, never caller supplied.\n` +
    `This command never reads, writes, copies, or hashes .pen bytes.\n`
  );
}

function parseBoolean(flag, value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${flag} must be true or false.`);
}

export function parseArgs(argv) {
  const input = {};
  for (let index = 2; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === '--help' || flag === '-h') return { help: true, input };
    const value = argv[++index];
    if (value === undefined) throw new Error(`${flag} requires a value.`);
    if (flag === '--save-acknowledged') {
      input.saveAcknowledged = parseBoolean(flag, value);
    } else if (VALUE_FLAGS.has(flag)) {
      input[VALUE_FLAGS.get(flag)] = value;
    } else {
      throw new Error(`Unknown argument: ${flag}`);
    }
  }
  return { help: false, input };
}

function resolveProfile(profileName) {
  const manifest = JSON.parse(readFileSync(PROFILE_PATH, 'utf8'));
  const profile = manifest.profiles?.[profileName];
  if (!profile) {
    throw new Error(
      `Unknown Pen workspace profile: ${profileName || '<missing>'}`
    );
  }
  return profile.canonical_path.replace(/^\$HOME(?=\/)/, homedir());
}

function main() {
  try {
    const { help, input } = parseArgs(process.argv);
    if (help) {
      process.stdout.write(usage());
      return;
    }
    input.lockedExpectedPath = resolveProfile(input.workspaceProfile);
    const receipt = buildPenLiveCanvasPersistReceipt(input);
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
    process.exitCode = exitCodeForPenLiveCanvasPersist(receipt);
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({
        schema: PEN_LIVE_CANVAS_PERSIST_SCHEMA,
        verdict: 'error',
        durability: 'not_proven',
        error: error instanceof Error ? error.message : String(error),
      })}\n`
    );
    process.exitCode = 2;
  }
}

main();
