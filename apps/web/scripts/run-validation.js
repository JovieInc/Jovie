#!/usr/bin/env node
/**
 * Reliability Validation Script
 * Runs test suite multiple times and collects pass/fail statistics
 */

const { execSync } = require('child_process');
const fs = require('fs');

const TOTAL_RUNS = 100;
const results = [];
let startTime = Date.now();

console.log(`\n🔄 Starting reliability validation: ${TOTAL_RUNS} test runs\n`);

for (let i = 1; i <= TOTAL_RUNS; i++) {
  const runStart = Date.now();
  process.stdout.write(`\r📊 Run ${i}/${TOTAL_RUNS}...`);

  try {
    const output = execSync('npm run test:fast 2>&1', {
      encoding: 'utf8',
      timeout: 120000,
      cwd: process.cwd(),
    });

    // Parse test results from output
    const passedMatch = output.match(/(\d+)\s+passed/);
    const failedMatch = output.match(/(\d+)\s+failed/);
    const skippedMatch = output.match(/(\d+)\s+skipped/);
    const durationMatch = output.match(/Duration\s+(\d+\.?\d*)s/);

    const passed = parseInt(passedMatch?.[1] || '0', 10);
    const failed = parseInt(failedMatch?.[1] || '0', 10);
    const skipped = parseInt(skippedMatch?.[1] || '0', 10);
    const duration = parseFloat(durationMatch?.[1] || '0') * 1000;

    results.push({
      run: i,
      passed,
      failed,
      skipped,
      total: passed + failed + skipped,
      passRate: (passed / (passed + failed)) * 100,
      duration,
      status: failed === 0 ? 'success' : 'failure',
    });

    process.stdout.write(
      `\r✅ Run ${i}/${TOTAL_RUNS}: ${passed} passed, ${failed} failed (${duration.toFixed(0)}ms)\n`
    );
  } catch (error) {
    const output = error.stdout || error.stderr || '';
    const passedMatch = output.match(/(\d+)\s+passed/);
    const failedMatch = output.match(/(\d+)\s+failed/);

    const passed = parseInt(passedMatch?.[1] || '0', 10);
    const failed = parseInt(failedMatch?.[1] || '0', 10);

    results.push({
      run: i,
      passed,
      failed,
      skipped: 0,
      total: passed + failed,
      passRate: (passed / (passed + failed || 1)) * 100,
      duration: Date.now() - runStart,
      status: 'failure',
    });

    process.stdout.write(
      `\r❌ Run ${i}/${TOTAL_RUNS}: ${passed} passed, ${failed} failed\n`
    );
  }
}

const totalTime = Date.now() - startTime;
const successfulRuns = results.filter(r => r.status === 'success').length;
const overallPassRate = ((successfulRuns / TOTAL_RUNS) * 100).toFixed(2);
const avgDuration =
  results.reduce((sum, r) => sum + r.duration, 0) / results.length;

// Identify flaky tests (runs that had failures)
const runsWithFailures = results.filter(r => r.failed > 0);
const flakyDetected =
  runsWithFailures.length > 0 && runsWithFailures.length < TOTAL_RUNS;

const validation = {
  timestamp: new Date().toISOString(),
  testSuite: 'fast',
  totalRuns: TOTAL_RUNS,
  successfulRuns,
  failedRuns: TOTAL_RUNS - successfulRuns,
  overallPassRate: parseFloat(overallPassRate),
  meetsTarget: parseFloat(overallPassRate) >= 99,
  targetPassRate: 99,
  averageDuration: Math.round(avgDuration),
  minDuration: Math.min(...results.map(r => r.duration)),
  maxDuration: Math.max(...results.map(r => r.duration)),
  totalValidationTime: totalTime,
  flakinessDetected: flakyDetected,
  averageTestCount: Math.round(
    results.reduce((sum, r) => sum + r.total, 0) / results.length
  ),
  passRates: results.map(r => r.passRate),
  allRuns: results,
};

fs.writeFileSync(
  'validation-results.json',
  JSON.stringify(validation, null, 2)
);

console.log('\n' + '='.repeat(60));
console.log('RELIABILITY VALIDATION SUMMARY');
console.log('='.repeat(60));
console.log(`Total Runs:        ${TOTAL_RUNS}`);
console.log(`Successful Runs:   ${successfulRuns}`);
console.log(`Failed Runs:       ${TOTAL_RUNS - successfulRuns}`);
console.log(`Overall Pass Rate: ${overallPassRate}%`);
console.log(`Target Pass Rate:  99%`);
console.log(
  `Meets Target:      ${parseFloat(overallPassRate) >= 99 ? 'YES' : 'NO'}`
);
console.log(`Avg Duration:      ${(avgDuration / 1000).toFixed(2)}s`);
console.log(`Total Time:        ${(totalTime / 1000 / 60).toFixed(1)} minutes`);
console.log(`Flakiness Found:   ${flakyDetected ? 'YES' : 'NO'}`);
console.log('='.repeat(60));
console.log('\nResults saved to validation-results.json\n');

process.exit(parseFloat(overallPassRate) >= 99 ? 0 : 1);
