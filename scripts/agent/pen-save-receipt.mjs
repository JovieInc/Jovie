#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildPenSaveReceipt,
  exitCodeForPenSaveReceipt,
  isProtectedPenEvidencePath,
  matchesProtectedFileIdentity,
  PEN_SAVE_RECEIPT_SCHEMA,
} from './pen-save-receipt-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROFILE_PATH = join(HERE, 'pen-workspace-locks.json');

const VALUE_FLAGS = new Map([
  ['--profile', 'workspaceProfile'],
  ['--active-path-before', 'activePathBefore'],
  ['--active-path-after', 'activePathAfter'],
  ['--document-title', 'documentTitle'],
  ['--writer', 'writer'],
  ['--batch-id', 'batchId'],
  ['--batch-started-at', 'batchStartedAt'],
  ['--mutation-state', 'mutationState'],
  ['--save-method', 'saveMethod'],
  ['--save-requested-at', 'saveRequestedAt'],
  ['--save-acknowledged-at', 'saveAcknowledgedAt'],
  ['--dirty-state', 'dirtyState'],
  ['--post-readback-at', 'postReadbackAt'],
  ['--backup-path', 'backupPath'],
  ['--recorded-at', 'recordedAt'],
]);

const EVIDENCE_FLAGS = new Map([
  ['--pre-app-state-evidence', 'preAppState'],
  ['--post-app-state-evidence', 'postAppState'],
  ['--window-state-evidence', 'windowState'],
  ['--save-response-evidence', 'saveResponse'],
  ['--readback-evidence', 'readback'],
]);

const BOOLEAN_FLAGS = new Map([
  ['--save-acknowledged', 'saveAcknowledged'],
  ['--readback-verified', 'readbackVerified'],
]);

function usage() {
  return `Usage: node scripts/agent/pen-save-receipt.mjs [facts]\n\n` +
    `Required: --profile, active paths, title, writer, batch/timestamps, roots,\n` +
    `explicit save/clean/readback facts, and five evidence-file flags.\n` +
    `The expected path is loaded from pen-workspace-locks.json, never caller supplied.\n`;
}

function parseBoolean(flag, value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${flag} must be true or false.`);
}

export function parseArgs(argv) {
  const input = { rootIds: [], evidencePaths: {} };
  for (let index = 2; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === '--help' || flag === '-h') return { help: true, input };
    const value = argv[++index];
    if (value === undefined) throw new Error(`${flag} requires a value.`);
    if (flag === '--root-id') {
      input.rootIds.push(value);
    } else if (VALUE_FLAGS.has(flag)) {
      input[VALUE_FLAGS.get(flag)] = value;
    } else if (EVIDENCE_FLAGS.has(flag)) {
      input.evidencePaths[EVIDENCE_FLAGS.get(flag)] = value;
    } else if (BOOLEAN_FLAGS.has(flag)) {
      input[BOOLEAN_FLAGS.get(flag)] = parseBoolean(flag, value);
    } else {
      throw new Error(`Unknown argument: ${flag}`);
    }
  }
  return { help: false, input };
}

function resolveProfile(profileName) {
  const manifest = JSON.parse(readFileSync(PROFILE_PATH, 'utf8'));
  const profile = manifest.profiles?.[profileName];
  if (!profile) throw new Error(`Unknown Pen workspace profile: ${profileName || '<missing>'}`);
  const expandHome = path => path.replace(/^\$HOME(?=\/)/, homedir());
  const canonicalPath = expandHome(profile.canonical_path);
  return {
    canonicalPath,
    protectedPaths: [
      canonicalPath,
      ...(profile.read_only_paths ?? []).map(expandHome),
    ],
  };
}

function protectedFileIdentities(protectedPaths) {
  return protectedPaths.flatMap(path => {
    try {
      const stats = statSync(path);
      return [{ dev: stats.dev, ino: stats.ino }];
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
  });
}

function loadEvidence(paths, protectedPaths) {
  const protectedIdentities = protectedFileIdentities(protectedPaths);
  return Object.fromEntries(
    Object.entries(paths).map(([key, path]) => {
      const resolvedPath = realpathSync(path);
      if (isProtectedPenEvidencePath(path, resolvedPath, protectedPaths)) {
        throw new Error(`Evidence path is a protected Pen document: ${path}`);
      }
      if (lstatSync(path).isSymbolicLink()) {
        throw new Error(`Evidence may not be a symbolic link: ${path}`);
      }
      if (!/\.(?:json|jsonl|log|txt)$/i.test(resolvedPath)) {
        throw new Error(`Evidence must use a .json, .jsonl, .log, or .txt extension: ${path}`);
      }
      const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const stats = fstatSync(descriptor);
        if (!stats.isFile() || stats.size > 1_000_000 || stats.nlink !== 1) {
          throw new Error(
            `Evidence must be a single-link regular file no larger than 1 MB: ${path}`
          );
        }
        if (matchesProtectedFileIdentity(stats, protectedIdentities)) {
          throw new Error(`Evidence aliases a protected Pen document: ${path}`);
        }
        const content = readFileSync(descriptor, 'utf8');
        if (content.includes('\0')) {
          throw new Error(`Evidence must be text, not binary data: ${path}`);
        }
        return [
          key,
          {
            content,
            sha256: createHash('sha256').update(content).digest('hex'),
          },
        ];
      } finally {
        closeSync(descriptor);
      }
    })
  );
}

function main() {
  try {
    const { help, input } = parseArgs(process.argv);
    if (help) {
      process.stdout.write(usage());
      return;
    }
    const profile = resolveProfile(input.workspaceProfile);
    input.lockedExpectedPath = profile.canonicalPath;
    input.evidence = loadEvidence(input.evidencePaths, profile.protectedPaths);
    const receipt = buildPenSaveReceipt(input);
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
    process.exitCode = exitCodeForPenSaveReceipt(receipt);
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({
        schema: PEN_SAVE_RECEIPT_SCHEMA,
        verdict: 'error',
        durability: 'not_proven',
        error: error instanceof Error ? error.message : String(error),
      })}\n`
    );
    process.exitCode = 2;
  }
}

main();
