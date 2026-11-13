#!/usr/bin/env node
/**
 * Script contracts (SCRIPT_CONTRACT_NODE_TESTS and SCRIPT_CONTRACT_VITEST_TESTS)
 * run only in ci-fast's structural lane, i.e. merge groups and main pushes.
 * In the 7 days to 2026-10-12 they failed about 37 merge-group runs after a
 * green PR CI: production-environment-secrets (13), the biome rule contracts
 * after a Biome bump (8), deprecation-clearance, backlog and pr-size-guard
 * contracts. This runs the affected ones at PR time.
 *
 * Selection: a diff under .github/, or of the root package.json, the lockfile,
 * biome.json, or a non-test JS/TS file under scripts/, can change any
 * contract's inputs or toolchain, so it runs both full lists. That is the
 * 2026-10-12 rule (37 merge-group failures after a green PR). Python, data,
 * and other non-JS paths under scripts/ cannot change those inputs, so they
 * use the derived selector (testsAffectedBy), same as any other diff. The
 * node and vitest lists run concurrently.
 *
 * Usage: node scripts/lib/script-contract-affected.mjs [--list] [changed paths...]
 * With no paths it reads the PR diff via ci-fast-lanes.mjs.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listAllChangedFiles,
  SCRIPT_CONTRACT_NODE_TESTS,
  SCRIPT_CONTRACT_VITEST_TESTS,
  scriptContractNodeArgs,
} from '../ci-fast-lanes.mjs';
import {
  directDependencies,
  testsAffectedBy,
} from './test-file-dependencies.mjs';

// The CLI runs from the checkout root; Source Validation may load this file
// from a trusted base archive elsewhere on disk.
const REPO_ROOT = process.cwd();
// JS/TS under scripts/ stays on the full list. A .py or other non-JS path
// there does not: it cannot change a contract's toolchain or inputs, and
// treating it as one is what made a four-file lane fix run every contract.
const FULL_RUN_INPUT =
  /^(?:\.github\/.+|package\.json|pnpm-lock\.yaml|biome\.json|scripts\/.+\.(?:mjs|cjs|js|ts|mts|tsx))$/u;

// extract.mjs is at the size ceiling, so this predicate lives with the
// selector and must stay aligned with allowed() there. A public marketing
// source, or anything under scripts/copy-inventory/ (ids.gen.json is not a
// FULL_RUN_INPUT), selects the inventory contract without the full lists.
export const COPY_INVENTORY_TEST = 'scripts/copy-inventory/extract.test.mjs';

/** @param {string} file */
export function copyInventoryScanPath(file) {
  if (file.startsWith('scripts/copy-inventory/')) return true;
  if (!/^apps\/web\/.+\.(?:tsx?|jsx?)$/u.test(file)) return false;
  if (/(?:\.test\.|\.stories\.|\.d\.ts$|\.gen\.)/u.test(file)) return false;
  const rel = file.slice('apps/web/'.length);
  if (/^components\/(?:ui|atoms|icons)\//u.test(rel)) return false;
  if (/^data\/(?:marketing|product-truth|designSystem)\//u.test(rel))
    return false;
  if (rel.startsWith('lib/')) {
    if (rel.startsWith('lib/content-records/')) return false;
    return /copy|content|labels/iu.test(rel);
  }
  return /^(?:app|components|data)\//u.test(rel);
}

/**
 * @param {readonly string[]} catalog
 * @param {readonly string[]} selected
 * @param {readonly string[]} changed
 * @returns {string[]}
 */
function unionCopyInventory(catalog, selected, changed) {
  if (
    !catalog.includes(COPY_INVENTORY_TEST) ||
    selected.includes(COPY_INVENTORY_TEST) ||
    !changed.some(copyInventoryScanPath)
  ) {
    return [...selected];
  }
  return [...selected, COPY_INVENTORY_TEST];
}

/**
 * Local pre-push scope: tests that are the changed file, import it directly, or
 * import a script module that imports it (its direct importers). The full
 * transitive closure (testsAffectedBy) stays CI's job; on a hub module like
 * scripts/lib/remote-hint.mjs it selects 33 contracts, this selects 7.
 * @param {readonly string[]} tests @param {readonly string[]} changed @param {string} root
 */
export function testsNearChange(tests, changed, root) {
  const changes = new Set(changed);
  const near = (/** @type {string} */ file) => {
    try {
      return directDependencies(file, root);
    } catch {
      return new Set();
    }
  };
  return tests.filter(test =>
    test.split(' ').some(part => {
      if (changes.has(part)) return true;
      for (const dep of near(part)) {
        if (changes.has(dep)) return true;
        if (/^scripts\/.+\.(?:mjs|cjs|js)$/u.test(dep))
          for (const upstream of near(dep))
            if (changes.has(upstream)) return true;
      }
      return false;
    })
  );
}

/**
 * @param {readonly string[] | null} changed null = unreadable diff
 * @param {{ root?: string, node?: readonly string[], vitest?: readonly string[], derivedOnly?: boolean }} [options]
 * @returns {{ full: boolean, node: string[], vitest: string[] }}
 */
export function selectScriptContracts(changed, options = {}) {
  const root = options.root ?? REPO_ROOT;
  const node = options.node ?? SCRIPT_CONTRACT_NODE_TESTS;
  const vitest = options.vitest ?? SCRIPT_CONTRACT_VITEST_TESTS;
  // derivedOnly is the local pre-push scope: contracts whose files or
  // importers changed. CI never passes it, so CI keeps the full-list rule.
  if (
    !options.derivedOnly &&
    (changed === null || changed.some(file => FULL_RUN_INPUT.test(file)))
  ) {
    // Partial checkouts (fixtures, sparse archives) run what they contain.
    const present = (/** @type {string} */ test) =>
      test.split(' ').every(part => existsSync(join(root, part)));
    return {
      full: true,
      node: node.filter(present),
      vitest: vitest.filter(present),
    };
  }
  const select = options.derivedOnly ? testsNearChange : testsAffectedBy;
  const changedFiles = changed ?? [];
  return {
    full: false,
    node: unionCopyInventory(
      node,
      select(node, changedFiles, root),
      changedFiles
    ),
    vitest: select(vitest, changedFiles, root),
  };
}

/** @param {string} command @param {string[]} args */
function run(command, args) {
  return new Promise(done => {
    const child = spawn(command, args, { cwd: REPO_ROOT, stdio: 'inherit' });
    child.once('error', () => done(1));
    child.once('exit', code => done(code ?? 1));
  });
}

/** @param {string[]} args */
async function main(args) {
  const paths = args.filter(arg => !arg.startsWith('--'));
  const changed = paths.length > 0 ? paths : listAllChangedFiles(REPO_ROOT);
  const derivedOnly = args.includes('--derived-only');
  const { full, node, vitest } = selectScriptContracts(changed, {
    derivedOnly,
  });
  console.log(
    `[script-contracts] ${full ? 'full' : 'affected'}: ${node.length} node, ${vitest.length} vitest${derivedOnly ? ' (local scope; full list deferred to CI)' : ''}`
  );
  if (args.includes('--list')) {
    for (const test of [...node, ...vitest]) console.log(test);
    return 0;
  }
  const runs = [];
  for (const args of scriptContractNodeArgs(node))
    runs.push(run(process.execPath, args));
  if (vitest.length > 0)
    runs.push(
      run('pnpm', [
        'exec',
        'vitest',
        '--root',
        'scripts',
        '--config',
        'vitest.config.mts',
        'run',
        ...vitest.flatMap(test =>
          test.split(' ').map(part => part.replace(/^scripts\//u, ''))
        ),
      ])
    );
  const codes = await Promise.all(runs);
  return codes.find(code => code !== 0) ?? 0;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = await main(process.argv.slice(2));
}
