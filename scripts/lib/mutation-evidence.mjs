// Independent ratchet metadata complements existing module identity and re-arms.
import { MIN_RATCHET_VALID } from './mutation-sweep.mjs';

const SHA = /^[a-f0-9]{40}$/u;
const isRun = value => Number.isSafeInteger(value) && value > 0;
const isDigest = value => typeof value === 'string' && value.length > 0;
/** @typedef {{ schemaVersion: 1, configDigest: string, score: number, valid: number, sha: string, at: string }} HighWater */
/** @typedef {{ status: 'pass' | 'regression' | 'unknown', ok: boolean | null, reason: string }} Verdict */
/** @typedef {Record<string, any>} EvidenceEntry */

/** Exact numeric measurement and source provenance, shared by anchors/proposals. */
function measured(row, minimum = 1) {
  return (
    row &&
    typeof row.score === 'number' &&
    Number.isFinite(row.score) &&
    row.score >= 0 &&
    row.score <= 100 &&
    isRun(row.valid) &&
    row.valid >= minimum &&
    typeof row.sha === 'string' &&
    SHA.test(row.sha) &&
    typeof row.at === 'string' &&
    Number.isFinite(Date.parse(row.at))
  );
}

/** @param {unknown} value @returns {value is HighWater} */
function isHighWater(value) {
  const row = /** @type {Partial<HighWater> | null} */ (value);
  return (
    row?.schemaVersion === 1 &&
    isDigest(row.configDigest) &&
    measured(row, MIN_RATCHET_VALID)
  );
}

/** A baseline fold can carry a newer module mark than the portable top map. */
export function strongerHighWater(stored, latest) {
  if (!isHighWater(stored)) return isHighWater(latest) ? latest : undefined;
  if (!isHighWater(latest) || stored.configDigest !== latest.configDigest)
    return stored;
  return latest.score > stored.score ? latest : stored;
}

/** @param {Verdict['status']} status @param {string} reason @returns {Verdict} */
const verdictFor = (status, reason) => ({
  status,
  ok: status === 'unknown' ? null : status === 'pass',
  reason,
});

/** Timeout at ordinal 10 with parkRuns=3 parks 11–13, retrying at 14.
 * @param {EvidenceEntry | undefined} entry @param {number} runId
 */
export function shouldPark(entry, runId) {
  return (
    isRun(runId) && isRun(entry?.retryAfterRun) && runId <= entry.retryAfterRun
  );
}

/** Preserve verified anchors across regressions and unscored attempts. Changed
 * configurations require reviewed controls before an anchor can be replaced.
 * @param {{ file: string, entry: EvidenceEntry, previous?: EvidenceEntry,
 *   baseline: { files: Record<string, { floor: number }> }, configDigest: string,
 *   runId: number, timedOut?: boolean, parkRuns?: number }} input
 * @returns {{ entry: EvidenceEntry, verdict: Verdict }}
 */
export function finalizeEvidenceEntry({
  file,
  entry,
  previous,
  baseline,
  configDigest,
  runId,
  timedOut = false,
  parkRuns = 3,
}) {
  if (!isRun(runId))
    throw new Error('mutation evidence requires a positive sweep ordinal');
  if (!Number.isSafeInteger(parkRuns) || parkRuns < 0)
    throw new Error('mutation timeout parkRuns must be a non-negative integer');
  const anchor = isHighWater(previous?.highWater) ? previous.highWater : null;
  if (anchor) entry.highWater = { ...anchor };
  else delete entry.highWater;
  delete entry.retryAfterRun;
  if (timedOut) entry.retryAfterRun = runId + parkRuns;
  const complete =
    !timedOut &&
    entry.status === 'scored' &&
    measured(entry) &&
    (entry.unknown ?? 0) === 0 &&
    entry.complete !== false &&
    isDigest(configDigest);
  const floor = baseline.files[file]?.floor;
  let verdict;
  if (!complete)
    verdict = verdictFor('unknown', 'incomplete mutation evidence');
  else if (typeof floor === 'number' && entry.score < floor)
    verdict = verdictFor('regression', `score ${entry.score} < floor ${floor}`);
  else if (anchor && anchor.configDigest !== configDigest)
    verdict = verdictFor(
      'unknown',
      'configuration changed; reviewed control evidence required'
    );
  else if (anchor && entry.score < anchor.score)
    verdict = verdictFor(
      'regression',
      `score ${entry.score} < high-water ${anchor.score}`
    );
  else if (entry.valid < MIN_RATCHET_VALID && typeof floor !== 'number')
    verdict = verdictFor('unknown', 'insufficient mutation sample');
  else {
    verdict = verdictFor(
      'pass',
      anchor
        ? 'high-water'
        : typeof floor === 'number'
          ? 'floor'
          : 'baseline established'
    );
    if (entry.valid >= MIN_RATCHET_VALID) {
      entry.highWater = {
        schemaVersion: 1,
        configDigest,
        score: entry.score,
        valid: entry.valid,
        sha: entry.sha,
        at: entry.at,
      };
    }
  }
  entry.evidence = {
    schemaVersion: 1,
    configDigest,
    runId,
    verdict: verdict.status,
    reason: verdict.reason,
  };
  return { entry, verdict };
}

/** Reviewable proposals require fresh passing evidence from this invocation.
 * @param {{ modules: Record<string, EvidenceEntry> }} state
 * @param {{ files: Record<string, { floor: number }> }} baseline
 * @param {{ runId: number, configDigest: string }} source
 */
export function proposeEvidenceFloors(
  state,
  baseline,
  { runId, configDigest }
) {
  /** @type {Record<string, { measured: number, floor: number, valid: number, runId: number, sha: string }>} */
  const proposals = {};
  if (!isRun(runId) || !isDigest(configDigest)) return proposals;
  for (const [file, entry] of Object.entries(state.modules)) {
    const evidence = entry.evidence;
    if (
      entry.status !== 'scored' ||
      !measured(entry, MIN_RATCHET_VALID) ||
      (entry.unknown ?? 0) !== 0 ||
      entry.complete === false ||
      evidence?.schemaVersion !== 1 ||
      evidence.verdict !== 'pass' ||
      evidence.runId !== runId ||
      evidence.configDigest !== configDigest ||
      !isHighWater(entry.highWater) ||
      entry.highWater.configDigest !== configDigest ||
      !['score', 'sha', 'at'].every(key => entry[key] === entry.highWater[key])
    )
      continue;
    const floor = Math.max(baseline.files[file]?.floor ?? 0, entry.score);
    if (!(floor > 0) || floor <= (baseline.files[file]?.floor ?? 0)) continue;
    proposals[file] = {
      measured: entry.score,
      floor,
      valid: entry.valid,
      runId,
      sha: entry.sha,
    };
  }
  return proposals;
}
