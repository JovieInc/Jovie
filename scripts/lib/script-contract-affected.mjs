#!/usr/bin/env node
/**
 * Script contracts (SCRIPT_CONTRACT_NODE_TESTS and SCRIPT_CONTRACT_VITEST_TESTS)
 * run only in ci-fast's structural lane, i.e. merge groups and main pushes.
 * In the 7 days to 2026-10-12 they failed about 37 merge-group runs after a
 * green PR CI: production-environment-secrets (13), the biome rule contracts
 * after a Biome bump (8), deprecation-clearance, backlog and pr-size-guard
 * contracts. This runs the affected ones at PR time.
 *
 * Selection: a diff under scripts/, .github/, the root package.json, the
 * lockfile or biome.json can change any contract's inputs or toolchain, so it
 * runs both full lists. Any other diff runs the contracts whose derived
 * imports or reads it touches (testsAffectedBy). The node and vitest lists run
 * concurrently.
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
} from '../ci-fast-lanes.mjs';
import { testsAffectedBy } from './test-file-dependencies.mjs';

// The CLI runs from the checkout root; Source Validation may load this file
// from a trusted base archive elsewhere on disk.
const REPO_ROOT = process.cwd();
const FULL_RUN_INPUT =
  /^(?:scripts\/|\.github\/|package\.json$|pnpm-lock\.yaml$|biome\.json$)/u;

/**
 * @param {readonly string[] | null} changed null = unreadable diff
 * @param {{ root?: string, node?: readonly string[], vitest?: readonly string[] }} [options]
 * @returns {{ full: boolean, node: string[], vitest: string[] }}
 */
export function selectScriptContracts(changed, options = {}) {
  const root = options.root ?? REPO_ROOT;
  const node = options.node ?? SCRIPT_CONTRACT_NODE_TESTS;
  const vitest = options.vitest ?? SCRIPT_CONTRACT_VITEST_TESTS;
  if (changed === null || changed.some(file => FULL_RUN_INPUT.test(file))) {
    // Partial checkouts (fixtures, sparse archives) run what they contain.
    const present = (/** @type {string} */ test) =>
      existsSync(join(root, test));
    return {
      full: true,
      node: node.filter(present),
      vitest: vitest.filter(present),
    };
  }
  return {
    full: false,
    node: testsAffectedBy(node, changed, root),
    vitest: testsAffectedBy(vitest, changed, root),
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
  const { full, node, vitest } = selectScriptContracts(changed);
  console.log(
    `[script-contracts] ${full ? 'full' : 'affected'}: ${node.length} node, ${vitest.length} vitest`
  );
  if (args.includes('--list')) {
    for (const test of [...node, ...vitest]) console.log(test);
    return 0;
  }
  const runs = [];
  if (node.length > 0) runs.push(run(process.execPath, ['--test', ...node]));
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
        ...vitest.map(test => test.replace(/^scripts\//u, '')),
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
