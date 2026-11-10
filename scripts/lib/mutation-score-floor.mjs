import { readFileSync } from 'node:fs';
import { compareRatchet } from './ratchet-core.mjs';

const SHA_RE = /^[0-9a-f]{40}$/u;

/**
 * @param {string} file
 * @param {{ floor: number, valid: number }} entry
 */
export function mutationScoreRatchet(file, entry) {
  return {
    schemaVersion: 1,
    dimension: `mutation-score:${file}`,
    direction: 'lock_up',
    baseline: entry.floor,
    sampleSize: entry.valid,
    policy: {
      marginFraction: 0,
      improveEpsilon: 0,
      minSampleSize: 1,
      waiver: null,
    },
  };
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
export function validateMutationScoreBaseline(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return ['baseline must be a JSON object'];
  }
  const baseline = /** @type {Record<string, unknown>} */ (raw);
  /** @type {string[]} */
  const errors = [];
  if (baseline.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (baseline.direction !== 'lock_up')
    errors.push('direction must be lock_up');
  if (
    !baseline.files ||
    typeof baseline.files !== 'object' ||
    Array.isArray(baseline.files)
  ) {
    errors.push('files must be an object');
    return errors;
  }
  for (const [file, entry] of Object.entries(baseline.files)) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      errors.push(`${file}: entry must be an object`);
      continue;
    }
    const row = /** @type {Record<string, unknown>} */ (entry);
    const measured = row.measured;
    const floor = row.floor;
    const valid = row.valid;
    const runId = row.runId;
    const sha = row.sha;
    if (typeof measured !== 'number' || measured < 0 || measured > 100) {
      errors.push(`${file}: measured must be between 0 and 100`);
    }
    if (typeof floor !== 'number' || !(floor > 0) || floor > 100) {
      errors.push(`${file}: floor must be in (0, 100]`);
    }
    if (
      typeof measured === 'number' &&
      typeof floor === 'number' &&
      floor > measured
    ) {
      errors.push(`${file}: floor cannot exceed the measured score`);
    }
    if (typeof valid !== 'number' || !Number.isInteger(valid) || valid < 1) {
      errors.push(`${file}: valid must be a positive integer`);
    }
    if (typeof runId !== 'number' || !Number.isInteger(runId) || runId < 1) {
      errors.push(`${file}: runId must be a positive integer`);
    }
    if (typeof sha !== 'string' || !SHA_RE.test(sha)) {
      errors.push(`${file}: sha must be a 40-character commit`);
    }
    if (
      typeof floor === 'number' &&
      floor > 0 &&
      typeof valid === 'number' &&
      Number.isInteger(valid) &&
      valid > 0 &&
      typeof measured === 'number'
    ) {
      try {
        const comparison = compareRatchet(
          { value: measured, sampleSize: valid },
          mutationScoreRatchet(file, { floor, valid })
        );
        if (!comparison.ok) {
          errors.push(`${file}: measured score is below its floor`);
        }
      } catch (error) {
        errors.push(
          `${file}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }
  return errors;
}

/** @param {string} path */
export function loadMutationScoreBaseline(path) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(
      `Mutation score baseline is missing or unreadable at ${path}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
  const errors = validateMutationScoreBaseline(raw);
  if (errors.length > 0) {
    throw new Error(`Invalid mutation score baseline: ${errors.join('; ')}`);
  }
  return raw;
}

/**
 * @typedef {Object} MutationScoreVerdict
 * @property {boolean} enforced
 * @property {boolean} [ok]
 * @property {string} file
 * @property {number | null} score
 * @property {number} valid
 * @property {number} [floor]
 * @property {string} [status]
 */

/**
 * @param {string} file apps/web-relative
 * @param {number | null} score
 * @param {number} valid
 * @param {{ files: Record<string, { floor: number, valid: number }> }} baseline
 * @returns {MutationScoreVerdict}
 */
export function evaluateMutationScore(file, score, valid, baseline) {
  const entry = baseline.files[file];
  if (!entry) return { enforced: false, file, score, valid };
  if (typeof score !== 'number') {
    return {
      enforced: true,
      ok: false,
      file,
      score,
      valid,
      floor: entry.floor,
      status: 'regression',
    };
  }
  const comparison = compareRatchet(
    { value: score, sampleSize: valid },
    mutationScoreRatchet(file, entry)
  );
  return {
    enforced: true,
    ok: comparison.ok,
    file,
    score,
    valid,
    floor: entry.floor,
    status: comparison.status,
  };
}

/**
 * Floors may only rise. Removing a baselined file is a removal of the floor.
 * @param {{ files: Record<string, { floor: number }> }} next
 * @param {{ files: Record<string, { floor: number }> }} previous
 */
export function assertFloorsNotLowered(next, previous) {
  /** @type {string[]} */
  const errors = [];
  for (const [file, prior] of Object.entries(previous.files)) {
    const current = next.files[file];
    if (!current) {
      errors.push(`${file}: floor removed`);
      continue;
    }
    if (current.floor < prior.floor) {
      errors.push(`${file}: floor ${current.floor} is below ${prior.floor}`);
    }
  }
  if (errors.length > 0) {
    throw new Error(
      `Mutation score floors can only go up: ${errors.join('; ')}`
    );
  }
}
