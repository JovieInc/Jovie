import { describe, expect, it } from 'vitest';
import { diagnoseCiFailure } from '../../jobs/ci-failure-diagnosis';

describe('diagnoseCiFailure', () => {
  it('classifies the analytics scanner timeout separately from runner pressure', () => {
    const log = `
      FAIL tests/unit/analytics-metrics-layer-guard.test.ts > canonical metrics layer guard
      Error: Test timed out in 12000ms.
      PSI telemetry: sustained I/O pressure
    `;

    expect(diagnoseCiFailure(log).failureClass).toBe(
      'bounded_source_scan_timeout'
    );
  });

  it('classifies the touch-target ratchet as the same bounded scanner class', () => {
    expect(
      diagnoseCiFailure(`
        FAIL tests/unit/design-system/touch-target-ratchet.test.ts
        Error: Test timed out in 12000ms.
      `).failureClass
    ).toBe('bounded_source_scan_timeout');
  });

  it('keeps process exhaustion and host pressure as distinct failure classes', () => {
    expect(
      diagnoseCiFailure('ERR_WORKER_INIT_FAILED: spawnSync node EAGAIN')
        .failureClass
    ).toBe('runner_process_exhaustion');
    expect(
      diagnoseCiFailure('PSI: sustained memory pressure on runner').failureClass
    ).toBe('runner_host_pressure');
  });

  it('classifies a checkout shutdown as the autoscaler idle-reap race', () => {
    const diagnosis = diagnoseCiFailure(`
      Checkout repository
      Error: The runner has received a shutdown signal.
    `);

    expect(diagnosis).toMatchObject({
      failureClass: 'runner_idle_reap_race',
      rootCause: expect.stringContaining('stale idle snapshot'),
      remediation: expect.stringContaining('freshly busy'),
    });
  });

  it('classifies the historical full-suite timeout as a broken profiler fixture', () => {
    const diagnosis = diagnoseCiFailure(`
      Test Performance Budgets
      Test suite failed:
      exit=none
      signal=SIGTERM
      stderr=suite exceeded 420000ms
    `);

    expect(diagnosis).toMatchObject({
      failureClass: 'broken_profiler_fixture',
      rootCause: expect.stringContaining('entire ~1,900-file fast suite'),
      remediation: expect.stringContaining('60s budget'),
    });
  });

  it('keeps future bounded-suite timeouts inconclusive until exact rerun evidence exists', () => {
    const diagnosis = diagnoseCiFailure(`
      Test Performance Budgets
      Test suite failed:
      signal=SIGTERM
      error=spawnSync pnpm ETIMEDOUT
      classification=inconclusive-performance-timeout
    `);

    expect(diagnosis).toMatchObject({
      failureClass: 'inconclusive_performance_timeout',
      rootCause: expect.stringContaining('not safe to retry or ignore'),
      remediation: expect.stringContaining('Do not change the 60s budget'),
    });
  });

  it.each([
    {
      output: 'Total test duration (61000ms) exceeds threshold (60000ms)',
      failureClass: 'suite_wide_performance_regression',
    },
    {
      output: 'P95 test duration (201ms) exceeds threshold (200ms)',
      failureClass: 'broad_test_performance_regression',
    },
    {
      output:
        'Max individual test duration (2001ms) exceeds threshold (2000ms): stuck assertion',
      failureClass: 'isolated_stuck_test_regression',
    },
  ])('classifies $failureClass independently', ({ output, failureClass }) => {
    expect(
      diagnoseCiFailure(`Test Performance Budgets\n${output}`).failureClass
    ).toBe(failureClass);
  });
});
