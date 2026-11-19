/**
 * Cheap-first ordering for the Source Validation guard pool (JOV-13111).
 *
 * Orders the selected guards by historical fail-probability ÷ duration so a
 * cheap guard that fails often reports first, instead of surfacing minutes
 * into the "Validate disk-read source contracts" step (3 sampled failures in
 * 2026-11 surfaced after 253-317s on a daily-changelog PR). This module only
 * reorders; callers keep run-all semantics — every selected guard still runs,
 * none is skipped or weakened.
 *
 * History lives in ./source-guard-history.json. Each entry records
 * `{ failures, runs, durationMs }` per guard id, refreshed offline from the
 * `[source-guards] <id>: exit <code>; duration_ms=<n>` receipt lines the
 * disk-read source-contracts step prints for every guard run.
 *
 * Deterministic fallback: an absent, unreadable, wrong-schema, or empty
 * ledger returns the guards in manifest order (the pre-JOV-13111 order), and
 * guards without a usable entry always keep their manifest order after the
 * guards that have one. The order is a pure function of the guard list and
 * the ledger, so the same inputs always sort the same way.
 */
import { readFileSync } from 'node:fs';

export const SOURCE_GUARD_HISTORY_SCHEMA = 'jovie.source-guard-history/v1';

const HISTORY_URL = new URL('./source-guard-history.json', import.meta.url);

/**
 * Guard-id → { failures, runs, durationMs? } from the committed ledger.
 * Returns null when the ledger is absent, unreadable, or has the wrong
 * schema — the deterministic fallback keeps manifest order.
 * `read` is injectable so tests can exercise the malformed fallbacks.
 */
export function loadSourceGuardHistory(
  read = path => readFileSync(path, 'utf8')
) {
  try {
    const parsed = JSON.parse(read(HISTORY_URL));
    if (
      parsed?.schema !== SOURCE_GUARD_HISTORY_SCHEMA ||
      !parsed.entries ||
      typeof parsed.entries !== 'object' ||
      Array.isArray(parsed.entries)
    )
      return null;
    return parsed.entries;
  } catch {
    return null;
  }
}

/** Score: fail-probability per second of guard duration (0 without data). */
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
  // Without a measured duration the score degrades to the fail-probability
  // alone — never to a fabricated duration.
  return durationSeconds > 0
    ? failProbability / durationSeconds
    : failProbability;
}

/**
 * Reorder guards: highest fail-probability ÷ duration first. Stable sort —
 * ties (including the no-data score of 0) keep manifest order.
 *
 * @template {{ id: string }} G
 * @param {readonly G[]} guards selected guards in manifest order
 * @param {Record<string, unknown> | null} entries ledger entries or null
 * @returns {G[]} ordered copy (same elements, same set, new order)
 */
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
