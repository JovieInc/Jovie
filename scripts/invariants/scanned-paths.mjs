#!/usr/bin/env node
/**
 * Repo paths whose edits can change a `pnpm invariants:check` verdict.
 *
 * CI lane selection imports this list (and the PR structural gate shells out
 * to `--ere`) so a change to any invariant-scanned file always runs the
 * invariants, whatever product lane the change classifies into. The list is
 * composed from the invariants' own exported scan scopes, so it cannot drift
 * from what they actually walk. PR #18182 added a second readFileSync to
 * apps/desktop/src/main.ts; the change classified as mac,web, the structural
 * lane ran without its operations-only invariants:check, and main went red.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { SEED_DONE_INVARIANTS } from './done-sprint-invariants.mjs';
import {
  PUBLIC_SURFACE_ROOTS,
  ESLINT_CONFIG_PATH as SCROLL_JANK_ESLINT_CONFIG_PATH,
} from './ios-web-no-scroll-jank.mjs';
import {
  ALLOWLIST_PATH,
  DESKTOP_ENTRY_POINTS,
  ESLINT_CONFIG_PATH,
  RUNTIME_ROOTS,
} from './latency-sensitive-execution-paths.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** @returns {string[]} */
function latencyAllowlistEntries() {
  const pack = JSON.parse(
    readFileSync(`${REPO_ROOT}${ALLOWLIST_PATH}`, 'utf8')
  );
  return Object.keys(pack.entries ?? {});
}

export const INVARIANT_SCANNED_PATHS = Object.freeze(
  [
    ...new Set([
      // The invariants, their registry, and their ratchet/allowlist data.
      'scripts/invariants',
      'canon/invariants.jsonl',
      // JOV-INV-031 latency-sensitive-execution (thread-blocking).
      ...RUNTIME_ROOTS,
      ...DESKTOP_ENTRY_POINTS,
      ALLOWLIST_PATH,
      ...latencyAllowlistEntries(),
      ESLINT_CONFIG_PATH,
      // JOV-INV-032 ios-web-no-scroll-jank.
      ...PUBLIC_SURFACE_ROOTS,
      SCROLL_JANK_ESLINT_CONFIG_PATH,
      // JOV-INV-033 Done-sprint source locks.
      ...SEED_DONE_INVARIANTS.flatMap(entry => entry.files),
    ]),
  ].sort()
);

/** True when `relPath` is a scanned file or sits under a scanned directory. */
export function isInvariantScannedPath(
  relPath,
  scanned = INVARIANT_SCANNED_PATHS
) {
  const path = String(relPath).replace(/\\/g, '/').replace(/^\.\//, '');
  return scanned.some(root => path === root || path.startsWith(`${root}/`));
}

/** POSIX ERE matching exactly the paths `isInvariantScannedPath` accepts. */
export function invariantScannedPathsEre(scanned = INVARIANT_SCANNED_PATHS) {
  const escaped = scanned.map(root =>
    root.replace(/[.[\](){}*+?^$|\\]/g, '\\$&')
  );
  return `^(${escaped.join('|')})(/|$)`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--ere')) {
    process.stdout.write(`${invariantScannedPathsEre()}\n`);
  } else {
    process.stdout.write(`${INVARIANT_SCANNED_PATHS.join('\n')}\n`);
  }
}
