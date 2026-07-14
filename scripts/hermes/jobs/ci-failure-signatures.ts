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

export function classifyOperationalFailure(
  log: string
): OperationalFailureSignature | null {
  if (
    /(?:spawn|fork)[^\n]*\bEAGAIN\b/i.test(log) ||
    /runner_tasks_status=(?:warning|critical)/i.test(log)
  ) {
    return RUNNER_PROCESS_CAPACITY;
  }
  return null;
}
