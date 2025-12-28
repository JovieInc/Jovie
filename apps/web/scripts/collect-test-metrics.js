#!/usr/bin/env node
/**
 * Test Metrics Collection Script
 *
 * Parses test output and calculates comprehensive metrics including:
 * - Duration and timing statistics
 * - Pass/fail rates
 * - Flakiness detection from multiple runs
 * - Slow test identification
 *
 * Output is JSON formatted for CI dashboard integration.
 *
 * Usage:
 *   node collect-test-metrics.js [options] [output-file]
 *
 * Options:
 *   --help, -h        Show this help message
 *   --stdin           Read test output from stdin
 *   --run             Run tests and collect metrics (default if no stdin)
 *   --runs <n>        Number of test runs for flakiness detection (default: 1)
 *   --format <type>   Output format: json, summary (default: json)
 *   --quiet, -q       Suppress console output (only write to file)
 *   --threshold <n>   Slow test threshold in ms (default: 200)
 *
 * Examples:
 *   node collect-test-metrics.js metrics.json
 *   node collect-test-metrics.js --runs 5 --format summary
 *   cat test-output.txt | node collect-test-metrics.js --stdin metrics.json
 *   npm test 2>&1 | node collect-test-metrics.js --stdin
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

/**
 * @typedef {Object} TestResult
 * @property {string} name - Test name
 * @property {'passed' | 'failed' | 'skipped'} status - Test status
 * @property {number} duration - Duration in milliseconds
 * @property {string} [suite] - Test suite/file name
 * @property {string} [error] - Error message if failed
 */

/**
 * @typedef {Object} TestMetrics
 * @property {string} timestamp - ISO timestamp
 * @property {number} totalTests - Total number of tests
 * @property {number} passedTests - Number of passed tests
 * @property {number} failedTests - Number of failed tests
 * @property {number} skippedTests - Number of skipped tests
 * @property {number} passRate - Pass rate as percentage
 * @property {number} totalDuration - Total duration in ms
 * @property {number} averageDuration - Average test duration in ms
 * @property {Object} timing - Timing breakdown
 * @property {Array<Object>} slowTests - Tests exceeding threshold
 * @property {Array<Object>} failedTestDetails - Details of failed tests
 * @property {Object} [flakinessReport] - Flakiness report if multiple runs
 */

/**
 * Parse command line arguments
 * @returns {Object} Parsed arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    help: false,
    stdin: false,
    run: true,
    runs: 1,
    format: 'json',
    quiet: false,
    threshold: 200,
    outputFile: null,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--stdin':
        options.stdin = true;
        options.run = false;
        break;
      case '--run':
        options.run = true;
        break;
      case '--runs':
        options.runs = parseInt(args[++i], 10) || 1;
        break;
      case '--format':
        options.format = args[++i] || 'json';
        break;
      case '--quiet':
      case '-q':
        options.quiet = true;
        break;
      case '--threshold':
        options.threshold = parseInt(args[++i], 10) || 200;
        break;
      default:
        if (!arg.startsWith('-')) {
          options.outputFile = arg;
        }
        break;
    }
  }

  return options;
}

/**
 * Display help message
 */
function showHelp() {
  const helpText = `
${colors.bold}Test Metrics Collection Script${colors.reset}

Parses test output and calculates comprehensive metrics for CI dashboard integration.

${colors.cyan}USAGE:${colors.reset}
  node collect-test-metrics.js [options] [output-file]

${colors.cyan}OPTIONS:${colors.reset}
  --help, -h        Show this help message
  --stdin           Read test output from stdin
  --run             Run tests and collect metrics (default if no stdin)
  --runs <n>        Number of test runs for flakiness detection (default: 1)
  --format <type>   Output format: json, summary (default: json)
  --quiet, -q       Suppress console output (only write to file)
  --threshold <n>   Slow test threshold in ms (default: 200)

${colors.cyan}EXAMPLES:${colors.reset}
  ${colors.green}# Run tests and save metrics to file${colors.reset}
  node collect-test-metrics.js metrics.json

  ${colors.green}# Run tests 5 times for flakiness detection${colors.reset}
  node collect-test-metrics.js --runs 5 validation-results.json

  ${colors.green}# Parse existing test output from stdin${colors.reset}
  cat test-output.txt | node collect-test-metrics.js --stdin metrics.json

  ${colors.green}# Pipe test output directly${colors.reset}
  npm test 2>&1 | node collect-test-metrics.js --stdin

  ${colors.green}# Show summary instead of JSON${colors.reset}
  node collect-test-metrics.js --format summary

${colors.cyan}OUTPUT:${colors.reset}
  JSON format includes:
  - timestamp: When metrics were collected
  - totalTests, passedTests, failedTests, skippedTests: Test counts
  - passRate: Pass rate as percentage
  - totalDuration, averageDuration: Timing metrics
  - timing: Breakdown of setup, test execution, environment time
  - slowTests: Tests exceeding the threshold (default 200ms)
  - failedTestDetails: Details of each failed test
  - flakinessReport: Flakiness analysis (when --runs > 1)

${colors.cyan}EXIT CODES:${colors.reset}
  0 - Success (all metrics collected)
  1 - Failure (tests failed or error occurred)
`;
  console.log(helpText);
}

/**
 * Parse Vitest output to extract test results
 * @param {string} output - Raw test output
 * @param {number} threshold - Slow test threshold in ms
 * @returns {TestMetrics}
 */
function parseTestOutput(output, threshold = 200) {
  const results = {
    tests: [],
    totalDuration: 0,
    setupTime: 0,
    testExecutionTime: 0,
    environmentTime: 0,
    transformTime: 0,
    collectTime: 0,
  };

  // Extract overall timing from Vitest output
  const durationMatch = output.match(/Duration\s+(\d+\.?\d*)s/);
  if (durationMatch) {
    results.totalDuration = parseFloat(durationMatch[1]) * 1000;
  }

  const setupMatch = output.match(/setup\s+(\d+\.?\d*)s/);
  if (setupMatch) {
    results.setupTime = parseFloat(setupMatch[1]) * 1000;
  }

  const testsMatch = output.match(/tests\s+(\d+\.?\d*)s/);
  if (testsMatch) {
    results.testExecutionTime = parseFloat(testsMatch[1]) * 1000;
  }

  const environmentMatch = output.match(/environment\s+(\d+\.?\d*)s/);
  if (environmentMatch) {
    results.environmentTime = parseFloat(environmentMatch[1]) * 1000;
  }

  const transformMatch = output.match(/transform\s+(\d+\.?\d*)s/);
  if (transformMatch) {
    results.transformTime = parseFloat(transformMatch[1]) * 1000;
  }

  const collectMatch = output.match(/collect\s+(\d+\.?\d*)s/);
  if (collectMatch) {
    results.collectTime = parseFloat(collectMatch[1]) * 1000;
  }

  // Parse test file results (suite level)
  const suiteRegex = /(?:✓|PASS)\s+(.+?)\s+\((\d+)\s*tests?\)\s+(\d+)ms/g;
  let match;
  while ((match = suiteRegex.exec(output)) !== null) {
    const [, suiteName, testCount, duration] = match;
    results.tests.push({
      name: suiteName.trim(),
      status: 'passed',
      duration: parseInt(duration, 10),
      tests: parseInt(testCount, 10),
      type: 'suite',
    });
  }

  // Parse individual test results
  const passedTestRegex = /^\s*(?:✓|✅)\s+(.+?)\s+(\d+)ms\s*$/gm;
  while ((match = passedTestRegex.exec(output)) !== null) {
    const [, testName, duration] = match;
    // Skip suite-level results (already captured above)
    if (!testName.includes('(') && !testName.includes('tests')) {
      results.tests.push({
        name: testName.trim(),
        status: 'passed',
        duration: parseInt(duration, 10),
        type: 'test',
      });
    }
  }

  // Parse failed tests
  const failedTestRegex = /(?:✗|×|FAIL)\s+(.+?)(?:\s+(\d+)ms)?$/gm;
  while ((match = failedTestRegex.exec(output)) !== null) {
    const [, testName, duration] = match;
    results.tests.push({
      name: testName.trim(),
      status: 'failed',
      duration: duration ? parseInt(duration, 10) : 0,
      type: 'test',
    });
  }

  // Parse skipped tests
  const skippedTestRegex = /(?:⏭|↓)\s+(.+?)$/gm;
  while ((match = skippedTestRegex.exec(output)) !== null) {
    const [, testName] = match;
    results.tests.push({
      name: testName.trim(),
      status: 'skipped',
      duration: 0,
      type: 'test',
    });
  }

  // Parse summary line for counts (fallback)
  const summaryMatch = output.match(
    /Tests?\s+(\d+)\s+passed.*?(\d+)\s+failed/i
  );
  const passedCountMatch = output.match(/(\d+)\s+passed/);
  const failedCountMatch = output.match(/(\d+)\s+failed/);
  const skippedCountMatch = output.match(/(\d+)\s+skipped/);

  // Build final metrics
  const tests = results.tests.filter(t => t.type === 'test');
  const passedTests = tests.filter(t => t.status === 'passed');
  const failedTests = tests.filter(t => t.status === 'failed');
  const skippedTests = tests.filter(t => t.status === 'skipped');

  // Use parsed counts or summary counts
  const totalCount = tests.length || parseInt(summaryMatch?.[1] || '0', 10);
  const passedCount =
    passedTests.length || parseInt(passedCountMatch?.[1] || '0', 10);
  const failedCount =
    failedTests.length || parseInt(failedCountMatch?.[1] || '0', 10);
  const skippedCount =
    skippedTests.length || parseInt(skippedCountMatch?.[1] || '0', 10);

  // Calculate durations
  const durations = tests.filter(t => t.duration > 0).map(t => t.duration);
  const avgDuration =
    durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

  // Identify slow tests
  const slowTests = tests
    .filter(t => t.duration > threshold)
    .sort((a, b) => b.duration - a.duration);

  // Calculate percentiles
  const sortedDurations = [...durations].sort((a, b) => a - b);
  const p50 =
    sortedDurations.length > 0
      ? sortedDurations[Math.floor(sortedDurations.length * 0.5)]
      : 0;
  const p95 =
    sortedDurations.length > 0
      ? sortedDurations[Math.floor(sortedDurations.length * 0.95)]
      : 0;
  const p99 =
    sortedDurations.length > 0
      ? sortedDurations[Math.floor(sortedDurations.length * 0.99)]
      : 0;

  return {
    timestamp: new Date().toISOString(),
    totalTests: totalCount,
    passedTests: passedCount,
    failedTests: failedCount,
    skippedTests: skippedCount,
    passRate:
      totalCount > 0
        ? parseFloat(((passedCount / totalCount) * 100).toFixed(2))
        : 0,
    totalDuration: results.totalDuration,
    averageDuration: parseFloat(avgDuration.toFixed(2)),
    timing: {
      setup: results.setupTime,
      testExecution: results.testExecutionTime,
      environment: results.environmentTime,
      transform: results.transformTime,
      collect: results.collectTime,
    },
    percentiles: {
      p50,
      p95,
      p99,
    },
    slowTests: slowTests.map(t => ({
      name: t.name,
      duration: t.duration,
    })),
    failedTestDetails: failedTests.map(t => ({
      name: t.name,
      duration: t.duration,
    })),
  };
}

/**
 * Run tests and capture output
 * @param {string} [command] - Test command to run
 * @returns {string} Test output
 */
function runTests(command = 'npm run test:fast') {
  try {
    const output = execSync(command, {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 300000, // 5 minutes
      cwd: process.cwd(),
    });
    return output;
  } catch (error) {
    // Tests might fail, but we still want to capture output
    if (error && typeof error === 'object') {
      const stdout = error.stdout || '';
      const stderr = error.stderr || '';
      return stdout + '\n' + stderr;
    }
    return '';
  }
}

/**
 * Read input from stdin
 * @returns {Promise<string>}
 */
function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';

    process.stdin.setEncoding('utf8');

    process.stdin.on('data', chunk => {
      data += chunk;
    });

    process.stdin.on('end', () => {
      resolve(data);
    });

    process.stdin.on('error', reject);

    // Set timeout for stdin
    setTimeout(() => {
      if (data) {
        resolve(data);
      }
    }, 5000);
  });
}

/**
 * Run multiple test iterations for flakiness detection
 * @param {number} iterations - Number of iterations
 * @param {number} threshold - Slow test threshold
 * @returns {Object} Aggregated metrics with flakiness report
 */
function runMultipleIterations(iterations, threshold) {
  const allMetrics = [];
  const testResults = new Map(); // testName -> array of pass/fail results

  for (let i = 1; i <= iterations; i++) {
    process.stdout.write(`\r📊 Running iteration ${i}/${iterations}...`);

    const output = runTests('npm run test -- --run --reporter=verbose');
    const metrics = parseTestOutput(output, threshold);
    allMetrics.push(metrics);

    // Track individual test results for flakiness
    metrics.failedTestDetails.forEach(test => {
      if (!testResults.has(test.name)) {
        testResults.set(test.name, []);
      }
      testResults.get(test.name).push('failed');
    });
  }

  console.log('\n');

  // Aggregate metrics
  const aggregated = {
    timestamp: new Date().toISOString(),
    iterations,
    totalTests: allMetrics[0]?.totalTests || 0,
    passRates: allMetrics.map(m => m.passRate),
    averagePassRate: parseFloat(
      (allMetrics.reduce((sum, m) => sum + m.passRate, 0) / iterations).toFixed(
        2
      )
    ),
    durations: allMetrics.map(m => m.totalDuration),
    averageDuration: parseFloat(
      (
        allMetrics.reduce((sum, m) => sum + m.totalDuration, 0) / iterations
      ).toFixed(2)
    ),
    minDuration: Math.min(...allMetrics.map(m => m.totalDuration)),
    maxDuration: Math.max(...allMetrics.map(m => m.totalDuration)),
  };

  // Build flakiness report
  const flakyTests = [];
  testResults.forEach((results, testName) => {
    const failureRate = results.length / iterations;
    if (failureRate > 0 && failureRate < 1) {
      // Inconsistent = flaky
      flakyTests.push({
        name: testName,
        failureRate: parseFloat((failureRate * 100).toFixed(2)),
        failedRuns: results.length,
        totalRuns: iterations,
        isFlaky: true,
      });
    }
  });

  aggregated.flakinessReport = {
    totalFlakyTests: flakyTests.length,
    flakyTests: flakyTests.sort((a, b) => b.failureRate - a.failureRate),
    reliabilityScore: parseFloat(
      (((iterations - flakyTests.length) / iterations) * 100).toFixed(2)
    ),
  };

  // Include the last run's detailed metrics
  aggregated.latestRun = allMetrics[allMetrics.length - 1];

  return aggregated;
}

/**
 * Format metrics as human-readable summary
 * @param {Object} metrics - Collected metrics
 * @returns {string}
 */
function formatSummary(metrics) {
  const lines = [
    `${colors.bold}📊 TEST METRICS SUMMARY${colors.reset}`,
    '═'.repeat(50),
    '',
    `${colors.cyan}📅 Timestamp:${colors.reset} ${metrics.timestamp}`,
    '',
    `${colors.bold}Test Results:${colors.reset}`,
    `  ✅ Passed:  ${metrics.passedTests || metrics.latestRun?.passedTests || 0}`,
    `  ❌ Failed:  ${metrics.failedTests || metrics.latestRun?.failedTests || 0}`,
    `  ⏭️  Skipped: ${metrics.skippedTests || metrics.latestRun?.skippedTests || 0}`,
    `  📊 Total:   ${metrics.totalTests || metrics.latestRun?.totalTests || 0}`,
    '',
    `${colors.bold}Pass Rate:${colors.reset} ${colors.green}${metrics.passRate || metrics.averagePassRate}%${colors.reset}`,
    '',
  ];

  // Duration info
  if (metrics.iterations) {
    lines.push(
      `${colors.bold}Duration (${metrics.iterations} runs):${colors.reset}`
    );
    lines.push(`  Average: ${(metrics.averageDuration / 1000).toFixed(2)}s`);
    lines.push(`  Min:     ${(metrics.minDuration / 1000).toFixed(2)}s`);
    lines.push(`  Max:     ${(metrics.maxDuration / 1000).toFixed(2)}s`);
  } else {
    lines.push(
      `${colors.bold}Duration:${colors.reset} ${(metrics.totalDuration / 1000).toFixed(2)}s`
    );
  }

  // Timing breakdown
  if (metrics.timing) {
    lines.push('');
    lines.push(`${colors.bold}Timing Breakdown:${colors.reset}`);
    lines.push(`  Setup:       ${(metrics.timing.setup / 1000).toFixed(2)}s`);
    lines.push(
      `  Tests:       ${(metrics.timing.testExecution / 1000).toFixed(2)}s`
    );
    lines.push(
      `  Environment: ${(metrics.timing.environment / 1000).toFixed(2)}s`
    );
  }

  // Percentiles
  if (metrics.percentiles) {
    lines.push('');
    lines.push(`${colors.bold}Percentiles:${colors.reset}`);
    lines.push(`  P50: ${metrics.percentiles.p50}ms`);
    lines.push(
      `  P95: ${metrics.percentiles.p95}ms ${metrics.percentiles.p95 > 200 ? '⚠️' : '✅'}`
    );
    lines.push(`  P99: ${metrics.percentiles.p99}ms`);
  }

  // Slow tests
  const slowTests = metrics.slowTests || metrics.latestRun?.slowTests || [];
  if (slowTests.length > 0) {
    lines.push('');
    lines.push(
      `${colors.yellow}🐌 Slow Tests (${slowTests.length}):${colors.reset}`
    );
    slowTests.slice(0, 5).forEach((test, i) => {
      lines.push(`  ${i + 1}. ${test.name}: ${test.duration}ms`);
    });
    if (slowTests.length > 5) {
      lines.push(`  ... and ${slowTests.length - 5} more`);
    }
  }

  // Flakiness report
  if (metrics.flakinessReport) {
    lines.push('');
    lines.push(`${colors.bold}Flakiness Report:${colors.reset}`);
    lines.push(
      `  Reliability Score: ${metrics.flakinessReport.reliabilityScore}%`
    );
    lines.push(
      `  Flaky Tests Found: ${metrics.flakinessReport.totalFlakyTests}`
    );

    if (metrics.flakinessReport.flakyTests.length > 0) {
      lines.push('');
      lines.push(`${colors.red}⚠️  Flaky Tests:${colors.reset}`);
      metrics.flakinessReport.flakyTests.forEach((test, i) => {
        lines.push(
          `  ${i + 1}. ${test.name} (${test.failureRate}% failure rate)`
        );
      });
    }
  }

  // Failed tests
  const failedTests =
    metrics.failedTestDetails || metrics.latestRun?.failedTestDetails || [];
  if (failedTests.length > 0) {
    lines.push('');
    lines.push(`${colors.red}❌ Failed Tests:${colors.reset}`);
    failedTests.slice(0, 10).forEach((test, i) => {
      lines.push(`  ${i + 1}. ${test.name}`);
    });
    if (failedTests.length > 10) {
      lines.push(`  ... and ${failedTests.length - 10} more`);
    }
  }

  lines.push('');
  lines.push('═'.repeat(50));

  return lines.join('\n');
}

/**
 * Main entry point
 */
async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  let metrics;

  try {
    if (options.stdin) {
      // Read from stdin
      if (!options.quiet) {
        console.log(
          `${colors.cyan}📥 Reading test output from stdin...${colors.reset}`
        );
      }
      const input = await readStdin();
      metrics = parseTestOutput(input, options.threshold);
    } else if (options.runs > 1) {
      // Multiple runs for flakiness detection
      if (!options.quiet) {
        console.log(
          `${colors.cyan}🔄 Running ${options.runs} iterations for flakiness detection...${colors.reset}`
        );
      }
      metrics = runMultipleIterations(options.runs, options.threshold);
    } else {
      // Single run
      if (!options.quiet) {
        console.log(
          `${colors.cyan}🧪 Running tests and collecting metrics...${colors.reset}`
        );
      }
      const output = runTests('npm run test:fast -- --reporter=verbose');
      metrics = parseTestOutput(output, options.threshold);
    }

    // Output based on format
    if (options.format === 'summary') {
      console.log(formatSummary(metrics));
    } else if (!options.quiet) {
      console.log(JSON.stringify(metrics, null, 2));
    }

    // Write to output file if specified
    if (options.outputFile) {
      const outputPath = path.resolve(process.cwd(), options.outputFile);
      fs.writeFileSync(outputPath, JSON.stringify(metrics, null, 2));
      if (!options.quiet) {
        console.log(
          `\n${colors.green}✅ Metrics saved to ${options.outputFile}${colors.reset}`
        );
      }
    }

    // Exit with error if tests failed
    const passRate = metrics.passRate || metrics.averagePassRate || 0;
    const failedCount =
      metrics.failedTests || metrics.latestRun?.failedTests || 0;

    if (failedCount > 0 || passRate < 99) {
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error(
      `${colors.red}❌ Error collecting metrics:${colors.reset}`,
      error.message
    );
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { parseTestOutput, formatSummary, runTests };
