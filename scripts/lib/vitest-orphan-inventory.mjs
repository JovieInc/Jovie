/**
 * Inventory of Vitest files that sit outside every Vitest project root.
 *
 * The repo-root `vitest.config.mts` is a project list. It does not collect
 * `tests/` at the repository root, and `apps/web` sets its own root, so a
 * root `*.test.ts` never runs in any lane (JOV-8823). This module fails when
 * a new file lands in that gap.
 *
 * A file is covered when it lives under a directory that contains a
 * `vitest.config.*`, except the repository root itself: that config only
 * points at other projects. `scripts/` is covered by the script-test
 * inventory instead, because its include list is narrower than the directory.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const CONFIG_RE = /^vitest\.config\.(?:mts|ts|mjs|js)$/;
const VITEST_EXT_RE = /\.test\.(?:ts|tsx|mts)$/;
const VITEST_MJS_RE = /\.test\.mjs$/;
const VITEST_IMPORT_RE = /(?:from|require\()\s*['"]vitest['"]/;
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'coverage',
  '.next',
  '.turbo',
  '.git',
  '.stryker-tmp',
]);

/**
 * Trees that are intentionally not Vitest projects. A new prefix needs a
 * reason a reviewer can check.
 * @type {Readonly<Record<string, string>>}
 */
export const NON_VITEST_TREES = Object.freeze({
  '.agents/':
    'Vendored gstack tests run under bun test, not a Jovie Vitest project.',
  '.github/':
    'Workflow script tests use node:test and are named from workflow run steps.',
  '.claude/':
    'Hook contracts use node:test and are part of the scripts CI inventory.',
  'workers/':
    'Worker contracts use node:test, not a Vitest project in this repo.',
  'scripts/':
    'Script Vitest files are gated by scripts/lib/ci-script-test-inventory.mjs.',
});

/**
 * @param {string} repoRoot
 * @returns {string[]} repo-relative directories that own a Vitest config
 */
export function discoverVitestConfigDirs(repoRoot) {
  /** @type {string[]} */
  const dirs = [];
  /** @param {string} dir */
  const walk = dir => {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (CONFIG_RE.test(entry)) {
        const rel = relative(repoRoot, dir).split(sep).join('/');
        dirs.push(rel === '' ? '.' : rel);
      }
    }
  };
  walk(repoRoot);
  return [...new Set(dirs)].sort();
}

/**
 * Directories whose Vitest config actually collects the tests inside them.
 * The repository-root config is projects-only, so it does not.
 * @param {string[]} configDirs
 * @returns {string[]}
 */
export function coveringProjectRoots(configDirs) {
  return configDirs.filter(dir => dir !== '.' && dir !== 'scripts');
}

/**
 * @param {string} repoRoot
 * @param {Readonly<Record<string, string>>} [excluded]
 * @returns {string[]}
 */
export function listVitestCandidates(repoRoot, excluded = NON_VITEST_TREES) {
  /** @type {string[]} */
  const out = [];
  /** @param {string} dir */
  const walk = dir => {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      const vitestFile =
        VITEST_EXT_RE.test(entry) ||
        (VITEST_MJS_RE.test(entry) &&
          VITEST_IMPORT_RE.test(readFileSync(full, 'utf8')));
      if (!vitestFile) continue;
      const rel = relative(repoRoot, full).split(sep).join('/');
      if (Object.keys(excluded).some(prefix => rel.startsWith(prefix)))
        continue;
      out.push(rel);
    }
  };
  walk(repoRoot);
  return out.sort();
}

/**
 * @param {string} file
 * @param {readonly string[]} roots
 */
export function isCoveredByProject(file, roots) {
  return roots.some(root => file === root || file.startsWith(`${root}/`));
}

/**
 * @param {string} repoRoot
 * @param {{ files?: string[], configDirs?: string[] }} [input]
 */
export function inventoryOrphanVitestFiles(repoRoot, input = {}) {
  const configDirs = input.configDirs ?? discoverVitestConfigDirs(repoRoot);
  const roots = coveringProjectRoots(configDirs);
  const files = input.files ?? listVitestCandidates(repoRoot);
  const orphans = files.filter(file => !isCoveredByProject(file, roots));
  return { configDirs, roots, files, orphans };
}
