#!/usr/bin/env node

/**
 * Test Flakiness Analyzer
 *
 * Analyzes Playwright test results from CI runs to identify flaky tests.
 * Tracks failure rates, retry rates, and generates actionable reports.
 *
 * Usage:
 *   node analyze-test-flakiness.js <github-token> <owner> <repo>
 *
 * Environment:
 *   - GITHUB_TOKEN: GitHub API token (or passed as arg)
 *   - GITHUB_REPOSITORY: owner/repo (or passed as args)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Configuration
const ANALYSIS_LIMIT = 30; // Number of recent workflow runs to analyze
const MAIN_BRANCH = 'main'; // Only main-branch runs — PR failures are deterministic, not flaky
const FLAKY_FAILURE_THRESHOLD = 5; // % failure rate to flag as flaky
const FLAKY_RETRY_THRESHOLD = 10; // % retry rate to flag as flaky
const HIGH_FLAKINESS_THRESHOLD = 5; // Number of flaky tests to trigger alert
const HIGH_RETRY_RATE_THRESHOLD = 20; // % of runs with retries to trigger alert

/**
 * Make GitHub API request
 */
function githubRequest(path, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: path,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'Jovie-Test-Flakiness-Analyzer',
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    };

    https
      .get(options, res => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`GitHub API error: ${res.statusCode} ${data}`));
          } else {
            resolve(JSON.parse(data));
          }
        });
      })
      .on('error', reject);
  });
}

/**
 * Build the GitHub API path for completed workflow runs on a single branch.
 * Restricting to main avoids counting PR-branch test failures as flakiness.
 */
function buildWorkflowRunsApiPath(
  owner,
  repo,
  { limit = ANALYSIS_LIMIT, branch = MAIN_BRANCH } = {}
) {
  const params = new URLSearchParams({
    per_page: String(limit),
    status: 'completed',
    branch,
  });
  return `/repos/${owner}/${repo}/actions/workflows/ci.yml/runs?${params}`;
}

/**
 * Fetch workflow runs
 */
async function fetchWorkflowRuns(token, owner, repo) {
  console.log(
    `Fetching last ${ANALYSIS_LIMIT} completed ${MAIN_BRANCH}-branch CI runs...`
  );
  const data = await githubRequest(
    buildWorkflowRunsApiPath(owner, repo),
    token
  );
  return data.workflow_runs;
}

/**
 * Fetch jobs for a workflow run
 */
async function fetchRunJobs(token, owner, repo, runId) {
  const data = await githubRequest(
    `/repos/${owner}/${repo}/actions/runs/${runId}/jobs`,
    token
  );
  return data.jobs;
}

/**
 * Fetch artifacts for a workflow run (for JSON test results)
 * Currently unused but kept for future Playwright JSON report parsing
 */
async function _fetchRunArtifacts(token, owner, repo, runId) {
  try {
    const data = await githubRequest(
      `/repos/${owner}/${repo}/actions/runs/${runId}/artifacts`,
      token
    );
    return data.artifacts || [];
  } catch (error) {
    console.warn(
      `Could not fetch artifacts for run ${runId}: ${error.message}`
    );
    return [];
  }
}

/**
 * Parse test name from job step
 * Currently unused but kept for future granular test name parsing
 */
function _parseTestName(stepName) {
  // Extract test file name from step output
  // Example: "tests/e2e/profile.spec.ts:42:5 › should render profile"
  const match = stepName.match(/tests\/e2e\/([^:]+\.spec\.ts)/);
  return match ? match[1] : stepName;
}

/**
 * Filter workflow jobs down to test-relevant lanes.
 */
function filterTestJobs(jobs) {
  return jobs.filter(
    job =>
      job.name.includes('E2E') ||
      job.name.includes('Smoke') ||
      job.name.includes('Unit')
  );
}

/**
 * Collect normalized test-step executions from a workflow run's jobs.
 */
function collectRunExecutions(jobs) {
  const executions = [];

  for (const job of filterTestJobs(jobs)) {
    executions.push(...extractTestExecutions(job));
  }

  return executions;
}

/**
 * Record attempt-1 outcomes per commit so later workflow retries only count
 * when the same step failed on the first attempt.
 */
function buildAttemptOneOutcomes(runsWithJobs) {
  const outcomesBySha = new Map();

  for (const { run, jobs } of runsWithJobs) {
    if (run.run_attempt !== 1) continue;

    const stepOutcomes = new Map();
    for (const execution of collectRunExecutions(jobs)) {
      stepOutcomes.set(execution.name, execution.conclusion);
    }

    outcomesBySha.set(run.head_sha, stepOutcomes);
  }

  return outcomesBySha;
}

/**
 * Count a retry only when a workflow re-run recovered a step that failed on
 * attempt 1. Unrelated workflow retries should not inflate stable steps.
 */
function shouldCountAsRetry({ attemptOneConclusion, runAttempt, conclusion }) {
  return (
    runAttempt > 1 &&
    conclusion === 'success' &&
    attemptOneConclusion === 'failure'
  );
}

/**
 * Analyze workflow runs for test flakiness
 */
async function analyzeFlakiness(token, owner, repo) {
  const runs = await fetchWorkflowRuns(token, owner, repo);
  console.log(`Analyzing ${runs.length} workflow runs...`);

  const runsWithJobs = [];
  for (const run of runs) {
    const jobs = await fetchRunJobs(token, owner, repo, run.id);
    runsWithJobs.push({ run, jobs });
  }

  const attemptOneOutcomes = buildAttemptOneOutcomes(runsWithJobs);
  const testStats = new Map(); // testName -> { failures, successes, retries, runs }
  let totalRuns = 0;
  let runsWithRetries = 0;
  let runsWithFailures = 0;

  for (const { run, jobs } of runsWithJobs) {
    totalRuns++;
    const runHadRetry = run.run_attempt > 1;
    let runHadFailure = false;
    const firstAttemptOutcomes =
      attemptOneOutcomes.get(run.head_sha) ?? new Map();

    for (const execution of collectRunExecutions(jobs)) {
      if (!testStats.has(execution.name)) {
        testStats.set(execution.name, {
          failures: 0,
          successes: 0,
          retries: 0,
          runs: 0,
          lastFailure: null,
        });
      }

      const stats = testStats.get(execution.name);
      stats.runs++;

      if (execution.conclusion === 'failure') {
        stats.failures++;
        stats.lastFailure = run.created_at;
        runHadFailure = true;
      } else if (execution.conclusion === 'success') {
        stats.successes++;
        if (
          shouldCountAsRetry({
            attemptOneConclusion: firstAttemptOutcomes.get(execution.name),
            runAttempt: run.run_attempt,
            conclusion: execution.conclusion,
          })
        ) {
          stats.retries++;
        }
      }
    }

    if (runHadRetry) runsWithRetries++;
    if (runHadFailure) runsWithFailures++;
  }

  return {
    testStats,
    totalRuns,
    runsWithRetries,
    runsWithFailures,
  };
}

/**
 * Extract concrete test executions from a workflow job.
 *
 * Unit test jobs can fail for non-test reasons (dependency install, environment setup,
 * runner drift), which creates noisy "Unit Tests" flakiness reports. When a Unit Tests
 * job has NO test steps that actually ran (e.g. setup failed before the test step was
 * created), we skip it entirely — it was an infra failure, not a flaky test.
 *
 * Prefer explicit test run steps when available; only fall back to job-level status
 * for non-Unit-Tests jobs that have no test steps defined.
 */
function extractTestExecutions(job) {
  const runStepRegex = /^run .*tests?/i;
  const normalizedJobName = normalizeJobName(job.name || '');

  // First, check if any test steps exist at all (regardless of conclusion)
  const allTestSteps = (job.steps || []).filter(step =>
    runStepRegex.test(step.name || '')
  );

  // If test steps exist, only report those that actually completed (success/failure).
  // Skipped/cancelled test steps mean the job failed before tests ran (e.g. setup failure)
  // — do NOT fall back to job-level conclusion in that case.
  if (allTestSteps.length > 0) {
    const completedSteps = allTestSteps.filter(step =>
      ['success', 'failure'].includes(step.conclusion)
    );

    return completedSteps.map(step => ({
      name: `${normalizedJobName} › ${step.name}`,
      conclusion: step.conclusion,
    }));
  }

  // Unit Tests jobs with no test steps at all: the failure was in setup/infra
  // (runner drift, dependency install, etc.), NOT in the tests themselves.
  // Do not count these as test flakiness.
  if (normalizedJobName === 'Unit Tests') {
    return [];
  }

  // Fall back to job-level conclusion for non-Unit-Tests jobs
  if (['success', 'failure'].includes(job.conclusion)) {
    return [{ name: normalizedJobName, conclusion: job.conclusion }];
  }

  return [];
}

/**
 * Normalize CI matrix job names so shard variants are grouped together.
 * Example: "Unit Tests (1/3)" -> "Unit Tests"
 */
function normalizeJobName(name) {
  return name.replace(/\s*\(\d+\/\d+\)$/, '');
}

/**
 * Calculate flakiness metrics
 */
function calculateMetrics(testStats) {
  const flakyTests = [];

  for (const [testName, stats] of testStats.entries()) {
    const totalAttempts = stats.failures + stats.successes;
    if (totalAttempts === 0) continue;

    const failureRate = (stats.failures / totalAttempts) * 100;
    const retryRate =
      stats.successes > 0 ? (stats.retries / stats.successes) * 100 : 0;

    // Calculate flakiness score (weighted average)
    const flakinessScore = failureRate * 0.7 + retryRate * 0.3;

    // Flag as flaky if exceeds thresholds
    if (
      failureRate > FLAKY_FAILURE_THRESHOLD ||
      retryRate > FLAKY_RETRY_THRESHOLD
    ) {
      flakyTests.push({
        name: testName,
        failureRate: failureRate.toFixed(1),
        retryRate: retryRate.toFixed(1),
        flakinessScore: flakinessScore.toFixed(1),
        failures: stats.failures,
        successes: stats.successes,
        retries: stats.retries,
        runs: stats.runs,
        lastFailure: stats.lastFailure,
        severity:
          flakinessScore > 30 ? 'high' : flakinessScore > 15 ? 'medium' : 'low',
      });
    }
  }

  // Sort by flakiness score descending
  flakyTests.sort(
    (a, b) => parseFloat(b.flakinessScore) - parseFloat(a.flakinessScore)
  );

  return flakyTests;
}

/**
 * Generate markdown report
 */
function generateReport(
  flakyTests,
  totalRuns,
  runsWithRetries,
  runsWithFailures
) {
  const reportDate = new Date().toISOString().split('T')[0];
  const retryRate = ((runsWithRetries / totalRuns) * 100).toFixed(1);
  const failureRate = ((runsWithFailures / totalRuns) * 100).toFixed(1);

  let report = `# 📊 Test Flakiness Report - ${reportDate}\n\n`;

  // Summary section
  report += `## Summary\n\n`;
  report += `- **Analysis Period**: Last ${totalRuns} \`${MAIN_BRANCH}\` branch CI runs\n`;
  report += `- **Runs with Retries**: ${runsWithRetries} (${retryRate}%)\n`;
  report += `- **Runs with Failures**: ${runsWithFailures} (${failureRate}%)\n`;
  report += `- **Flaky Tests Detected**: ${flakyTests.length}\n\n`;

  // Health indicator
  if (flakyTests.length === 0 && parseFloat(retryRate) < 5) {
    report += `### ✅ Test Suite Health: Excellent\n\n`;
    report += `All tests are stable with minimal retries!\n\n`;
  } else if (flakyTests.length < 3 && parseFloat(retryRate) < 10) {
    report += `### 🟡 Test Suite Health: Good\n\n`;
    report += `Minor flakiness detected. Monitor and address if it worsens.\n\n`;
  } else if (flakyTests.length < HIGH_FLAKINESS_THRESHOLD) {
    report += `### 🟠 Test Suite Health: Fair\n\n`;
    report += `Moderate flakiness detected. Action recommended.\n\n`;
  } else {
    report += `### 🔴 Test Suite Health: Poor\n\n`;
    report += `Significant flakiness detected. Immediate action required!\n\n`;
  }

  // Flaky tests table
  if (flakyTests.length > 0) {
    report += `## Flaky Tests (${flakyTests.length})\n\n`;
    report += `Tests exceeding thresholds (>${FLAKY_FAILURE_THRESHOLD}% failure rate OR >${FLAKY_RETRY_THRESHOLD}% retry rate):\n\n`;
    report += `| Severity | Test Name | Failure Rate | Retry Rate | Score | Failures | Successes | Retries |\n`;
    report += `|----------|-----------|-------------|-----------|-------|----------|-----------|--------|\n`;

    for (const test of flakyTests) {
      const severityEmoji =
        test.severity === 'high'
          ? '🔴'
          : test.severity === 'medium'
            ? '🟡'
            : '🟢';
      report += `| ${severityEmoji} ${test.severity} | \`${test.name}\` | ${test.failureRate}% | ${test.retryRate}% | ${test.flakinessScore} | ${test.failures} | ${test.successes} | ${test.retries} |\n`;
    }

    report += `\n**Flakiness Score**: Weighted metric combining failure rate (70%) and retry rate (30%)\n\n`;

    // Severity breakdown
    const high = flakyTests.filter(t => t.severity === 'high').length;
    const medium = flakyTests.filter(t => t.severity === 'medium').length;
    const low = flakyTests.filter(t => t.severity === 'low').length;

    if (high > 0 || medium > 0) {
      report += `### 🚨 Priority Actions\n\n`;
      if (high > 0) {
        report += `**🔴 High Severity (${high} tests)**: Immediate investigation required\n`;
        report += `- Add to quarantine.json if blocking releases\n`;
        report += `- Root cause analysis in next sprint\n\n`;
      }
      if (medium > 0) {
        report += `**🟡 Medium Severity (${medium} tests)**: Address in upcoming sprint\n`;
        report += `- Monitor for worsening trends\n`;
        report += `- Consider adding stabilization work to backlog\n\n`;
      }
      if (low > 0) {
        report += `**🟢 Low Severity (${low} tests)**: Monitor only\n\n`;
      }
    }

    // Recommendations
    report += `## Recommended Actions\n\n`;
    report += `1. **Investigate Root Causes**\n`;
    report += `   - Review test logs for high-severity flaky tests\n`;
    report += `   - Check for timing issues, race conditions, or environment dependencies\n\n`;

    report += `2. **Quarantine High-Severity Tests**\n`;
    report += `   - Add tests with >20% failure rate to \`apps/web/quarantine.json\`\n`;
    report += `   - Document reason and target fix date\n\n`;

    report += `3. **Stabilize or Remove**\n`;
    report += `   - Fix flaky tests by improving test isolation and determinism\n`;
    report += `   - Delete tests that provide minimal value or cannot be stabilized\n\n`;

    report += `4. **Monitor Trends**\n`;
    report += `   - Re-run this report weekly to track improvements\n`;
    report += `   - Set up alerts for flakiness score > 30\n\n`;
  }

  // Thresholds and metadata
  report += `---\n\n`;
  report += `**Thresholds**:\n`;
  report += `- Failure rate: >${FLAKY_FAILURE_THRESHOLD}%\n`;
  report += `- Retry rate: >${FLAKY_RETRY_THRESHOLD}%\n`;
  report += `- High severity: Score >30\n`;
  report += `- Medium severity: Score >15\n\n`;
  report += `**Generated**: ${new Date().toISOString()}\n`;
  report += `**Workflow**: [Test Flakiness Report](https://github.com/${process.env.GITHUB_REPOSITORY}/actions/workflows/test-flakiness-report.yml)\n`;

  return report;
}

/**
 * Main execution
 */
async function main() {
  try {
    // Parse arguments
    const token = process.argv[2] || process.env.GITHUB_TOKEN;
    const repository = process.argv[3] || process.env.GITHUB_REPOSITORY;

    if (!token) {
      throw new Error(
        'GitHub token required (pass as arg or GITHUB_TOKEN env)'
      );
    }

    if (!repository) {
      throw new Error(
        'Repository required (pass as arg or GITHUB_REPOSITORY env)'
      );
    }

    const [owner, repo] = repository.split('/');

    // Analyze flakiness
    const { testStats, totalRuns, runsWithRetries, runsWithFailures } =
      await analyzeFlakiness(token, owner, repo);

    const flakyTests = calculateMetrics(testStats);
    const report = generateReport(
      flakyTests,
      totalRuns,
      runsWithRetries,
      runsWithFailures
    );

    // Write report to file
    const reportPath = path.join(process.cwd(), 'flakiness-report.md');
    fs.writeFileSync(reportPath, report);
    console.log(`\n✅ Report generated: ${reportPath}`);

    // Output metrics for GitHub Actions
    if (process.env.GITHUB_OUTPUT) {
      const highSeverity = flakyTests.filter(t => t.severity === 'high');
      const candidates = highSeverity.map(t => ({
        name: t.name,
        failureRate: t.failureRate,
        flakinessScore: t.flakinessScore,
      }));
      const output = [
        `flaky_count=${flakyTests.length}`,
        `total_runs=${totalRuns}`,
        `retry_rate=${((runsWithRetries / totalRuns) * 100).toFixed(1)}`,
        `high_severity=${highSeverity.length}`,
        `quarantine_candidates=${JSON.stringify(candidates)}`,
      ].join('\n');
      fs.appendFileSync(process.env.GITHUB_OUTPUT, output + '\n');
    }

    // Exit with error if high flakiness detected
    if (
      flakyTests.length > HIGH_FLAKINESS_THRESHOLD ||
      (runsWithRetries / totalRuns) * 100 > HIGH_RETRY_RATE_THRESHOLD
    ) {
      console.error(
        `\n🔴 HIGH FLAKINESS DETECTED: ${flakyTests.length} flaky tests`
      );
      process.exit(1);
    }

    console.log(`\n📊 Flakiness Summary:`);
    console.log(`   Total runs: ${totalRuns}`);
    console.log(`   Flaky tests: ${flakyTests.length}`);
    console.log(
      `   Retry rate: ${((runsWithRetries / totalRuns) * 100).toFixed(1)}%`
    );
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = {
  analyzeFlakiness,
  buildAttemptOneOutcomes,
  buildWorkflowRunsApiPath,
  calculateMetrics,
  collectRunExecutions,
  extractTestExecutions,
  MAIN_BRANCH,
  normalizeJobName,
  generateReport,
  shouldCountAsRetry,
  FLAKY_FAILURE_THRESHOLD,
  FLAKY_RETRY_THRESHOLD,
};
