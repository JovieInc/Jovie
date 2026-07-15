export type CiFailureClass =
  | 'agent_gate_evidence_missing_without_producer'
  | 'gate_dependency_cache_timeout'
  | 'bounded_source_scan_timeout'
  | 'visual_qa_prune_timestamp_race'
  | 'golden_path_smoke_auth_contract'
  | 'layout_guard_contract_missing'
  | 'standalone_runtime_launcher_mismatch'
  | 'chat_composer_unsettled_entry_animation'
  | 'neon_endpoint_capacity_admission'
  | 'neon_probe_workspace_dependency_resolution'
  | 'neon_shared_artifact_credential_mismatch'
  | 'neon_concurrency_key_collision'
  | 'broken_profiler_fixture'
  | 'inconclusive_performance_timeout'
  | 'suite_wide_performance_regression'
  | 'broad_test_performance_regression'
  | 'isolated_stuck_test_regression'
  | 'test_fixture_import_timeout'
  | 'runner_slice_task_saturation'
  | 'runner_process_exhaustion'
  | 'runner_io_pressure_admission'
  | 'runner_host_pressure'
  | 'shared_neon_endpoint_reaped_while_active'
  | 'runner_image_proof_disk_exhaustion'
  | 'gbrain_ownership_preflight_latency_or_slug_drift'
  | 'unknown';

export interface CiFailureDiagnosis {
  readonly failureClass: CiFailureClass;
  readonly rootCause: string;
  readonly remediation: string;
}

const DIAGNOSES: ReadonlyArray<{
  readonly failureClass: Exclude<CiFailureClass, 'unknown'>;
  readonly matches: (log: string) => boolean;
  readonly rootCause: string;
  readonly remediation: string;
}> = [
  {
    failureClass: 'agent_gate_evidence_missing_without_producer',
    matches: log =>
      /(?:Verify Draft Agent PR|Require GStack gate evidence)/i.test(log) &&
      /Missing recorded gate evidence for:\s*gstack\.qa\.exhaustive,\s*gstack\.review,\s*gstack\.ship/i.test(
        log
      ),
    rootCause:
      'The draft-promotion workflow required exact-head GStack receipts, but no trusted producer recorded them before the deterministic evidence check ran.',
    remediation:
      'Do not blindly rerun the unchanged check or fabricate an artifact. Normally produce trusted exact-head QA, review, and ship evidence. Under explicit time-bounded CI-recovery authorization only, mark the reviewed PR ready before its next substantive push so this draft-only workflow safely skips while required CI remains authoritative.',
  },
  {
    failureClass: 'gate_dependency_cache_timeout',
    matches: log =>
      /complete job name:\s*CI Risk Classifier/i.test(log) &&
      /cache size:[^\n]*\bMB\b/i.test(log) &&
      /tar -xf[^\n]*cache\.tzst/i.test(log) &&
      /\bunzstd\b|use-compress-program/i.test(log) &&
      /(?:the operation was canceled|operation cancelled|job.+(?:3 minutes|timeout))/is.test(
        log
      ),
    rootCause:
      'The dependency-free CI Risk Classifier exhausted its three-minute job budget restoring and extracting the full pnpm dependency cache before classification started.',
    remediation:
      'Remove dependency restore, pnpm fetch, and pnpm install from dependency-free gates; run the native Node classifier directly instead of blindly rerunning the same cache extraction.',
  },
  {
    failureClass: 'runner_image_proof_disk_exhaustion',
    matches: log =>
      /exporting cache to client directory/i.test(log) &&
      /(?:no space left on device|ResourceExhausted)/i.test(log),
    rootCause:
      'The runner image itself built successfully, but exporting a duplicate local BuildKit cache exhausted the hosted runner disk.',
    remediation:
      'Use the GitHub Actions BuildKit cache backend for the second-build cache proof and upload only bounded text evidence instead of the build context or cache directory.',
  },
  {
    failureClass: 'gbrain_ownership_preflight_latency_or_slug_drift',
    matches: log =>
      /gbrain_ownership_preflight_latency_or_slug_drift/i.test(log),
    rootCause:
      'The ownership preflight could not resolve the canonical GBrain ledger inside its bounded deadline because the requested slug drifted, the CLI exceeded a nested or overall timeout, or the database session was unhealthy.',
    remediation:
      'Read coordination/agent-job-ledger first, preserve the 10s fail-closed ceiling, and use the receipt requested/resolved slug, engine/CLI/MCP latency, timeout tier, lookup health, and DB lock/session signals to repair the lookup path before retrying.',
  },
  {
    failureClass: 'golden_path_smoke_auth_contract',
    matches: log =>
      /E2E Smoke \(PR Fast Feedback\)/i.test(log) &&
      /export E2E_USE_TEST_AUTH_BYPASS=1/i.test(log) &&
      /golden-path\.spec\.ts/i.test(log) &&
      /(?:That code is incorrect|createFreshUserOnce|page\.waitForURL)/i.test(
        log
      ),
    rootCause:
      'The real-auth golden-path spec ran inside the bypass smoke lane, where E2E_TEST_MODE and the dedicated journey credentials are intentionally absent, so the Better Auth test code was rejected.',
    remediation:
      'Keep golden-path self-skipped whenever the smoke auth bypass is enabled and run the journey only in the dedicated Golden Path job, which supplies E2E_TEST_MODE and real-auth credentials.',
  },
  {
    failureClass: 'layout_guard_contract_missing',
    matches: log =>
      /::error::Layout Guard contract missing required spec: tests\/e2e\/[\w./-]+\.spec\.ts/i.test(
        log
      ) || /layout-overlap-guard\.spec\.ts not found [—-] skipping/i.test(log),
    rootCause:
      'The Layout Guard workflow referenced a deleted or absent Playwright contract and treated the missing test as a successful check.',
    remediation:
      'Restore the required deterministic Layout Guard manifest or update the workflow and its contract test together; never turn a missing required spec into success.',
  },
  {
    failureClass: 'standalone_runtime_launcher_mismatch',
    matches: log =>
      /"next start" does not work with "output: standalone"/i.test(log) &&
      /Failed to load external module require-in-the-middle-[a-z0-9]+/i.test(
        log
      ),
    rootCause:
      'A CI lane launched `next start` against an `output: standalone` artifact, so requests used the regular .next/server runtime instead of the traced standalone runtime and could not resolve its hash-shim packages.',
    remediation:
      'Launch .next/standalone/apps/web/server.js directly, fail closed when that entrypoint is absent or never becomes ready, and preserve the synced standalone runtime instead of reinstalling dependencies or blindly retrying.',
  },
  {
    failureClass: 'chat_composer_unsettled_entry_animation',
    matches: log => {
      const normalizedLog = log.replace(/(?:\u001b\[|\^\[\[)[0-9;]*m/g, '');
      const failureMatch = normalizedLog.match(
        /(?:^|\n)[^\n]*\d+\)\s+\[chromium\]\s+› tests\/e2e\/shell-chat-v1\.spec\.ts:\d+:\d+\s+› chat route picker opens without moving the shell or composer[\s\S]{0,4000}?Expected:\s*<=\s*1[\s\S]{0,1000}?Received:\s+([0-9]+(?:\.[0-9]+)?)/i
      );
      const receivedDelta = Number(failureMatch?.[1]);

      return (
        /E2E Smoke \(PR Fast Feedback\)/i.test(normalizedLog) &&
        Boolean(failureMatch) &&
        Number.isFinite(receivedDelta) &&
        receivedDelta > 1 &&
        receivedDelta <= 6 &&
        !/Composer shifted after entry animations settled/i.test(
          failureMatch?.[0] ?? ''
        )
      );
    },
    rootCause:
      'The Shell V1 geometry smoke captured its baseline while the 450ms chat-enter translateY(6px) entry animation was still running after its 160ms stagger delay; toBeVisible checks visibility, not animation completion.',
    remediation:
      'Wait for the centered composer getAnimations({ subtree: true }) promises to finish before the baseline boundingBox, retain the <=1px assertion, and keep the zero-width autosize measurement sentinel; do not raise the tolerance or retry.',
  },
  {
    failureClass: 'neon_endpoint_capacity_admission',
    matches: log =>
      /HTTP(?:[\s-]+status)?[\s:=-]*402\b/i.test(log) &&
      /You have exceeded the limit of concurrently active endpoints\./i.test(
        log
      ),
    rootCause:
      'The shared ephemeral Neon branch was created, but its database endpoint could not activate because the account had exhausted its concurrently active endpoint capacity.',
    remediation:
      'Preserve the same branch and connection artifact, run the proven-owner orphan reaper, and retry the SELECT 1 admission probe within a bounded budget; do not create another branch or publish an unproven connection artifact.',
  },
  {
    failureClass: 'neon_probe_workspace_dependency_resolution',
    matches: log =>
      /ERR_MODULE_NOT_FOUND/i.test(log) &&
      /Cannot find package ['"]@neondatabase\/serverless['"]/i.test(log) &&
      /scripts[\\/]ci[\\/]probe-neon-branch\.mjs/i.test(log),
    rootCause:
      'The repo-root Neon admission probe imported a dependency declared only by the apps/web workspace. Under the strict pnpm layout, Node resolved from the script directory and could not see the web workspace dependency.',
    remediation:
      'Load @neondatabase/serverless through createRequire anchored to apps/web/package.json, then run the real probe without DATABASE_URL and require it to reach its own environment validation instead of hoisting or reinstalling dependencies.',
  },
  {
    failureClass: 'neon_shared_artifact_credential_mismatch',
    matches: log => {
      const attemptBlindArtifact =
        /Download Neon DB connection artifact/i.test(log) &&
        /name:\s*neon-db-connection-\d+\b(?!-\d+)/i.test(log);
      const exhaustedConsumerMigration =
        /Run migrations \(ephemeral Neon\)/i.test(log) &&
        /Database connection attempt 11\/12 failed/i.test(log);

      return (
        (attemptBlindArtifact || exhaustedConsumerMigration) &&
        /password authentication failed for user ['"]neondb_owner['"]/i.test(
          log
        )
      );
    },
    rootCause:
      'A downstream migration exhausted its Neon connectivity retries because the shared connection artifact carried credentials that no longer authenticated; run-id-only artifact selection permits this drift on reruns.',
    remediation:
      'Bind the Neon connection artifact producer and every consumer to both github.run_id and github.run_attempt, then fail closed when the exact-attempt artifact is absent instead of retrying stale credentials.',
  },
  {
    failureClass: 'neon_concurrency_key_collision',
    matches: log => /neon-endpoint-pool--[0-3]\b/i.test(log),
    rootCause:
      'A job-level Neon concurrency key used github.job before runner assignment, where that property is null, collapsing distinct jobs into one empty-prefix pool group.',
    remediation:
      'Replace github.job in job-level concurrency with a stable literal job identifier and preserve the four-slot suffix hash.',
  },
  {
    failureClass: 'inconclusive_performance_timeout',
    matches: log =>
      /Test Performance Budgets/i.test(log) &&
      /Test suite failed:[\s\S]*signal=SIGTERM[\s\S]*(?:ETIMEDOUT|suite exceeded \d+ms)[\s\S]*classification=inconclusive-performance-timeout/i.test(
        log
      ),
    rootCause:
      'The bounded profiler timed out before producing complete Vitest evidence. The timeout alone cannot distinguish a real performance regression from runner or runtime drift, so it is not safe to retry or ignore without measurement.',
    remediation:
      'Run the exact representative suite printed after `remediation=` in the failed log. A repeatable slowdown indicates suite/test regression; a clean rerun points to runner/runtime drift. Do not change the 60s budget or retry blindly.',
  },
  {
    failureClass: 'broken_profiler_fixture',
    matches: log =>
      /Test Performance Budgets/i.test(log) &&
      /Test suite failed:[\s\S]*signal=SIGTERM[\s\S]*suite exceeded 420000ms/i.test(
        log
      ),
    rootCause:
      'The legacy profiler re-ran the entire ~1,900-file fast suite serially behind a fixed 420s timeout. Earlier runs converted that partial timeout output into false-green baselines; fail-closed behavior exposed the broken profiler fixture.',
    remediation:
      'Run the exact representative suite emitted by the bounded profiler and restore the 60s budget without raising it or retrying blindly.',
  },
  {
    failureClass: 'suite_wide_performance_regression',
    matches: log =>
      /Test Performance Budgets/i.test(log) &&
      /Total test duration \([^)]*ms\) exceeds threshold \(60000ms\)|Suite "full" duration \([^)]*ms\) exceeds budget \(60000ms\)/i.test(
        log
      ),
    rootCause:
      'The bounded representative suite completed with credible evidence but exceeded its 60s total-duration budget, indicating suite-wide execution or setup drift.',
    remediation:
      'Run the exact representative suite and profiler command from the job, identify the suite-wide setup or execution increase, and restore the 60s budget without raising it.',
  },
  {
    failureClass: 'broad_test_performance_regression',
    matches: log =>
      /Test Performance Budgets/i.test(log) &&
      /P95 test duration \([^)]*ms\) exceeds threshold \(200ms\)/i.test(log),
    rootCause:
      'At least five percent of the representative assertions exceeded the 200ms distribution target, so the slowdown is broad rather than an isolated scheduler outlier.',
    remediation:
      'Use the profiler slow-test report to optimize the recurring slow tail and restore p95 below 200ms; do not weaken the p95 target or treat the run as a single-test flake.',
  },
  {
    failureClass: 'isolated_stuck_test_regression',
    matches: log =>
      /Test Performance Budgets/i.test(log) &&
      /Max individual test duration \([^)]*ms\) exceeds threshold \(2000ms\):/i.test(
        log
      ),
    rootCause:
      'A named assertion exceeded the 2s absolute ceiling (10x the 200ms p95 target), which filters measured cap-10 scheduler noise while still detecting an isolated stuck test.',
    remediation:
      'Rerun and optimize the named assertion. Keep the 2s max ceiling and the 200ms p95 target unchanged; do not retry blindly or classify the isolated stall as harmless runner noise.',
  },
  {
    failureClass: 'visual_qa_prune_timestamp_race',
    matches: log =>
      /diff-artifacts\.test\.ts/i.test(log) &&
      /pruneCompletedVisualQaRuns\s*>\s*preserves candidates and stops pruning when activity, state, or current-run evidence changes/i.test(
        log
      ) &&
      /AssertionError:[\s\S]*completed-old[\s\S]*to deeply equal/i.test(log),
    rootCause:
      'Visual QA pruning revalidated only the run directory identity and newest millisecond mtime, so a late artifact created in the same timestamp tick could look unchanged and an active run could be deleted.',
    remediation:
      'Compare a sorted recursive entry fingerprint and entry count during revalidation, keep the deterministic same-mtime regression, and run the focused diff-artifacts suite; do not blindly rerun the unchanged shard.',
  },
  {
    failureClass: 'bounded_source_scan_timeout',
    matches: log =>
      /(?:analytics-metrics-layer-guard|touch-target-ratchet|destructive-confirm-dialog-audit|feature-flags-registry|arbitrary-values-ratchet|exp-drift-lint-guard)\.test\.ts/i.test(
        log
      ) &&
      /(?:test timed out|timeout).*?\b\d+\s*ms|spawnSync\s+\S+\s+ETIMEDOUT/is.test(
        log
      ),
    rootCause:
      'A source ratchet or nested lint scanner exceeded its bounded test timeout while traversing or analyzing the source tree.',
    remediation:
      'Inspect the scanner for repeated source reads, per-entry stat calls, or nested package-manager lint processes; do not classify this as runner EAGAIN or increase the test timeout.',
  },
  {
    failureClass: 'test_fixture_import_timeout',
    matches: log =>
      /FAIL\s+tests\/unit\/app\/hud-page\.test\.ts/i.test(log) &&
      /Error:\s*Test timed out in 5000ms/i.test(log),
    rootCause:
      'The HUD page test counted its cold dynamic module transform and import against the per-test timeout after resetting the module graph.',
    remediation:
      'Hoist the mocked HUD page import outside the timed test bodies and avoid resetting modules when the assertions do not require a fresh module graph.',
  },
  {
    failureClass: 'runner_slice_task_saturation',
    matches: log =>
      /runner_tasks_status=(?:warning|critical)/i.test(log) &&
      /runner_tasks_(?:current|max|ratio_pct)=/i.test(log),
    rootCause:
      'The self-hosted runner pool is approaching or has reached the systemd ci-runners.slice task ceiling.',
    remediation:
      'Run .github/runner-host/diagnose-capacity.sh and restore the versioned ci-runners.slice TasksMax contract before retrying CI.',
  },
  {
    failureClass: 'shared_neon_endpoint_reaped_while_active',
    matches: log =>
      /The requested endpoint could not be found/i.test(log) &&
      /(?:neon-db-connection|shared Neon (?:branch|artifact)|Download Neon DB connection artifact)/i.test(
        log
      ),
    rootCause:
      'A consumer downloaded the shared Neon connection artifact, but a concurrent legacy cleanup deleted that branch without proving its owning workflow had completed.',
    remediation:
      'Require completed workflow-run ownership proof immediately before every cleanup delete, fail closed for queued, active, or unavailable proof, then rerun the consumer against a newly admitted shared branch.',
  },
  {
    failureClass: 'runner_io_pressure_post_admission_herd',
    matches: log =>
      /runner_failure_class=runner-io-pressure-post-admission\b/i.test(log),
    rootCause:
      'Gem admitted runner work before restore I/O became visible, then a later admission sample detected full-pressure saturation and stopped the remaining cohort.',
    remediation:
      'Do not retry or add runners. Let admitted restores drain; the one-runner-per-tick budget and I/O hysteresis will resume scale-up only after pressure recovers.',
  },
  {
    failureClass: 'runner_io_pressure_admission',
    matches: log =>
      /runner_failure_class=runner-io-pressure(?:-unavailable)?\b/i.test(log) ||
      /runner_spawn_admission=blocked[^\n]*\bio_full_avg10_pct=/i.test(log),
    rootCause:
      'Gem runner scale-up was admission-blocked because Linux I/O full pressure reached the reviewed saturation threshold or PSI telemetry was unavailable.',
    remediation:
      'Do not retry or add runners. Let existing jobs drain, then verify /proc/pressure/io full avg10 stays below the recovery threshold before admission resumes.',
  },
  {
    failureClass: 'runner_process_exhaustion',
    matches: log =>
      /\bEAGAIN\b|ERR_WORKER_INIT_FAILED|resource temporarily unavailable/i.test(
        log
      ),
    rootCause:
      'The runner could not create a process or worker because process resources were exhausted.',
    remediation:
      'Run .github/runner-host/diagnose-capacity.sh to distinguish slice saturation from other host pressure; do not modify the failing test based on this signature alone.',
  },
  {
    failureClass: 'runner_host_pressure',
    matches: log =>
      /pressure stall information|\bPSI\b|sustained (?:cpu|memory|i\/o) pressure/i.test(
        log
      ),
    rootCause:
      'Runner pressure telemetry shows sustained host-level resource contention.',
    remediation:
      'Inspect runner capacity and workload concurrency before changing application or test code.',
  },
];

export function diagnoseCiFailure(log: string): CiFailureDiagnosis {
  const diagnosis = DIAGNOSES.find(candidate => candidate.matches(log));
  if (diagnosis) return diagnosis;

  return {
    failureClass: 'unknown',
    rootCause: 'No deterministic CI failure signature matched the failed log.',
    remediation:
      'Inspect the failed check and add a narrow diagnosis if it recurs.',
  };
}
