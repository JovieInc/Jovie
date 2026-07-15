export type CiFailureClass =
  | 'bounded_source_scan_timeout'
  | 'golden_path_smoke_auth_contract'
  | 'neon_concurrency_key_collision'
  | 'test_fixture_import_timeout'
  | 'runner_process_exhaustion'
  | 'runner_host_pressure'
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
    failureClass: 'neon_concurrency_key_collision',
    matches: log => /neon-endpoint-pool--[0-3]\b/i.test(log),
    rootCause:
      'A job-level Neon concurrency key used github.job before runner assignment, where that property is null, collapsing distinct jobs into one empty-prefix pool group.',
    remediation:
      'Replace github.job in job-level concurrency with a stable literal job identifier and preserve the four-slot suffix hash.',
  },
  {
    failureClass: 'bounded_source_scan_timeout',
    matches: log =>
      /(?:analytics-metrics-layer-guard|touch-target-ratchet)\.test\.ts/i.test(
        log
      ) && /(?:test timed out|timeout).*?\b\d+\s*ms/is.test(log),
    rootCause:
      'A repository-wide source ratchet exceeded its bounded test timeout while scanning the source tree.',
    remediation:
      'Inspect the ratchet scanner for unbounded per-file filesystem work; do not classify this as runner EAGAIN or increase the test timeout.',
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
    failureClass: 'runner_process_exhaustion',
    matches: log =>
      /\bEAGAIN\b|ERR_WORKER_INIT_FAILED|resource temporarily unavailable/i.test(
        log
      ),
    rootCause:
      'The runner could not create a process or worker because process resources were exhausted.',
    remediation:
      'Reduce runner process pressure or retry on a healthy runner; do not modify the failing test based on this signature alone.',
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
