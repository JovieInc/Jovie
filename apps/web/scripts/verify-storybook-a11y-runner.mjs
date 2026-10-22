#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { STORYBOOK_VITEST_RUN_TIMEOUT_MS } from '../../../scripts/component-live-storybook-lifecycle.mjs';

/** Diagnostic only: accept the known negative/healthy pattern, not a green CLI. */
export function verifyA11yRunnerControls({ findings, cli, exitCode }) {
  assert.equal(
    exitCode,
    1,
    'raw runner must fail only the explicit-error control'
  );
  assert.equal(findings.records.length, 4, 'all four controls must execute');
  assert.deepEqual(findings.unhandledErrors, [], 'no unrelated runner errors');
  assert.equal(
    findings.reason,
    'failed',
    'control run must finish, not interrupt'
  );
  const control = name => {
    const matches = findings.records.filter(record => record.name === name);
    assert.equal(matches.length, 1, `exactly one ${name} must execute`);
    return matches[0];
  };
  for (const name of ['Default Healthy', 'Error Healthy']) {
    const healthy = control(name);
    assert.equal(healthy.state, 'passed', `${name} must pass`);
    assert.equal(
      healthy.a11y.length,
      1,
      `${name} needs an actual addon report`
    );
    assert.deepEqual(healthy.a11y[0], {
      status: 'passed',
      violations: [],
      incomplete: [],
      error: null,
    });
  }
  const warning = control('Default Violation');
  assert.equal(
    warning.state,
    'passed',
    'existing default mode remains warning-only'
  );
  assert.equal(
    warning.a11y.length,
    1,
    'default violation needs an addon report'
  );
  assert.equal(warning.a11y[0].status, 'warning');
  assert.deepEqual(warning.a11y[0].violations, ['button-name']);
  assert.deepEqual(warning.a11y[0].incomplete, []);
  assert.equal(warning.a11y[0].error, null);
  assert.equal(control('Error Violation').state, 'failed');
  assert.equal(cli.numTotalTests, 4);
  assert.equal(cli.numPassedTests, 3);
  assert.equal(cli.numFailedTests, 1);
  assert.equal(cli.testResults.length, 1, 'exactly the control story module');
  assert.equal(
    cli.testResults[0].message,
    '',
    'no collection or module errors'
  );
  const failed = cli.testResults
    .flatMap(result => result.assertionResults)
    .filter(result => result.status === 'failed');
  assert.equal(failed.length, 1);
  assert.match(failed[0].fullName, /Error Violation$/);
  const failure = stripVTControlCharacters(
    failed[0].failureMessages.join('\n')
  );
  assert.match(failure, /toHaveNoViolations/);
  assert.match(failure, /button-name/);
  // The error assertion can throw before Vitest retains addon metadata.
  return {
    controls: 4,
    rawPassed: 3,
    rawFailed: 1,
    expectedPatternObserved: true,
  };
}

/**
 * @param {string} [outputDirectory]
 * @param {(command: string, args: string[], options: import('node:child_process').SpawnSyncOptionsWithStringEncoding) => {status: number|null, signal: string|null, error?: Error, stdout?: string, stderr?: string}} [spawn]
 */
export function runA11yRunnerControls(outputDirectory, spawn = spawnSync) {
  const output = resolve(outputDirectory || '.cache/storybook-a11y-runner');
  const web = resolve(import.meta.dirname, '..');
  mkdirSync(output, { recursive: true });
  // A setup crash can exit 1 before reporters run. Never accept an older run's
  // valid negative-control receipts from a reused output directory.
  for (const name of ['cli.json', 'findings.json']) {
    rmSync(resolve(output, name), { force: true });
  }
  const started = performance.now();
  const child = spawn(
    'pnpm',
    [
      'exec',
      'vitest',
      'run',
      '--config=vitest.config.storybook.mts',
      '--maxWorkers=1',
      '--retry=0',
      '--reporter=default',
      '--reporter=json',
      `--reporter=${resolve(web, 'tests/fixtures/storybook-a11y-runner/reporter.mjs')}`,
      `--outputFile.json=${resolve(output, 'cli.json')}`,
    ],
    {
      cwd: web,
      encoding: 'utf8',
      timeout: STORYBOOK_VITEST_RUN_TIMEOUT_MS,
      maxBuffer: 8 * 1024 * 1024,
      env: {
        ...process.env,
        STORYBOOK_DISABLE_TELEMETRY: '1',
        JOVIE_STORYBOOK_A11Y_CONTROLS: '1',
        JOVIE_STORYBOOK_A11Y_REPORT: resolve(output, 'findings.json'),
        JOVIE_LIVE_STORYBOOK_CERT: '0',
        JOVIE_STORYBOOK_MANUAL_AXE: '0',
      },
    }
  );
  writeFileSync(
    resolve(output, 'runner.log'),
    `${child.stdout ?? ''}${child.stderr ?? ''}`
  );
  const run = {
    exitCode: child.status,
    signal: child.signal,
    error: child.error?.message ?? null,
    durationMs: performance.now() - started,
  };
  writeFileSync(
    resolve(output, 'run.json'),
    `${JSON.stringify(run, null, 2)}\n`
  );
  assert.equal(
    run.error,
    null,
    'runner must complete without a launch/timeout error'
  );
  const read = name => JSON.parse(readFileSync(resolve(output, name), 'utf8'));
  const result = verifyA11yRunnerControls({
    findings: read('findings.json'),
    cli: read('cli.json'),
    exitCode: child.status,
  });
  return { ...result, durationMs: run.durationMs, output };
}

if (process.argv[1] && import.meta.url === `file://${resolve(process.argv[1])}`)
  console.log(JSON.stringify(runA11yRunnerControls(process.argv[2])));
