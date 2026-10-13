#!/usr/bin/env node
// Advisory mutation testing on changed high-risk apps/web source.
//
//   node scripts/mutation-diff.mjs --base <sha> --head <sha>
//   node scripts/mutation-diff.mjs --files apps/web/lib/cron/auth.ts
//
// Exits non-zero only when Stryker itself fails (a broken harness must not
// look like a clean run). Scores below --low are flagged, never enforced.

import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  findRelatedTests,
  readReportMutants,
  readTestSources,
  renderSummary,
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
const sources = selectHighRiskSources(changedPaths());
const toRun = sources.slice(0, maxFiles);
const skipped = sources.slice(maxFiles);
const testSources = readTestSources(webRoot);

/** @type {import('./lib/mutation-diff.mjs').FileResult[]} */
const results = [];
/** @type {string[]} */
const untested = [];
/** @type {string[]} */
const harnessErrors = [];

for (const source of toRun) {
  const related = findRelatedTests(source, testSources);
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
  mkdirSync(join(webRoot, dirname(reportFile)), { recursive: true });
  console.log(`\n▶ ${source} (${tests.length} test file(s))`);
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
  const mutants = readReportMutants(join(webRoot, reportFile), source);
  if (run.status !== 0 || !mutants) {
    harnessErrors.push(source);
    continue;
  }
  results.push({ file: source, tests, mutants });
}

if (!values['list-only']) {
  let summary = renderSummary({
    results,
    untested,
    skipped,
    lowScore: Number(values.low),
  });
  if (harnessErrors.length > 0) {
    summary += `\n### Stryker failed on\n\n${harnessErrors.map(file => `- \`${file}\``).join('\n')}\n`;
  }
  console.log(`\n${summary}`);
  if (values.summary) appendFileSync(values.summary, summary);
}

process.exitCode = harnessErrors.length > 0 ? 1 : 0;
