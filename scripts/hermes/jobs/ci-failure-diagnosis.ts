export type CiFailureClass =
  | 'bounded_source_scan_timeout'
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
