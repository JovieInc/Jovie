#!/usr/bin/env node
import { closeSync, openSync, readFileSync, realpathSync } from 'node:fs';

import {
  evaluatePenPromotionClaim,
  exitCodeForPenPromotionClaim,
  PEN_PROMOTION_GATE_SCHEMA,
} from './pen-cold-readback-lib.mjs';

function usage() {
  return (
    `Usage: node scripts/agent/pen-promotion-gate.mjs --save-receipt <path> [--cold-readback-receipt <path>]\n\n` +
    `Evaluates the strongest truthful verification claim a Pen promotion may make.\n` +
    `Exit 0 only for cold_round_trip_verified; live_readback_only and unverified\n` +
    `both exit 1. A promotion may never claim a cold round trip without a\n` +
    `pen-cold-readback/v1 receipt with verdict cold_readback_verified.\n`
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
  const resolved = realpathSync(path);
  if (!/\.json$/i.test(resolved)) {
    throw new Error(`Receipt must be a .json file: ${path}`);
  }
  const descriptor = openSync(path, 'r');
  try {
    return JSON.parse(readFileSync(descriptor, 'utf8'));
  } finally {
    closeSync(descriptor);
  }
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
    const evaluation = evaluatePenPromotionClaim({
      saveReceipt: readReceipt(input.saveReceiptPath),
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
        error: error instanceof Error ? error.message : String(error),
      })}\n`
    );
    process.exitCode = 2;
  }
}

main();
