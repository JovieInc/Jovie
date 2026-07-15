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
});
