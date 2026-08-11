#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildPenColdReadbackReceipt,
  exitCodeForPenColdReadback,
  PEN_COLD_READBACK_SCHEMA,
} from './pen-cold-readback-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROFILE_PATH = join(HERE, 'pen-workspace-locks.json');

function usage() {
  return (
    `Usage: node scripts/agent/pen-cold-readback.mjs --profile <name> [options]\n\n` +
    `Options: --recorded-at <iso>.\n` +
    `Resolves the profile's pinned canonical path as a string, reports that no\n` +
    `safe native cold-manifest inspector exists, and exits 1. It never launches\n` +
    `Pen and never opens, reads, hashes, creates, or writes a .pen document.\n`
  );
}

export function parseArgs(argv) {
  const input = {};
  const prohibitedFlags = new Set([
    '--fixture',
    '--pen-bin',
    '--manifest',
    '--timeout-ms',
    '--expect-component',
    '--desktop-title',
    '--desktop-dirty-state',
    '--no-probe',
  ]);
  for (let index = 2; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === '--help' || flag === '-h') return { help: true, input };
    if (prohibitedFlags.has(flag)) {
      throw new Error(
        `${flag} is prohibited: cold-manifest unavailability must be reported without Pen or .pen access.`
      );
    }
    const value = argv[++index];
    if (value === undefined) throw new Error(`${flag} requires a value.`);
    if (flag === '--profile') input.workspaceProfile = value;
    else if (flag === '--recorded-at') {
      if (!Number.isFinite(Date.parse(value))) {
        throw new Error('--recorded-at must be a valid timestamp.');
      }
      input.recordedAt = value;
    } else {
      throw new Error(
        `${flag} is prohibited: cold-manifest unavailability must be reported without Pen or .pen access.`
      );
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
    if (!input.workspaceProfile) {
      throw new Error('--profile is required.');
    }

    const receipt = buildPenColdReadbackReceipt({
      workspaceProfile: input.workspaceProfile,
      targetPath: resolveProfile(input.workspaceProfile),
      recordedAt: input.recordedAt ?? new Date().toISOString(),
      executeInvoked: false,
      saveInvoked: false,
      documentOpened: false,
      outputDocumentCreated: false,
    });
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
    process.exitCode = exitCodeForPenColdReadback(receipt);
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({
        schema: PEN_COLD_READBACK_SCHEMA,
        verdict: 'error',
        durability: 'not_proven',
        exit_code: 2,
        error: error instanceof Error ? error.message : String(error),
      })}\n`
    );
    process.exitCode = 2;
  }
}

main();
