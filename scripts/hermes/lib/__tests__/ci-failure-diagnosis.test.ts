import { describe, expect, it } from 'vitest';
import { diagnoseCiFailure } from '../../jobs/ci-failure-diagnosis';

describe('diagnoseCiFailure', () => {
  it('diagnoses missing draft evidence when no trusted producer ran', () => {
    const diagnosis = diagnoseCiFailure(`
      Complete job name: Verify Draft Agent PR
      Require GStack gate evidence
      Missing recorded gate evidence for: gstack.qa.exhaustive, gstack.review, gstack.ship
    `);

    expect(diagnosis.failureClass).toBe(
      'agent_gate_evidence_missing_without_producer'
    );
    expect(diagnosis.rootCause).toContain('no trusted producer');
    expect(diagnosis.remediation).toContain('Do not blindly rerun');
    expect(diagnosis.remediation).toContain('mark the reviewed PR ready');
    expect(diagnosis.remediation).toContain(
      'required CI remains authoritative'
    );
  });

  it('does not waive a generic missing-evidence message', () => {
    expect(
      diagnoseCiFailure('Missing recorded gate evidence for: gstack.review')
        .failureClass
    ).toBe('unknown');
  });

  it('classifies a dependency-free gate timing out during pnpm cache extraction', () => {
    const diagnosis = diagnoseCiFailure(`
      Complete job name: CI Risk Classifier
      Cache hit for: node-cache-Linux-x64-pnpm-adca8ba
      Cache Size: ~1265 MB (1326889463 B)
      /usr/bin/tar -xf /home/runner/work/_temp/cache.tzst -P \\
        --use-compress-program unzstd
      ##[error]The operation was canceled.
      Terminate orphan process: pid (2230) (unzstd)
    `);

    expect(diagnosis.failureClass).toBe('gate_dependency_cache_timeout');
    expect(diagnosis.rootCause).toContain('three-minute job budget');
    expect(diagnosis.remediation).toContain('dependency-free gates');
    expect(diagnosis.remediation).toContain('instead of blindly rerunning');
  });

  it('does not apply the classifier diagnosis to a dependency-requiring job', () => {
    const diagnosis = diagnoseCiFailure(`
      Complete job name: Unit Tests (1/5)
      Cache Size: ~1265 MB (1326889463 B)
      /usr/bin/tar -xf /home/runner/work/_temp/cache.tzst -P \\
        --use-compress-program unzstd
      ##[error]The operation was canceled.
    `);

    expect(diagnosis.failureClass).toBe('unknown');
  });

  it('diagnoses runner image proof disk exhaustion after a successful build', () => {
    const diagnosis = diagnoseCiFailure(`
      #27 exporting to docker image format done
      #28 exporting cache to client directory
      ERROR: failed to solve: ResourceExhausted: write cache.db: no space left on device
    `);

    expect(diagnosis.failureClass).toBe('runner_image_proof_disk_exhaustion');
    expect(diagnosis.rootCause).toContain('image itself built successfully');
    expect(diagnosis.remediation).toContain('GitHub Actions BuildKit cache');
    expect(diagnosis.remediation).toContain('bounded text evidence');
  });

  it('does not classify an unrelated package-manager ENOSPC as image proof exhaustion', () => {
    expect(
      diagnoseCiFailure('npm ERR! ENOSPC: no space left on device').failureClass
    ).toBe('unknown');
  });

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

  it('diagnoses the fail-closed Layout Guard manifest signature', () => {
    const diagnosis = diagnoseCiFailure(`
      Layout Guard
      ::error::Layout Guard contract missing required spec: tests/e2e/hud-scroll.spec.ts
    `);

    expect(diagnosis.failureClass).toBe('layout_guard_contract_missing');
    expect(diagnosis.rootCause).toContain('missing test');
    expect(diagnosis.remediation).toContain('never turn');
  });

  it('recognizes the legacy missing-spec false green without matching generic missing files', () => {
    expect(
      diagnoseCiFailure('layout-overlap-guard.spec.ts not found — skipping')
        .failureClass
    ).toBe('layout_guard_contract_missing');
    expect(
      diagnoseCiFailure('unrelated.spec.ts not found — skipping').failureClass
    ).toBe('unknown');
  });

  it('diagnoses a standalone artifact launched through next start', () => {
    const diagnosis = diagnoseCiFailure(`
      Layout Guard
      \"next start\" does not work with \"output: standalone\" configuration.
      Error: Failed to load external module require-in-the-middle-a99415fa67232f7f
    `);

    expect(diagnosis.failureClass).toBe('standalone_runtime_launcher_mismatch');
    expect(diagnosis.rootCause).toContain('next start');
    expect(diagnosis.remediation).toContain(
      '.next/standalone/apps/web/server.js'
    );
    expect(diagnosis.remediation).toContain('fail closed');
  });

  it('does not infer a launcher mismatch from an unrelated missing module', () => {
    expect(
      diagnoseCiFailure(
        'Error: Failed to load external module require-in-the-middle-deadbeef'
      ).failureClass
    ).toBe('unknown');
  });

  it('diagnoses the pre-barrier chat composer entry-animation race', () => {
    const diagnosis = diagnoseCiFailure(`
      E2E Smoke (PR Fast Feedback)
      1) [chromium] › tests/e2e/shell-chat-v1.spec.ts:356:5 › chat route picker opens without moving the shell or composer
      Expected: <= ^[[32m1^[[39m
      Received: ^[[31m5.90582275390625^[[39m
      at /home/runner/work/Jovie/Jovie/apps/web/tests/e2e/shell-chat-v1.spec.ts:397:48
    `);

    expect(diagnosis.failureClass).toBe(
      'chat_composer_unsettled_entry_animation'
    );
    expect(diagnosis.rootCause).toContain('chat-enter translateY(6px)');
    expect(diagnosis.remediation).toContain('getAnimations({ subtree: true })');
  });

  it.each([
    {
      label: 'a real post-barrier geometry shift',
      detail: 'Composer shifted after entry animations settled',
      received: '5.90582275390625',
    },
    {
      label: 'a shift larger than the six-pixel entry transform',
      detail: '',
      received: '6.5',
    },
  ])('does not mask $label', ({ detail, received }) => {
    expect(
      diagnoseCiFailure(`
        E2E Smoke (PR Fast Feedback)
        1) [chromium] › tests/e2e/shell-chat-v1.spec.ts:363:5 › chat route picker opens without moving the shell or composer
        ${detail}
        Expected: <= 1
       Received: ${received}
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

  it('diagnoses the Visual QA prune timestamp race without a blind rerun', () => {
    const diagnosis = diagnoseCiFailure(`
      FAIL tests/unit/agent-os/visual-qa/diff-artifacts.test.ts > pruneCompletedVisualQaRuns > preserves candidates and stops pruning when activity, state, or current-run evidence changes
      AssertionError: expected [ 'completed-old' ] to deeply equal []
    `);

    expect(diagnosis.failureClass).toBe('visual_qa_prune_timestamp_race');
    expect(diagnosis.rootCause).toContain('same timestamp tick');
    expect(diagnosis.remediation).toContain('recursive entry fingerprint');
    expect(diagnosis.remediation).toContain('do not blindly rerun');
  });

  it('does not infer the Visual QA race from an unrelated artifact assertion', () => {
    expect(
      diagnoseCiFailure(`
        FAIL tests/unit/agent-os/visual-qa/diff-artifacts.test.ts > writes overlay artifacts
        AssertionError: expected completed-old to deeply equal []
      `).failureClass
    ).toBe('unknown');
  });

  it('classifies the touch-target ratchet as the same bounded scanner class', () => {
    expect(
      diagnoseCiFailure(`
        FAIL tests/unit/design-system/touch-target-ratchet.test.ts
        Error: Test timed out in 12000ms.
      `).failureClass
    ).toBe('bounded_source_scan_timeout');
  });

  it('classifies the destructive dialog audit as bounded scanner work', () => {
    expect(
      diagnoseCiFailure(`
        FAIL tests/unit/design-system/destructive-confirm-dialog-audit.test.ts
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

  it('diagnoses post-admission restore pressure before the generic I/O class', () => {
    const diagnosis = diagnoseCiFailure(
      'runner_spawn_admission=blocked runner_failure_class=runner-io-pressure-post-admission io_full_avg10_pct=60.84 spawned_recently=true remaining_deficit=4'
    );

    expect(diagnosis.failureClass).toBe(
      'runner_io_pressure_post_admission_herd'
    );
    expect(diagnosis.rootCause).toContain('before restore I/O became visible');
    expect(diagnosis.remediation).toContain('one-runner-per-tick');
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

  it('diagnoses a shared Neon endpoint deleted while its workflow was active', () => {
    const diagnosis = diagnoseCiFailure(`
      Download Neon DB connection artifact: neon-db-connection-29202024722
      Mobile Overflow 390 connectivity failed: The requested endpoint could not be found
    `);

    expect(diagnosis.failureClass).toBe(
      'shared_neon_endpoint_reaped_while_active'
    );
    expect(diagnosis.rootCause).toContain('without proving');
    expect(diagnosis.remediation).toContain('completed workflow-run ownership');
  });

  it('does not infer active shared-branch deletion from an unrelated missing endpoint', () => {
    expect(
      diagnoseCiFailure('The requested endpoint could not be found')
        .failureClass
    ).toBe('unknown');
  });

  it('diagnoses attempt-blind Neon credentials selected by a rerun consumer', () => {
    const diagnosis = diagnoseCiFailure(`
      E2E Smoke (PR Fast Feedback) Run migrations (ephemeral Neon)
      Database connection attempt 11/12 failed with a transient Neon endpoint error. Retrying in 5s...
      Failed to connect to database: error: password authentication failed for user 'neondb_owner'
    `);

    expect(diagnosis.failureClass).toBe(
      'neon_shared_artifact_credential_mismatch'
    );
    expect(diagnosis.rootCause).toContain('run-id-only');
    expect(diagnosis.remediation).toContain('github.run_attempt');
    expect(diagnosis.remediation).toContain('fail closed');
  });

  it('does not infer rerun artifact drift from an attempt-bound artifact', () => {
    expect(
      diagnoseCiFailure(`
        Download Neon DB connection artifact
        name: neon-db-connection-29184792705-2
        password authentication failed for user 'neondb_owner'
      `).failureClass
    ).toBe('unknown');
  });

  it('does not infer shared-artifact drift from an unrelated password failure', () => {
    expect(
      diagnoseCiFailure(
        "password authentication failed for user 'neondb_owner'"
      ).failureClass
    ).toBe('unknown');
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

  it('diagnoses exact Neon HTTP 402 endpoint-capacity admission failures', () => {
    const diagnosis = diagnoseCiFailure(`
      Neon admission probe failed: HTTP status 402: You have exceeded the limit of concurrently active endpoints.
    `);

    expect(diagnosis.failureClass).toBe('neon_endpoint_capacity_admission');
    expect(diagnosis.rootCause).toContain('could not activate');
    expect(diagnosis.remediation).toContain('same branch');
    expect(diagnosis.remediation).toContain('SELECT 1');
  });

  it('diagnoses strict-workspace resolution failure in the real Neon probe', () => {
    const diagnosis = diagnoseCiFailure(`
      Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@neondatabase/serverless' imported from /home/runner/work/Jovie/Jovie/scripts/ci/probe-neon-branch.mjs
      Neon SELECT 1 failed with a non-capacity error; refusing to reap or retry.
    `);

    expect(diagnosis.failureClass).toBe(
      'neon_probe_workspace_dependency_resolution'
    );
    expect(diagnosis.rootCause).toContain('strict pnpm layout');
    expect(diagnosis.remediation).toContain('apps/web/package.json');
    expect(diagnosis.remediation).toContain('instead of hoisting');
  });

  it('does not infer the Neon probe class from an unrelated missing package', () => {
    expect(
      diagnoseCiFailure(`
        Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'other-package' imported from /home/runner/work/Jovie/Jovie/scripts/ci/probe-neon-branch.mjs
      `).failureClass
    ).toBe('unknown');
  });

  it.each([
    'You have exceeded the limit of concurrently active endpoints.',
    'HTTP status 402: payment required',
  ])('does not infer Neon endpoint capacity from a partial signature: %s', log => {
    expect(diagnoseCiFailure(log).failureClass).toBe('unknown');
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
