/**
 * Source-guard scheduling order for ci-fast-lanes: highest failure
 * probability per second of runtime first, from the guard history ledger.
 */

/** Fail-probability per second. 0 without usable runs. */
function guardFailureScore(entry) {
  const runs = Number(entry?.runs);
  const failures = Number(entry?.failures);
  if (
    !Number.isInteger(runs) ||
    runs <= 0 ||
    !Number.isInteger(failures) ||
    failures < 0
  )
    return 0;
  const failProbability = Math.min(failures / runs, 1);
  const durationMs = Number(entry?.durationMs);
  const durationSeconds =
    Number.isFinite(durationMs) && durationMs > 0 ? durationMs / 1000 : 0;
  // No measured duration keeps the fail-probability. Never invent a duration.
  return durationSeconds > 0
    ? failProbability / durationSeconds
    : failProbability;
}

/** Stable reorder: higher score first, ties keep manifest order. */
export function orderSourceGuardsByFailureRate(guards, entries) {
  if (!entries) return [...guards];
  return guards
    .map((guard, index) => ({
      guard,
      index,
      score: guardFailureScore(entries[guard?.id]),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(item => item.guard);
}
