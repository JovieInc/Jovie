#!/usr/bin/env node
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  evaluatePenPromotionClaim,
  exitCodeForPenPromotionClaim,
  PEN_PROMOTION_GATE_SCHEMA,
} from './pen-cold-readback-lib.mjs';

const MAX_RECEIPT_BYTES = 1_000_000;
const HERE = dirname(fileURLToPath(import.meta.url));
const PROFILE_PATH = join(HERE, 'pen-workspace-locks.json');

function usage() {
  return (
    `Usage: node scripts/agent/pen-promotion-gate.mjs --save-receipt <path> [--cold-readback-receipt <path>]\n\n` +
    `Evaluates the strongest truthful verification claim a Pen promotion may make.\n` +
    `Exit 0 only for cold_round_trip_verified; live_readback_only and unverified\n` +
    `both exit 1. The pinned Pen runtime has no safe native cold-manifest\n` +
    `inspector, so pen-cold-readback/v2 preserves live_readback_only.\n`
  );
}

export function parseArgs(argv) {
  const input = {};
  for (let index = 2; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === '--help' || flag === '-h') return { help: true, input };
    const value = argv[++index];
    if (value === undefined) throw new Error(`${flag} requires a value.`);
    if (flag === '--save-receipt') input.saveReceiptPath = value;
    else if (flag === '--cold-readback-receipt')
      input.coldReadbackReceiptPath = value;
    else throw new Error(`Unknown argument: ${flag}`);
  }
  return { help: false, input };
}

function readReceipt(path) {
  if (!/\.json$/i.test(path)) {
    throw new Error(`Receipt must be a .json file: ${path}`);
  }
  const pathStats = lstatSync(path);
  if (pathStats.isSymbolicLink()) {
    throw new Error(`Receipt may not be a symbolic link: ${path}`);
  }
  if (
    !pathStats.isFile() ||
    pathStats.size > MAX_RECEIPT_BYTES ||
    pathStats.nlink !== 1
  ) {
    throw new Error(
      `Receipt must be a single-link regular file no larger than 1 MB: ${path}`
    );
  }
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stats = fstatSync(descriptor);
    if (
      !stats.isFile() ||
      stats.size > MAX_RECEIPT_BYTES ||
      stats.nlink !== 1
    ) {
      throw new Error(
        `Receipt must be a single-link regular file no larger than 1 MB: ${path}`
      );
    }
    if (stats.dev !== pathStats.dev || stats.ino !== pathStats.ino) {
      throw new Error(
        `Receipt path changed while it was being opened: ${path}`
      );
    }
    const buffer = Buffer.allocUnsafe(MAX_RECEIPT_BYTES + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const bytesRead = readSync(
        descriptor,
        buffer,
        offset,
        buffer.length - offset,
        null
      );
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset > MAX_RECEIPT_BYTES) {
      throw new Error(`Receipt must be no larger than 1 MB: ${path}`);
    }
    const content = buffer.subarray(0, offset).toString('utf8');
    if (content.includes('\0')) {
      throw new Error(`Receipt must be text, not binary data: ${path}`);
    }
    return JSON.parse(content);
  } finally {
    closeSync(descriptor);
  }
}

function resolveLockedExpectedPath(profileName) {
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
    if (!input.saveReceiptPath) {
      throw new Error('--save-receipt is required.');
    }
    const saveReceipt = readReceipt(input.saveReceiptPath);
    const evaluation = evaluatePenPromotionClaim({
      saveReceipt,
      lockedExpectedPath: resolveLockedExpectedPath(
        saveReceipt.workspace_profile
      ),
      coldReadbackReceipt: input.coldReadbackReceiptPath
        ? readReceipt(input.coldReadbackReceiptPath)
        : null,
    });
    process.stdout.write(`${JSON.stringify(evaluation)}\n`);
    process.exitCode = exitCodeForPenPromotionClaim(evaluation);
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({
        schema: PEN_PROMOTION_GATE_SCHEMA,
        claim: 'error',
        exit_code: 2,
        error: error instanceof Error ? error.message : String(error),
      })}\n`
    );
    process.exitCode = 2;
  }
}

main();
