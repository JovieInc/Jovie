/**
 * CI Duration Ratchet — core library.
 *
 * Computes p95 wall-clock of recent PR merge-gate CI runs and checks whether
 * the measured value exceeds the committed baseline + margin.
 *
 * The ratchet lockfile lives at .github/ci-harness/duration-ratchet.json.
 * It is updated by scripts/ci-duration-ratchet.mjs (the CLI) and by the
 * nightly .github/workflows/ci-duration-ratchet.yml workflow when p95 improves.
 */

export const RATCHET_SCHEMA_VERSION = 1;

/**
 * Compute the p-th percentile of an array of numbers.
 * Uses the nearest-rank method (ceiling of (p/100) × n, 1-indexed).
 * `p` is a percentile in (0, 100]; values above 100 clamp to 100.
 * Returns 0 for empty/invalid input. Does not mutate the input.
 */
export function computePercentile(durations, p) {
  if (!Array.isArray(durations) || durations.length === 0) return 0;
  if (!Number.isFinite(p) || p <= 0) return 0;
  const pct = Math.min(100, p) / 100;
  const sorted = [...durations].sort((a, b) => a - b);
  const index = Math.ceil(pct * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Compute the p95 of an array of numbers (nearest-rank). Kept as a named
 * helper for the ratchet; equivalent to computePercentile(durations, 95).
 * Returns 0 for empty arrays.
 */
export function computeP95(durations) {
  return computePercentile(durations, 95);
}

/**
 * Format a duration in seconds as a human-readable string.
 * e.g. 905 → "15m 5s", 60 → "1m", 45 → "45s"
 */
export function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

/**
 * Check whether a measured p95 exceeds the ratchet ceiling.
 *
 * @param {number} measuredP95Seconds
 * @param {object} baseline - parsed duration-ratchet.json
 * @returns {{ ok: boolean, measuredP95Seconds: number, baselineP95Seconds: number,
 *             ceilingSeconds: number, headroomSeconds: number, marginFraction: number }}
 */
export function checkRatchet(measuredP95Seconds, baseline) {
  const baselineP95 = baseline.slo.p95GateSeconds;
  const margin = baseline.slo.marginFraction;
  const ceiling = baselineP95 * (1 + margin);
  const headroom = ceiling - measuredP95Seconds;
  return {
    ok: measuredP95Seconds <= ceiling,
    measuredP95Seconds,
    baselineP95Seconds: baselineP95,
    ceilingSeconds: ceiling,
    headroomSeconds: headroom,
    marginFraction: margin,
  };
}

/**
 * Compute wall-clock elapsed seconds between two ISO timestamp strings.
 * Clamps to 0 so negative values (clock skew) never produce nonsense.
 */
export function computeElapsedSeconds(startedAt, completedAt) {
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  return Math.max(0, (end - start) / 1000);
}

/**
 * Validate the structure of a duration-ratchet.json baseline object.
 * Returns { ok, errors }.
 */
export function validateDurationRatchet(baseline) {
  const errors = [];

  if (typeof baseline !== 'object' || baseline === null) {
    return { ok: false, errors: ['baseline must be a JSON object'] };
  }

  if (baseline.schemaVersion !== RATCHET_SCHEMA_VERSION) {
    errors.push(
      `schemaVersion must be ${RATCHET_SCHEMA_VERSION}; got ${baseline.schemaVersion}`
    );
  }

  if (!baseline.slo || typeof baseline.slo !== 'object') {
    errors.push('missing required key: slo');
  } else {
    if (
      typeof baseline.slo.p95GateSeconds !== 'number' ||
      baseline.slo.p95GateSeconds <= 0
    ) {
      errors.push('slo.p95GateSeconds must be a positive number');
    }
    if (
      typeof baseline.slo.marginFraction !== 'number' ||
      baseline.slo.marginFraction < 0
    ) {
      errors.push('slo.marginFraction must be a non-negative number');
    }
  }

  return { ok: errors.length === 0, errors };
}
