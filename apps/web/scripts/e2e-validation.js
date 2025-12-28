#!/usr/bin/env node

/**
 * E2E Test Reliability Validation Script
 *
 * Runs E2E tests multiple times and calculates pass rate.
 * Designed for chromium-only testing to match CI behavior.
 *
 * Usage:
 *   node scripts/e2e-validation.js [--runs N] [--project PROJECT] [--grep PATTERN] [--tests PATTERN]
 *
 * Examples:
 *   node scripts/e2e-validation.js --runs 10
 *   node scripts/e2e-validation.js --runs 5 --project chromium
 *   node scripts/e2e-validation.js --runs 10 --grep "@smoke"
 *   node scripts/e2e-validation.js --runs 20 --tests "smoke.spec core-user-journeys.spec"
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const getArg = (name, defaultValue) => {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultValue;
};

const runs = parseInt(getArg('runs', '10'), 10);
const project = getArg('project', 'chromium');
const grep = getArg('grep', '');
const tests = getArg('tests', '');

console.log('='.repeat(60));
console.log('E2E Test Reliability Validation');
console.log('='.repeat(60));
console.log(`Runs: ${runs}`);
console.log(`Project: ${project}`);
if (grep) console.log(`Grep: ${grep}`);
if (tests) console.log(`Tests: ${tests}`);
console.log('');

const results = {
  runs: [],
  startTime: Date.now(),
  totalPassed: 0,
  totalFailed: 0,
  totalSkipped: 0,
  passedRuns: 0,
  failedRuns: 0,
  config: { runs, project, grep, tests },
};

async function runTest(runNumber) {
  return new Promise(resolve => {
    console.log(`\n--- Run ${runNumber}/${runs} ---`);
    const startTime = Date.now();

    const playwrightArgs = [
      'playwright',
      'test',
      `--project=${project}`,
      '--reporter=line',
    ];

    if (grep) {
      playwrightArgs.push('--grep', grep);
    }

    if (tests) {
      // Add test file patterns as positional arguments
      playwrightArgs.push(...tests.split(' '));
    }

    const proc = spawn('npx', playwrightArgs, {
      cwd: process.cwd(),
      env: { ...process.env, CI: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let output = '';

    proc.stdout.on('data', data => {
      output += data.toString();
      process.stdout.write('.');
    });

    proc.stderr.on('data', data => {
      output += data.toString();
    });

    proc.on('close', code => {
      const duration = Date.now() - startTime;

      // Parse results from output
      const passedMatch = output.match(/(\d+) passed/);
      const failedMatch = output.match(/(\d+) failed/);
      const skippedMatch = output.match(/(\d+) skipped/);
      const flakyMatch = output.match(/(\d+) flaky/);

      const passed = passedMatch ? parseInt(passedMatch[1], 10) : 0;
      const failed = failedMatch ? parseInt(failedMatch[1], 10) : 0;
      const skipped = skippedMatch ? parseInt(skippedMatch[1], 10) : 0;
      const flaky = flakyMatch ? parseInt(flakyMatch[1], 10) : 0;

      const runResult = {
        run: runNumber,
        exitCode: code,
        passed,
        failed,
        skipped,
        flaky,
        duration,
        success: code === 0,
      };

      results.runs.push(runResult);
      results.totalPassed += passed;
      results.totalFailed += failed;
      results.totalSkipped += skipped;

      if (code === 0) {
        results.passedRuns++;
        console.log(` PASS (${passed} tests, ${Math.round(duration / 1000)}s)`);
      } else {
        results.failedRuns++;
        console.log(
          ` FAIL (${passed} passed, ${failed} failed, ${Math.round(duration / 1000)}s)`
        );
      }

      resolve(runResult);
    });
  });
}

async function main() {
  for (let i = 1; i <= runs; i++) {
    await runTest(i);
  }

  results.endTime = Date.now();
  results.totalDuration = results.endTime - results.startTime;
  results.passRate = (results.passedRuns / runs) * 100;
  results.avgDuration =
    results.runs.reduce((sum, r) => sum + r.duration, 0) / runs;
  results.avgTests = results.runs.reduce((sum, r) => sum + r.passed, 0) / runs;

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('VALIDATION RESULTS');
  console.log('='.repeat(60));
  console.log(`Total Runs: ${runs}`);
  console.log(`Passed Runs: ${results.passedRuns}`);
  console.log(`Failed Runs: ${results.failedRuns}`);
  console.log(`Pass Rate: ${results.passRate.toFixed(1)}%`);
  console.log(`Avg Tests Per Run: ${results.avgTests.toFixed(0)}`);
  console.log(
    `Avg Duration Per Run: ${Math.round(results.avgDuration / 1000)}s`
  );
  console.log(
    `Total Duration: ${Math.round(results.totalDuration / 60000)} minutes`
  );
  console.log('');
  console.log(`Target: ≥95% pass rate (${Math.ceil(runs * 0.95)} runs)`);
  console.log(`Result: ${results.passRate >= 95 ? '✅ PASSED' : '❌ FAILED'}`);

  // Per-run summary
  console.log('\nPer-Run Details:');
  results.runs.forEach(r => {
    console.log(
      `  Run ${r.run}: ${r.success ? 'PASS' : 'FAIL'} - ${r.passed} passed, ${r.failed} failed (${Math.round(r.duration / 1000)}s)`
    );
  });

  // Flaky test analysis
  const flakyRuns = results.runs.filter(r => r.flaky > 0);
  if (flakyRuns.length > 0) {
    console.log('\nFlaky Test Detection:');
    flakyRuns.forEach(r => {
      console.log(`  Run ${r.run}: ${r.flaky} flaky test(s)`);
    });
  }

  // Save results
  const outputFile = path.join(process.cwd(), 'e2e-validation-results.json');
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${outputFile}`);

  // Exit with appropriate code
  process.exit(results.passRate >= 95 ? 0 : 1);
}

main().catch(err => {
  console.error('Validation failed:', err);
  process.exit(1);
});
