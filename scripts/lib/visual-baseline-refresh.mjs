#!/usr/bin/env node
// Combined baseline refresh for .github/workflows/visual-regression.yml.
//
// Every visual suite runs as its own matrix entry and uploads one artifact:
// receipt.json (suite, spec, step outcome, whether it staged baselines) plus
// the snapshot files its --update-snapshots run wrote, relative to the spec's
// snapshot directory. The publish job downloads them all, applies the
// baselines of the suites that passed, and opens one PR whose body lists the
// suites that did not pass. A failing suite's snapshots never reach the PR:
// a broken layout must not become the new baseline.
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const SUITE_RECEIPT = 'receipt.json';
export const SUITE_BASELINES = 'baselines';

const SUITE_NAME = /^[a-z0-9][a-z0-9-]*$/;
const SPEC_FILE = /^[a-z0-9][a-z0-9-]*\.spec\.ts$/;
const OUTCOMES = new Set(['success', 'failure', 'cancelled', 'skipped']);

/**
 * @typedef {{ suite: string, spec: string, outcome: string, baselines: boolean, dir: string }} SuiteReceipt
 * @typedef {{ publish: SuiteReceipt[], failing: SuiteReceipt[], passed: SuiteReceipt[], invalid: string[] }} RefreshPlan
 */

/** @param {string} suitesDir @returns {{ receipts: SuiteReceipt[], invalid: string[] }} */
export function readSuiteReceipts(suitesDir) {
  /** @type {SuiteReceipt[]} */
  const receipts = [];
  /** @type {string[]} */
  const invalid = [];
  if (!existsSync(suitesDir)) return { receipts, invalid };
  for (const entry of readdirSync(suitesDir).sort()) {
    const dir = join(suitesDir, entry);
    const file = join(dir, SUITE_RECEIPT);
    if (!lstatSync(dir).isDirectory() || !existsSync(file)) {
      invalid.push(entry);
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      invalid.push(entry);
      continue;
    }
    const valid =
      parsed !== null &&
      typeof parsed === 'object' &&
      SUITE_NAME.test(String(parsed.suite)) &&
      SPEC_FILE.test(String(parsed.spec)) &&
      OUTCOMES.has(String(parsed.outcome)) &&
      typeof parsed.baselines === 'boolean';
    if (!valid) {
      invalid.push(entry);
      continue;
    }
    receipts.push({
      suite: parsed.suite,
      spec: parsed.spec,
      outcome: parsed.outcome,
      baselines: parsed.baselines,
      dir,
    });
  }
  return { receipts, invalid };
}

/** @param {SuiteReceipt[]} receipts @param {string[]} [invalid] @returns {RefreshPlan} */
export function planBaselineRefresh(receipts, invalid = []) {
  const passed = receipts.filter(receipt => receipt.outcome === 'success');
  return {
    passed,
    publish: passed.filter(receipt => receipt.baselines),
    failing: receipts.filter(receipt => receipt.outcome !== 'success'),
    invalid,
  };
}

/** Every regular .png under `root`, as paths relative to it. Symlinks refused. */
function stagedPngs(root) {
  if (!existsSync(root)) return [];
  /** @type {string[]} */
  const files = [];
  const walk = dir => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink())
        throw new Error(`refusing symlinked baseline ${relative(root, path)}`);
      if (stat.isDirectory()) walk(path);
      else if (stat.isFile() && name.endsWith('.png'))
        files.push(relative(root, path));
      else throw new Error(`refusing non-png baseline ${relative(root, path)}`);
    }
  };
  walk(root);
  return files;
}

/**
 * Copy each publishable suite's staged baselines into its own spec directory.
 * Nothing outside `<snapshotDir>/<spec>/` is ever written.
 * @param {RefreshPlan} plan @param {string} snapshotDir @returns {string[]}
 */
export function applyBaselineRefresh(plan, snapshotDir) {
  /** @type {string[]} */
  const written = [];
  for (const receipt of plan.publish) {
    const target = resolve(snapshotDir, receipt.spec);
    for (const file of stagedPngs(join(receipt.dir, SUITE_BASELINES))) {
      const destination = resolve(target, file);
      if (!destination.startsWith(target + sep))
        throw new Error(`baseline escapes ${receipt.spec}: ${file}`);
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(join(receipt.dir, SUITE_BASELINES, file), destination);
      written.push(join(receipt.spec, file));
    }
  }
  return written;
}

/** @param {{ plan: RefreshPlan, sha?: string, runUrl?: string }} input */
export function renderBaselinePrBody({ plan, sha = '', runUrl = '' }) {
  const lines = [
    `Auto-generated scheduled/manual baseline refresh triggered by ${sha.slice(0, 8) || 'unknown'}. Generated on ubuntu-24.04 + Chromium (pinned via pnpm).`,
    '',
  ];
  if (runUrl) lines.push(`Run: ${runUrl}`, '');
  lines.push('Refreshed suites:');
  for (const receipt of plan.publish) lines.push(`- \`${receipt.spec}\``);
  if (plan.publish.length === 0) lines.push('- none');
  if (plan.failing.length > 0 || plan.invalid.length > 0) {
    lines.push(
      '',
      'Suites that did not pass. Their baselines are unchanged in this PR:'
    );
    for (const receipt of plan.failing)
      lines.push(`- \`${receipt.spec}\` (${receipt.outcome})`);
    for (const entry of plan.invalid)
      lines.push(`- \`${entry}\` (no readable suite receipt)`);
  }
  return `${lines.join('\n')}\n`;
}

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {Record<string, string>} */
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined)
      throw new Error(
        `usage: --suites-dir DIR --snapshot-dir DIR --body-file FILE`
      );
    args[key.slice(2)] = value;
  }
  for (const required of ['suites-dir', 'snapshot-dir', 'body-file'])
    if (!args[required]) throw new Error(`missing --${required}`);
  return args;
}

export function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  const { receipts, invalid } = readSuiteReceipts(args['suites-dir']);
  const plan = planBaselineRefresh(receipts, invalid);
  const written = applyBaselineRefresh(plan, args['snapshot-dir']);
  const runUrl =
    env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
      ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
      : '';
  writeFileSync(
    args['body-file'],
    renderBaselinePrBody({ plan, sha: env.GITHUB_SHA, runUrl })
  );
  console.log(
    `Suites passed: ${plan.passed.map(r => r.suite).join(', ') || 'none'}`
  );
  console.log(
    `Suites not passed: ${[...plan.failing.map(r => r.suite), ...invalid].join(', ') || 'none'}`
  );
  console.log(`Baseline files applied: ${written.length}`);
  return { plan, written };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
