const test = require('node:test');
const assert = require('node:assert/strict');

const {
  calculateMetrics,
  extractTestExecutions,
  normalizeJobName,
} = require('./analyze-test-flakiness');

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
