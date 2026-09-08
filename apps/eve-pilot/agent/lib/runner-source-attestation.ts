/**
 * Runner-source attestation evaluator shared by Summer Gem-dark recovery and
 * the E1 observation gate. Keep the ≤600s freshness window authoritative —
 * do not weaken it here.
 */

/** Matches Symphony concurrency-controller evidence window (JOV-6163). */
export const RUNNER_SOURCE_ATTESTATION_MAX_AGE_MS = 600_000 as const;

export type RunnerSourceAttestationProbe =
  | {
      readonly status: 'fresh';
      readonly observedAt: string;
      readonly sourceRevision: string;
    }
  | {
      readonly status: 'unavailable';
      readonly reason:
        | 'missing'
        | 'invalid-schema'
        | 'stale'
        | 'unhealthy'
        | 'unbound-listener'
        | 'invalid-revision';
    };

/**
 * Evaluate a gem-service-attestation/v1 receipt the same way the concurrency
 * controller does: schema, active+healthy, port 4041 bound, and ≤600s fresh.
 * Does not weaken the 600s gate.
 */
export function evaluateRunnerSourceAttestation(
  receipt: unknown,
  nowMs: number = Date.now()
): RunnerSourceAttestationProbe {
  if (
    receipt == null ||
    typeof receipt !== 'object' ||
    Array.isArray(receipt)
  ) {
    return { status: 'unavailable', reason: 'missing' };
  }
  const value = receipt as Record<string, unknown>;
  if (value.schema !== 'gem-service-attestation/v1') {
    return { status: 'unavailable', reason: 'invalid-schema' };
  }
  const revision = value.sourceRevision;
  if (typeof revision !== 'string' || !/^[a-f0-9]{40}$/u.test(revision)) {
    return { status: 'unavailable', reason: 'invalid-revision' };
  }
  const observedAt = value.observedAt;
  if (typeof observedAt !== 'string') {
    return { status: 'unavailable', reason: 'invalid-schema' };
  }
  const observedMs = Date.parse(observedAt);
  if (!Number.isFinite(observedMs)) {
    return { status: 'unavailable', reason: 'invalid-schema' };
  }
  const ageMs = nowMs - observedMs;
  if (ageMs < 0 || ageMs > RUNNER_SOURCE_ATTESTATION_MAX_AGE_MS) {
    return { status: 'unavailable', reason: 'stale' };
  }
  if (value.active !== true || value.healthy !== true) {
    return { status: 'unavailable', reason: 'unhealthy' };
  }
  const listener = value.listener;
  if (
    listener == null ||
    typeof listener !== 'object' ||
    Array.isArray(listener) ||
    (listener as Record<string, unknown>).port !== 4041 ||
    (listener as Record<string, unknown>).boundToService !== true
  ) {
    return { status: 'unavailable', reason: 'unbound-listener' };
  }
  return { status: 'fresh', observedAt, sourceRevision: revision };
}
