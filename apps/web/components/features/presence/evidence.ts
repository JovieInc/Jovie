import type { ConnectionStatus, PresenceCheckEvidence } from './types';
export const PRESENCE_STALE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

export function isPresenceObservationStale(
  observedAt: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!observedAt) return false;
  const observed = Date.parse(observedAt);
  if (Number.isNaN(observed)) return false;
  return now.getTime() - observed > PRESENCE_STALE_AFTER_MS;
}

export function latestPresenceObservation(
  observations: readonly string[]
): string | null {
  return observations.reduce<string | null>(
    (latest, value) =>
      latest === null || Date.parse(value) > Date.parse(latest)
        ? value
        : latest,
    null
  );
}

/** Shared measured-evidence policy. Missing sources never imply health or a zero. */
export function evaluatePresenceChecks(
  checks: readonly {
    readonly label: string;
    readonly evidence: PresenceCheckEvidence;
  }[],
  now: Date = new Date()
): ConnectionStatus {
  const measured = checks.flatMap(({ label, evidence }) =>
    evidence.state === 'measured' ? [{ label, check: evidence }] : []
  );
  const failing = measured.filter(({ check }) => check.outcome === 'fail');
  const warning = measured.filter(({ check }) => check.outcome === 'warn');

  if (failing.length > 0) {
    return {
      label: 'Needs Review',
      tone: 'error',
      needsAttention: true,
      sortPriority: 0,
      nextAction: `Fix the failing ${failing
        .map(({ label }) => label)
        .join(', ')} check.`,
    };
  }
  if (warning.length > 0) {
    return {
      label: 'Needs Attention',
      tone: 'warning',
      needsAttention: true,
      sortPriority: 1,
      nextAction: `Review the ${warning
        .map(({ label }) => label)
        .join(', ')} check.`,
    };
  }
  if (measured.length === 0) {
    return {
      label: 'Unconfigured',
      tone: 'neutral',
      needsAttention: false,
      sortPriority: 3,
      nextAction: 'No monitoring source reports on this page yet.',
    };
  }
  if (
    isPresenceObservationStale(
      latestPresenceObservation(measured.map(({ check }) => check.checkedAt)),
      now
    )
  ) {
    return {
      label: 'Stale',
      tone: 'warning',
      needsAttention: true,
      sortPriority: 1,
      nextAction: 'The last check is older than two weeks.',
    };
  }
  if (measured.length < checks.length) {
    return {
      label: 'Partially Measured',
      tone: 'neutral',
      needsAttention: false,
      sortPriority: 2,
      nextAction: 'Measured checks pass. Some sources are unconfigured.',
    };
  }
  return {
    label: 'Healthy',
    tone: 'success',
    needsAttention: false,
    sortPriority: 2,
    nextAction: 'No action needed.',
  };
}
