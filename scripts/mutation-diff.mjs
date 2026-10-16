#!/usr/bin/env node
// Advisory mutation testing on changed high-risk apps/web source.
//
//   node scripts/mutation-diff.mjs --base <sha> --head <sha>
//   node scripts/mutation-diff.mjs --files apps/web/lib/cron/auth.ts
//
// Exits non-zero when selection or execution fails (a broken harness must not
// look like a clean run). Scores below --low are flagged, never enforced.

import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  createTestSelector,
  readExecutedTests,
  readModuleSource,
  readReportMutants,
  readTargetExecution,
  readTestSources,
  renderSummary,
  scoreMutants,
  selectHighRiskSources,
  WEB_ROOT,
} from './lib/mutation-diff.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = join(repoRoot, WEB_ROOT);

const { values } = parseArgs({
  options: {
    base: { type: 'string' },
    head: { type: 'string', default: 'HEAD' },
    files: { type: 'string' },
    'max-files': { type: 'string', default: '6' },
    'max-tests': { type: 'string', default: '15' },
    low: { type: 'string', default: '60' },
    summary: { type: 'string' },
    'list-only': { type: 'boolean', default: false },
  },
});

/** @returns {string[]} */
function changedPaths() {
  if (values.files) return values.files.split(/[\s,]+/u).filter(Boolean);
  if (!values.base) {
    throw new Error('pass --base <sha> (and --head) or --files <paths>');
  }
  const diff = spawnSync(
    'git',
    ['diff', '--name-only', '--diff-filter=AMR', values.base, values.head],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  if (diff.status !== 0) throw new Error(`git diff failed: ${diff.stderr}`);
  return diff.stdout.split('\n').filter(Boolean);
}

/**
 * Prefer tests whose path names the source file or its directory (the
 * dedicated suites), then the rest, up to the cap.
 * @param {string} source
 * @param {string[]} tests
 * @param {number} cap
 */
function capTests(source, tests, cap) {
  const stem = basename(source).replace(/\.(?:ts|tsx)$/u, '');
  const area = basename(dirname(source)).replace(/s$/u, '');
  /** @param {string} test */
  const rank = test =>
    (basename(test).startsWith(stem) ? 0 : 2) - (test.includes(area) ? 1 : 0);
  return [...tests]
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .slice(0, cap);
}

const maxFiles = Number(values['max-files']);
const maxTests = Number(values['max-tests']);
for (const [name, value] of [
  ['max-files', maxFiles],
  ['max-tests', maxTests],
]) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`--${name} must be a positive integer`);
  }
}
const sources = selectHighRiskSources(changedPaths());
const toRun = sources.slice(0, maxFiles);
const skipped = sources.slice(maxFiles);
const selectTests =
  sources.length > 0
    ? createTestSelector(readTestSources(webRoot), readModuleSource(webRoot))
    : () => [];

/** @type {import('./lib/mutation-diff.mjs').FileResult[]} */
const results = [];
/** @type {string[]} */
const untested = [];
/** @type {{ file: string, reason: string }[]} */
const harnessErrors = [];

for (const source of toRun) {
  try {
    const related = selectTests(source);
    if (related.length === 0) {
      untested.push(source);
      continue;
    }
    const tests = capTests(source, related, maxTests);
    if (values['list-only']) {
      console.log(`${source}\n  ${tests.join('\n  ')}`);
      continue;
    }
    const reportFile = `reports/mutation/diff/${source.replace(/[^\w.-]+/gu, '_')}.json`;
    const reportPath = join(webRoot, reportFile);
    const testReceipt = `${reportPath}.tests.json`;
    const coverageDir = `${reportPath}.coverage`;
    mkdirSync(dirname(reportPath), { recursive: true });
    // Never accept a stale successful report from a previous invocation.
    rmSync(reportPath, { force: true });
    rmSync(testReceipt, { force: true });
    rmSync(coverageDir, { recursive: true, force: true });
    console.log(`\n▶ ${source} (${tests.length} test file(s))`);
    const baseline = spawnSync(
      process.execPath,
      [
        './node_modules/vitest/vitest.mjs',
        'run',
        '--config',
        'vitest.config.mutation.mjs',
        '--bail',
        '1',
        '--passWithNoTests=false',
        '--reporter',
        'json',
        '--outputFile',
        testReceipt,
        ...tests,
      ],
      {
        cwd: webRoot,
        stdio: 'inherit',
        env: {
          ...process.env,
          STRYKER_MUTATION_SOURCE: source,
          STRYKER_COVERAGE_DIR: coverageDir,
        },
      }
    );
    if (baseline.status !== 0)
      throw new Error('Vitest baseline process failed');
    const executedTests = readExecutedTests(testReceipt);
    const targetExecution = readTargetExecution(
      join(coverageDir, 'coverage-final.json'),
      join(webRoot, source)
    );
    const run = spawnSync(
      join(webRoot, 'node_modules/.bin/stryker'),
      ['run', 'stryker.diff.config.mjs', '--mutate', source],
      {
        cwd: webRoot,
        stdio: 'inherit',
        env: {
          ...process.env,
          STRYKER_TEST_FILES: tests.join(' '),
          STRYKER_REPORT_FILE: reportFile,
        },
      }
    );
    if (run.status !== 0) throw new Error('Stryker process failed');
    const mutants = readReportMutants(reportPath, source);
    if (!mutants) throw new Error('Stryker did not report the selected source');
    if (mutants.length === 0) throw new Error('Stryker generated zero mutants');
    if (scoreMutants(mutants).valid === 0)
      throw new Error('Stryker reported zero valid mutants');
    results.push({
      file: source,
      tests,
      mutants,
      executedTests,
      targetExecution,
    });
  } catch (error) {
    harnessErrors.push({
      file: source,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

if (!values['list-only']) {
  const summary = renderSummary({
    sources,
    results,
    untested,
    skipped,
    lowScore: Number(values.low),
    errors: harnessErrors,
  });
  console.log(`\n${summary}`);
  if (values.summary) appendFileSync(values.summary, summary);
}

if (values['list-only']) {
  if (sources.length === 0)
    console.log('Skipped: no applicable changed high-risk source files.');
  for (const source of untested)
    console.error(`Selection failed: ${source}: no runtime test import path`);
  for (const error of harnessErrors)
    console.error(`${error.file}: ${error.reason}`);
}
process.exitCode = harnessErrors.length > 0 || untested.length > 0 ? 1 : 0;
