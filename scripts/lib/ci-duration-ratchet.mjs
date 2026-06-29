/**
 * CI Duration Ratchet — compatibility library.
 *
 * The duration ratchet keeps its schema v1 lockfile and public exports, while
 * delegating generic comparison/update concerns to scripts/lib/ratchet-core.mjs.
 */

import {
  buildRatchetUpdate,
  compareRatchet,
  RATCHET_DIRECTIONS,
} from './ratchet-core.mjs';

export const RATCHET_SCHEMA_VERSION = 1;

/**
 * Compute the p95 of an array of numbers.
 * Uses the nearest-rank method (ceiling of 0.95 × n, 1-indexed).
 * Returns 0 for empty arrays.
 */
export function computeP95(durations) {
  if (!Array.isArray(durations) || durations.length === 0) return 0;
  const sorted = [...durations].sort((a, b) => a - b);
  const index = Math.ceil(0.95 * sorted.length) - 1;
  return sorted[Math.max(0, index)];
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

export function durationRatchetToCore(baseline) {
  return {
    schemaVersion: 1,
    dimension: 'ci-duration',
    direction: RATCHET_DIRECTIONS.LOCK_DOWN,
    baseline: baseline.slo.p95GateSeconds,
    sampleSize: baseline.sampleSize ?? 0,
    updatedAt: baseline.updatedAt,
    policy: {
      marginFraction: baseline.slo.marginFraction,
      improveEpsilon: baseline.slo.improveEpsilon ?? 0,
      minSampleSize: baseline.slo.minSampleSize ?? 0,
      waiver: baseline.waiver ?? null,
    },
  };
}

export function coreRatchetToDuration(coreRatchet, currentBaseline) {
  return {
    ...currentBaseline,
    updatedAt: coreRatchet.updatedAt,
    sampleSize: coreRatchet.sampleSize ?? currentBaseline.sampleSize ?? 0,
    slo: { ...currentBaseline.slo, p95GateSeconds: coreRatchet.baseline },
  };
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
  const result = compareRatchet(
    measuredP95Seconds,
    durationRatchetToCore(baseline)
  );
  return {
    ok: result.ok,
    status: result.status,
    measuredP95Seconds: result.measured,
    baselineP95Seconds: result.baseline,
    ceilingSeconds: result.threshold,
    headroomSeconds: result.headroom,
    marginFraction: result.marginFraction,
    improvedBy: result.improvedBy,
    proposeNewBaseline: result.proposeNewBaseline,
    reason: result.reason,
  };
}

export function buildDurationRatchetUpdate(
  baseline,
  measuredP95Seconds,
  options = {}
) {
  const result = buildRatchetUpdate(
    durationRatchetToCore(baseline),
    { value: measuredP95Seconds, sampleSize: options.sampleSize },
    options
  );

  if (!result.ok) return result;

  return {
    ok: true,
    errors: [],
    updated: coreRatchetToDuration(result.updated, baseline),
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

  if (
    baseline.sampleSize !== undefined &&
    !Number.isInteger(baseline.sampleSize)
  ) {
    errors.push('sampleSize must be an integer when present');
  }

  return { ok: errors.length === 0, errors };
}
