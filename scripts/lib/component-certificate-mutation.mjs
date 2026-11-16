// Mutation evidence lookup for the component certificate CLI.
//
// The rolling sweep (scripts/mutation-sweep.mjs) keys a run by
// moduleKey(source blob, blobs of same-stem tests), where the same-stem tests
// come from the module's own workspace root: apps/web, or packages/ui when the
// sweep runs with --include packages/ui/... (scripts/lib/mutation-sweep-root.mjs).
// State keys are apps/web-relative for apps/web and repo paths for packages/ui.
// This mirrors both so @jovie/ui components bind to their own sweep evidence,
// and a packages/ui badge.test.tsx never shifts an apps/web Badge's key.
// Node built-ins only: the certificate workflow installs no workspace.

import { execFileSync } from 'node:child_process';

export const MUTATION_ROOTS = Object.freeze(['apps/web', 'packages/ui']);

/** @param {string} path repo-relative */
const rootOf = path => MUTATION_ROOTS.find(root => path.startsWith(`${root}/`));
/** @param {string} path */
const stemOf = path =>
  path
    .split('/')
    .pop()
    .replace(/\.tsx?$/u, '');

/** Sweep-state key for a component path. @param {string} sourceRel */
export const mutationStateKey = sourceRel =>
  sourceRel.replace(/^apps\/web\//u, '');

/**
 * @param {string[]} paths tracked repo-relative paths under MUTATION_ROOTS
 * @param {(path: string) => string | null} read
 */
export function buildMutationInventory(paths, read) {
  /** @type {Map<string, (string | null)[]>} `${root}\0${stem}` -> test texts */
  const tests = new Map();
  for (const path of paths) {
    const root = rootOf(path);
    const match = /([^/]+)\.test\.tsx?$/u.exec(path);
    if (!root || !match) continue;
    const key = `${root}\0${match[1]}`;
    tests.set(key, [...(tests.get(key) ?? []), read(path)]);
  }
  return { tracked: new Set(paths), tests };
}

/**
 * Same-stem test texts from the component's own root, or null when the
 * component is not a tracked module of a swept root (its key is then unknown).
 * @param {ReturnType<typeof buildMutationInventory> | null} inventory
 * @param {string} sourceRel
 */
export function mutationTestsFor(inventory, sourceRel) {
  const root = rootOf(sourceRel);
  if (!inventory || !root || !inventory.tracked.has(sourceRel)) return null;
  return inventory.tests.get(`${root}\0${stemOf(sourceRel)}`) ?? [];
}

/**
 * Inventory from git, or null when git or a read fails (evidence stays
 * unknown rather than binding to a smaller test set with a different key).
 * @param {string} root repo root
 * @param {(path: string) => string | null} read
 */
export function loadMutationInventory(root, read) {
  try {
    const paths = execFileSync(
      'git',
      ['ls-files', '-z', '--', ...MUTATION_ROOTS],
      {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    )
      .split('\0')
      .filter(Boolean);
    return buildMutationInventory(paths, read);
  } catch {
    return null;
  }
}
