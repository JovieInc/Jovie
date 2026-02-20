const test = require('node:test');
const assert = require('node:assert/strict');

const {
  calculateMetrics,
  extractTestExecutions,
} = require('./analyze-test-flakiness');

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
