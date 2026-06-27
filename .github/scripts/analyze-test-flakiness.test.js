const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAttemptOneOutcomes,
  buildWorkflowRunsApiPath,
  calculateMetrics,
  extractTestExecutions,
  MAIN_BRANCH,
  normalizeJobName,
  shouldCountAsRetry,
} = require('./analyze-test-flakiness');

test('buildWorkflowRunsApiPath scopes flakiness analysis to main branch', () => {
  const apiPath = buildWorkflowRunsApiPath('JovieInc', 'Jovie');

  assert.ok(apiPath.includes('branch=main'));
  assert.ok(apiPath.includes('status=completed'));
  assert.ok(apiPath.includes('per_page=30'));
  assert.equal(MAIN_BRANCH, 'main');
});

test('normalizeJobName strips matrix shard suffixes', () => {
  assert.equal(normalizeJobName('Unit Tests (1/3)'), 'Unit Tests');
  assert.equal(normalizeJobName('Unit Tests (2/3)'), 'Unit Tests');
  assert.equal(normalizeJobName('E2E Tests'), 'E2E Tests');
});

test('extractTestExecutions normalizes matrix job names in step-level output', () => {
  const job = {
    name: 'Unit Tests (3/3)',
    conclusion: 'failure',
    steps: [{ name: 'Run unit tests', conclusion: 'failure' }],
  };

  assert.deepEqual(extractTestExecutions(job), [
    { name: 'Unit Tests › Run unit tests', conclusion: 'failure' },
  ]);
});

test('extractTestExecutions prefers explicit test run steps', () => {
  const job = {
    name: 'Unit Tests',
    conclusion: 'failure',
    steps: [
      { name: 'Checkout', conclusion: 'success' },
      { name: 'Run unit tests', conclusion: 'success' },
      { name: 'Run quarantined unit tests (retries)', conclusion: 'failure' },
    ],
  };

  assert.deepEqual(extractTestExecutions(job), [
    { name: 'Unit Tests › Run unit tests', conclusion: 'success' },
    {
      name: 'Unit Tests › Run quarantined unit tests (retries)',
      conclusion: 'failure',
    },
  ]);
});

test('extractTestExecutions falls back to job-level outcome when no test steps exist', () => {
  const job = {
    name: 'E2E Tests',
    conclusion: 'success',
    steps: [{ name: 'Setup Node', conclusion: 'success' }],
  };

  assert.deepEqual(extractTestExecutions(job), [
    { name: 'E2E Tests', conclusion: 'success' },
  ]);
});

test('extractTestExecutions returns empty when test steps exist but are skipped/cancelled', () => {
  const job = {
    name: 'Unit Tests',
    conclusion: 'failure',
    steps: [
      { name: 'Checkout', conclusion: 'success' },
      { name: 'Install deps', conclusion: 'failure' },
      { name: 'Run unit tests', conclusion: 'skipped' },
      { name: 'Run quarantined unit tests (retries)', conclusion: 'cancelled' },
    ],
  };

  // Test steps exist but were skipped — should NOT fall back to job-level failure
  assert.deepEqual(extractTestExecutions(job), []);
});

test('shouldCountAsRetry only attributes workflow retries to failed attempt-1 steps', () => {
  assert.equal(
    shouldCountAsRetry({
      attemptOneConclusion: 'failure',
      runAttempt: 2,
      conclusion: 'success',
    }),
    true
  );
  assert.equal(
    shouldCountAsRetry({
      attemptOneConclusion: 'success',
      runAttempt: 2,
      conclusion: 'success',
    }),
    false
  );
  assert.equal(
    shouldCountAsRetry({
      attemptOneConclusion: undefined,
      runAttempt: 2,
      conclusion: 'success',
    }),
    false
  );
});

test('buildAttemptOneOutcomes records only first workflow attempts', () => {
  const unitJob = {
    name: 'Unit Tests (1/6)',
    conclusion: 'success',
    steps: [
      { name: 'Run unit tests', conclusion: 'failure' },
      { name: 'Run packages/ui unit tests', conclusion: 'success' },
    ],
  };

  const outcomes = buildAttemptOneOutcomes([
    {
      run: { head_sha: 'sha-a', run_attempt: 1 },
      jobs: [unitJob],
    },
    {
      run: { head_sha: 'sha-a', run_attempt: 2 },
      jobs: [unitJob],
    },
  ]);

  assert.deepEqual(
    [...outcomes.get('sha-a').entries()],
    [
      ['Unit Tests › Run unit tests', 'failure'],
      ['Unit Tests › Run packages/ui unit tests', 'success'],
    ]
  );
});

test('calculateMetrics does not flag stable steps with workflow-only retries', () => {
  const testStats = new Map([
    [
      'Unit Tests › Run unit tests',
      { failures: 1, successes: 68, retries: 0, runs: 69, lastFailure: null },
    ],
    [
      'Unit Tests › Run quarantined unit tests (retries)',
      { failures: 0, successes: 68, retries: 0, runs: 68, lastFailure: null },
    ],
    [
      'Unit Tests › Run packages/ui unit tests',
      { failures: 0, successes: 68, retries: 0, runs: 68, lastFailure: null },
    ],
  ]);

  const flaky = calculateMetrics(testStats);

  assert.equal(flaky.length, 0);
});

test('extractTestExecutions ignores setup failures when test steps were skipped', () => {
  const setupFailureJob = {
    name: 'Unit Tests (2/3)',
    conclusion: 'failure',
    steps: [
      { name: 'Setup Node.js and pnpm', conclusion: 'failure' },
      { name: 'Run unit tests', conclusion: 'skipped' },
    ],
  };

  assert.deepEqual(extractTestExecutions(setupFailureJob), []);
});

test('calculateMetrics flags only tests above thresholds', () => {
  const testStats = new Map([
    [
      'Stable Test',
      { failures: 1, successes: 30, retries: 0, runs: 31, lastFailure: null },
    ],
    [
      'Flaky Unit Tests',
      { failures: 3, successes: 24, retries: 0, runs: 27, lastFailure: null },
    ],
  ]);

  const flaky = calculateMetrics(testStats);

  assert.equal(flaky.length, 1);
  assert.equal(flaky[0].name, 'Flaky Unit Tests');
  assert.equal(flaky[0].failureRate, '11.1');
});
