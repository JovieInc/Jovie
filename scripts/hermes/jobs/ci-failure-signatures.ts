export interface OperationalFailureSignature {
  readonly id: string;
  readonly category: string;
  readonly rootCause: string;
  readonly remediation: string;
}

const RUNNER_PROCESS_CAPACITY: OperationalFailureSignature = {
  id: 'runner-process-capacity',
  category: 'dependency-or-environment-drift',
  rootCause:
    'A self-hosted runner exhausted its systemd slice task ceiling; Node worker spawn returned EAGAIN.',
  remediation:
    'Run .github/runner-host/diagnose-capacity.sh and restore the versioned ci-runners.slice TasksMax contract before retrying CI.',
};

const RUNNER_IO_PRESSURE: OperationalFailureSignature = {
  id: 'runner-io-pressure',
  category: 'dependency-or-environment-drift',
  rootCause:
    'Gem runner scale-up was admission-blocked because Linux I/O full pressure reached the reviewed saturation threshold.',
  remediation:
    'Do not retry or add runners. Let existing jobs drain, then verify /proc/pressure/io full avg10 stays below the recovery threshold before admission resumes.',
};

export function classifyOperationalFailure(
  log: string
): OperationalFailureSignature | null {
  if (
    /runner_failure_class=runner-io-pressure(?:-unavailable)?\b/i.test(log) ||
    /runner_spawn_admission=blocked[^\n]*\bio_full_avg10_pct=/i.test(log)
  ) {
    return RUNNER_IO_PRESSURE;
  }
  if (
    /(?:spawn|fork)[^\n]*\bEAGAIN\b/i.test(log) ||
    /runner_tasks_status=(?:warning|critical)/i.test(log)
  ) {
    return RUNNER_PROCESS_CAPACITY;
  }
  return null;
}
