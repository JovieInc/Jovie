export type CiFailureClass =
  | 'bounded_source_scan_timeout'
  | 'broken_profiler_fixture'
  | 'inconclusive_performance_timeout'
  | 'suite_wide_performance_regression'
  | 'broad_test_performance_regression'
  | 'isolated_stuck_test_regression'
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
      /Test suite failed:[\s\S]*signal=SIGTERM[\s\S]*(?:ETIMEDOUT|suite exceeded 420000ms)/i.test(
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
