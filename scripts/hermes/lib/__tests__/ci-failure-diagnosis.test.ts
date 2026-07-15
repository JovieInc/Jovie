import { describe, expect, it } from 'vitest';
import { diagnoseCiFailure } from '../../jobs/ci-failure-diagnosis';

describe('diagnoseCiFailure', () => {
  it('diagnoses ownership preflight slug or latency drift from its structured receipt', () => {
    const diagnosis = diagnoseCiFailure(`
      {"failure_class":"gbrain_ownership_preflight_latency_or_slug_drift","requested_slug":"agent-job-ledger","resolved_slug":null,"engine_ms":3004,"cli_ms":null,"mcp_ms":null,"timeout_tier":"ledger_step","lookup_health":"timeout","db_lock_signal_detected":true,"session_signal_detected":null}
    `);

    expect(diagnosis.failureClass).toBe(
      'gbrain_ownership_preflight_latency_or_slug_drift'
    );
    expect(diagnosis.remediation).toContain('coordination/agent-job-ledger');
    expect(diagnosis.remediation).toContain('engine/CLI/MCP latency');
    expect(diagnosis.remediation).toContain('timeout tier');
  });

  it('diagnoses deterministic Better Auth OTP rejection in the bypass smoke lane', () => {
    const diagnosis = diagnoseCiFailure(`
      E2E Smoke (PR Fast Feedback)
      export E2E_USE_TEST_AUTH_BYPASS=1
      [chromium] tests/e2e/golden-path.spec.ts
      TimeoutError: page.waitForURL: Timeout 30000ms exceeded.
      at createFreshUserOnce (tests/e2e/golden-path.spec.ts:252:14)
    `);

    expect(diagnosis.failureClass).toBe('golden_path_smoke_auth_contract');
    expect(diagnosis.rootCause).toContain('E2E_TEST_MODE');
    expect(diagnosis.remediation).toContain('dedicated Golden Path job');
  });

  it('does not misclassify the authoritative real-auth golden-path lane', () => {
    expect(
      diagnoseCiFailure(`
        Golden Path (PR)
        export E2E_TEST_MODE=1
        [chromium] tests/e2e/golden-path.spec.ts
        TimeoutError: page.waitForURL: Timeout 30000ms exceeded.
      `).failureClass
    ).toBe('unknown');
  });

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

  it.each([
    'feature-flags-registry.test.ts',
    'arbitrary-values-ratchet.test.ts',
  ])('classifies recurring %s scanner timeouts', testFile => {
    expect(
      diagnoseCiFailure(`
        FAIL tests/unit/${testFile}
        Error: Test timed out in 12000ms.
      `).failureClass
    ).toBe('bounded_source_scan_timeout');
  });

  it('classifies the exp lint subprocess timeout as bounded scanner work', () => {
    expect(
      diagnoseCiFailure(`
        FAIL tests/unit/app/exp-drift-lint-guard.test.ts
        Error: spawnSync /bin/sh ETIMEDOUT
      `).failureClass
    ).toBe('bounded_source_scan_timeout');
  });

  it('classifies the HUD cold-import timeout as a broken test fixture', () => {
    expect(
      diagnoseCiFailure(`
        FAIL tests/unit/app/hud-page.test.ts > /hud page auth > redirects kiosk bookmarks to /hud-tv
        Error: Test timed out in 5000ms.
      `).failureClass
    ).toBe('test_fixture_import_timeout');
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

  it.each([
    'runner_failure_class=runner-io-pressure',
    'runner_failure_class=runner-io-pressure-unavailable',
    'runner_spawn_admission=blocked io_full_avg10_pct=49.82',
  ])('diagnoses I/O-pressure admission without recommending retries: %s', log => {
    const diagnosis = diagnoseCiFailure(log);

    expect(diagnosis.failureClass).toBe('runner_io_pressure_admission');
    expect(diagnosis.rootCause).toContain('scale-up was admission-blocked');
    expect(diagnosis.remediation).toContain('Do not retry or add runners');
  });

  it('upgrades the proactive slice diagnostic to an exact capacity class', () => {
    const diagnosis = diagnoseCiFailure(`
      runner_tasks_status=critical
      runner_tasks_current=958
      runner_tasks_max=1024
      runner_tasks_ratio_pct=93
    `);

    expect(diagnosis.failureClass).toBe('runner_slice_task_saturation');
    expect(diagnosis.rootCause).toContain('ci-runners.slice');
    expect(diagnosis.remediation).toContain('diagnose-capacity.sh');
  });

  it('does not infer slice saturation from an unrelated status line', () => {
    expect(diagnoseCiFailure('runner_tasks_status=critical').failureClass).toBe(
      'unknown'
    );
  });

  it('diagnoses a cancelled pending job whose Neon concurrency key lost its job prefix', () => {
    const diagnosis = diagnoseCiFailure(`
      E2E Smoke (PR Fast Feedback) was cancelled before runner assignment.
      A newer pending job replaced it in concurrency group neon-endpoint-pool--0.
    `);

    expect(diagnosis.failureClass).toBe('neon_concurrency_key_collision');
    expect(diagnosis.rootCause).toContain('github.job');
    expect(diagnosis.remediation).toContain('literal job identifier');
  });

  it('does not classify a valid per-job Neon concurrency group as a collision', () => {
    expect(
      diagnoseCiFailure(
        'waiting in concurrency group neon-endpoint-pool-ci-e2e-smoke-0'
      ).failureClass
    ).toBe('unknown');
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

  it('does not misclassify a truncated modern timeout as the legacy 420s fixture', () => {
    expect(
      diagnoseCiFailure(`
        Test Performance Budgets
        Test suite failed:
        signal=SIGTERM
        error=spawnSync pnpm ETIMEDOUT
      `).failureClass
    ).toBe('unknown');
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
