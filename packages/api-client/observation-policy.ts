/** Pure budget-window reconciliation, mirrored by scripts/apiclient/policy.py. */
import type { Observation } from './headers.ts';
import type { Bucket } from './policy.ts';

/** An observation without a reset time is trusted this long. */
export const UNTIMED_OBSERVATION_MS = 60_000;

export function mergeObservation(
  current: Bucket | undefined,
  obs: Observation,
  nowMs: number,
  conservative: boolean
): Bucket | null {
  if (
    current?.resetAt != null &&
    obs.resetAt !== null &&
    obs.resetAt < current.resetAt - 1000
  )
    return null; // a response from an older window arrived late
  const retain =
    conservative &&
    current &&
    (obs.resetAt === null ||
      current.resetAt === null ||
      current.resetAt === obs.resetAt) &&
    nowMs < (current.resetAt ?? current.observedAt + UNTIMED_OBSERVATION_MS);
  const resetAt =
    retain && obs.resetAt === null ? current.resetAt : obs.resetAt;
  return {
    limit: obs.limit ?? current?.limit ?? null,
    remaining: retain
      ? Math.min(current.remaining, obs.remaining)
      : obs.remaining,
    resetAt,
    observedAt: retain && resetAt === null ? current.observedAt : nowMs,
  };
}
