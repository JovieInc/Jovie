#!/usr/bin/env node
// Per-module mutation harness for @jovie/ui (packages/ui): the packages/ui
// counterpart of scripts/mutation-diff.mjs, which only reaches apps/web.
//
//   node scripts/mutation-ui.mjs --files packages/ui/atoms/badge.tsx
//   node scripts/mutation-sweep.mjs --include packages/ui/atoms/ --state ...  # the usual entry
//
// Per module: select the package's own tests that import it (same import-graph
// walk as apps/web, confined to packages/ui), prove they pass and execute at
// least one test, then run apps/web's pinned Stryker from packages/ui with
// stryker.mutation.config.mjs (command runner over packages/ui's vitest). The
// JSON report lands where the sweep reads it:
// packages/ui/reports/mutation/diff/<module>.json. Exits non-zero when
// selection or execution fails, so a broken harness never looks like a score.

import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  createTestSelector,
  readExecutedTests,
  readModuleSource,
  readReportMutants,
  readTestSources,
  scoreMutants,
  selectHighRiskSources,
} from './lib/mutation-diff.mjs';
import { reportName } from './lib/mutation-sweep-root.mjs';

const UI_ROOT = 'packages/ui';
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const uiRoot = join(repoRoot, UI_ROOT);
const stryker = join(repoRoot, 'apps/web/node_modules/.bin/stryker');

const { values } = parseArgs({
  options: {
    files: { type: 'string' },
    'max-tests': { type: 'string', default: '15' },
  },
});
const maxTests = Number(values['max-tests']);
if (!Number.isSafeInteger(maxTests) || maxTests < 1)
  throw new Error('--max-tests must be a positive integer');
const paths = values.files?.split(/[\s,]+/u).filter(Boolean) ?? [];
if (paths.length === 0)
  throw new Error('pass --files packages/ui/<module>.tsx');

const readModule = readModuleSource(uiRoot);
const sources = selectHighRiskSources(paths, readModule, {
  prefixes: null,
  root: UI_ROOT,
});
const failures = [];
if (sources.length === 0)
  failures.push(`no packages/ui runtime source in ${paths.join(' ')}`);
const selectTests = createTestSelector(readTestSources(uiRoot), readModule);

for (const source of sources) {
  try {
    const tests = selectTests(source).slice(0, maxTests);
    if (tests.length === 0) throw new Error('no runtime test import path');
    const reportFile = `reports/mutation/diff/${reportName(source)}`;
    const reportPath = join(uiRoot, reportFile);
    const receipt = `${reportPath}.tests.json`;
    mkdirSync(dirname(reportPath), { recursive: true });
    rmSync(reportPath, { force: true });
    rmSync(receipt, { force: true });
    console.log(`\n▶ ${UI_ROOT}/${source} (${tests.length} test file(s))`);
    const baseline = spawnSync(
      process.execPath,
      [
        './node_modules/vitest/vitest.mjs',
        'run',
        '--config',
        'vitest.config.mts',
        '--bail',
        '1',
        '--passWithNoTests=false',
        '--reporter',
        'json',
        '--outputFile',
        receipt,
        ...tests,
      ],
      { cwd: uiRoot, stdio: 'inherit' }
    );
    if (baseline.status !== 0)
      throw new Error('Vitest baseline process failed');
    readExecutedTests(receipt);
    const run = spawnSync(
      stryker,
      ['run', 'stryker.mutation.config.mjs', '--mutate', source],
      {
        cwd: uiRoot,
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
    const scored = scoreMutants(mutants);
    if (scored.valid === 0)
      throw new Error('Stryker reported zero valid mutants');
    console.log(
      `${UI_ROOT}/${source}: score ${scored.score}% (${scored.detected}/${scored.valid} detected)`
    );
  } catch (error) {
    failures.push(
      `${UI_ROOT}/${source}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
for (const failure of failures) console.error(`mutation-ui: ${failure}`);
process.exitCode = failures.length > 0 ? 1 : 0;
