// Pure helpers for the rolling mutation sweep (scripts/mutation-sweep.mjs).
// State, survivor fingerprints and equivalent-mutant suppression live here so
// they are unit-testable without Stryker.

import { createHash } from 'node:crypto';
import { scoreMutants } from './mutation-diff.mjs';

export const STATE_SCHEMA_VERSION = 1;
/** Modules with fewer valid mutants than this are scored but never ratcheted. */
export const MIN_RATCHET_VALID = 30;
/** Survivors bundled into one work item (bounded "strengthen test" task). */
export const SURVIVORS_PER_TASK = 8;

/** @returns {{ schemaVersion: 1, modules: Record<string, ModuleState> }} */
export function emptyState() {
  return { schemaVersion: STATE_SCHEMA_VERSION, modules: {} };
}

/**
 * @typedef {Object} ModuleState
 * @property {string} blob git blob hash of the source when last scored
 * @property {string | null} sha commit the run tested
 * @property {string} at ISO timestamp of the run
 * @property {string} status scored | error | untested
 * @property {number | null} score
 * @property {number} valid
 * @property {number} killed
 * @property {number} survived
 * @property {number} durationMs
 * @property {number} [equivalent] survivors suppressed by the registry
 * @property {string} [error]
 */

/** @param {unknown} raw */
export function normalizeState(raw) {
  if (
    !raw ||
    typeof raw !== 'object' ||
    /** @type {{ schemaVersion?: unknown }} */ (raw).schemaVersion !==
      STATE_SCHEMA_VERSION ||
    typeof (/** @type {{ modules?: unknown }} */ (raw).modules) !== 'object'
  ) {
    return emptyState();
  }
  return /** @type {ReturnType<typeof emptyState>} */ (raw);
}

/**
 * Next modules to score. Priority: changed since the last scored blob (a stale
 * score is worth more than a first one), then never scored, then errored (retried after a day), then oldest first.
 * Unchanged modules are only re-scored after `staleDays`, because a score is a
 * pure function of source + tests and tests change slowly.
 * @param {ReturnType<typeof emptyState>} state
 * @param {{ file: string, blob: string, testCount: number }[]} candidates
 * @param {{ max: number, now?: number, staleDays?: number, priority?: Map<string, number> }} options
 */
export function pickBatch(
  state,
  candidates,
  { max, now = Date.now(), staleDays = 30, priority = new Map() }
) {
  const dayMs = 86_400_000;
  const ranked = [];
  for (const candidate of candidates) {
    const known = state.modules[candidate.file];
    let rank;
    if (!known) rank = 1;
    else if (known.blob !== candidate.blob) rank = 0;
    else if (known.status === 'error') {
      if (now - Date.parse(known.at) < dayMs) continue;
      rank = 2;
    } else if (now - Date.parse(known.at) >= staleDays * dayMs) rank = 3;
    else continue;
    ranked.push({
      candidate,
      rank,
      at: known ? Date.parse(known.at) : 0,
    });
  }
  // Within a rank: oldest run first, then the module with the most tests
  // (richest signal per mutation-minute is roughly test depth), then name.
  // Golden Path contract modules (higher traffic x risk first) outrank the
  // rest of the crawl; modules without a weight keep the rank order below.
  ranked.sort(
    (a, b) =>
      (priority.get(b.candidate.file) ?? 0) -
        (priority.get(a.candidate.file) ?? 0) ||
      a.rank - b.rank ||
      a.at - b.at ||
      b.candidate.testCount - a.candidate.testCount ||
      a.candidate.file.localeCompare(b.candidate.file)
  );
  return ranked.slice(0, max).map(entry => entry.candidate.file);
}

/** @param {string} text */
const sha1 = text => createHash('sha1').update(text).digest('hex');

/**
 * Stable survivor identity that survives line drift: file + mutator + the
 * original text it replaced + the replacement + the whitespace-normalized
 * source line. Line numbers are deliberately excluded.
 * @param {string} file
 * @param {{ mutatorName: string, replacement?: string, original: string, lineText: string }} mutant
 */
export function survivorFingerprint(file, mutant) {
  const norm = (/** @type {string} */ text) =>
    text.replace(/\s+/gu, ' ').trim();
  return sha1(
    [
      file,
      mutant.mutatorName,
      norm(mutant.original),
      norm(mutant.replacement ?? ''),
      norm(mutant.lineText),
    ].join('\u0000')
  ).slice(0, 16);
}

/**
 * @param {string} source
 * @param {{ line: number, column: number }} position 1-based line and column (Stryker)
 */
function offsetOf(source, position) {
  let offset = 0;
  const lines = source.split('\n');
  for (let index = 0; index < position.line - 1; index += 1) {
    offset += (lines[index] ?? '').length + 1;
  }
  return offset + position.column - 1; // Stryker columns are 1-based
}

/**
 * Survivors (Survived or NoCoverage) with the evidence an agent needs: the
 * original span, its replacement, and the surrounding lines.
 * @param {string} file apps/web-relative
 * @param {string} source module text
 * @param {{ id?: string, status: string, mutatorName: string, replacement?: string,
 *   location: { start: { line: number, column: number }, end: { line: number, column: number } } }[]} mutants
 */
export function extractSurvivors(file, source, mutants) {
  const lines = source.split('\n');
  /** @type {Survivor[]} */
  const out = [];
  for (const mutant of mutants) {
    if (mutant.status !== 'Survived' && mutant.status !== 'NoCoverage')
      continue;
    const { start, end } = mutant.location;
    const original = source.slice(
      offsetOf(source, start),
      offsetOf(source, end)
    );
    const lineText = lines[start.line - 1] ?? '';
    const from = Math.max(0, start.line - 4);
    const to = Math.min(lines.length, start.line + 3);
    out.push({
      fingerprint: survivorFingerprint(file, {
        mutatorName: mutant.mutatorName,
        replacement: mutant.replacement,
        original,
        lineText,
      }),
      file,
      line: start.line,
      status: mutant.status,
      mutator: mutant.mutatorName,
      original,
      replacement: mutant.replacement ?? '',
      context: lines
        .slice(from, to)
        .map((text, index) => `${from + index + 1}: ${text}`)
        .join('\n'),
    });
  }
  return out.sort(
    (a, b) => a.line - b.line || a.fingerprint.localeCompare(b.fingerprint)
  );
}

/**
 * @typedef {{ fingerprint: string, file: string, line: number, status: string,
 *   mutator: string, original: string, replacement: string, context: string }} Survivor
 */

/**
 * @param {unknown} raw parsed scripts/mutation-equivalents.json
 * @returns {string[]} validation errors
 */
export function validateEquivalents(raw) {
  /** @type {string[]} */
  const errors = [];
  const registry =
    /** @type {{ schemaVersion?: unknown, entries?: unknown }} */ (raw);
  if (!registry || typeof registry !== 'object')
    return ['registry must be an object'];
  if (registry.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!Array.isArray(registry.entries))
    return [...errors, 'entries must be an array'];
  const seen = new Set();
  for (const [index, entry] of registry.entries.entries()) {
    const row = /** @type {Record<string, unknown>} */ (entry ?? {});
    const where = `entries[${index}]`;
    if (typeof row.file !== 'string' || !row.file)
      errors.push(`${where}: file required`);
    if (
      typeof row.fingerprint !== 'string' ||
      !/^[0-9a-f]{16}$/u.test(row.fingerprint)
    ) {
      errors.push(`${where}: fingerprint must be 16 hex chars`);
    }
    if (typeof row.reason !== 'string' || row.reason.trim().length < 20) {
      errors.push(
        `${where}: reason must justify the equivalence (>= 20 chars)`
      );
    }
    if (typeof row.addedBy !== 'string' || !row.addedBy)
      errors.push(`${where}: addedBy required`);
    const key = `${row.file}:${row.fingerprint}`;
    if (seen.has(key)) errors.push(`${where}: duplicate ${key}`);
    seen.add(key);
  }
  return errors;
}

/**
 * Split survivors into real gaps and recorded equivalent mutants.
 * @param {Survivor[]} survivors
 * @param {{ entries: { file: string, fingerprint: string }[] }} registry
 */
export function partitionEquivalents(survivors, registry) {
  const suppressed = new Set(
    registry.entries.map(entry => `${entry.file}:${entry.fingerprint}`)
  );
  /** @type {Survivor[]} */
  const real = [];
  /** @type {Survivor[]} */
  const equivalent = [];
  for (const survivor of survivors) {
    (suppressed.has(`${survivor.file}:${survivor.fingerprint}`)
      ? equivalent
      : real
    ).push(survivor);
  }
  return { real, equivalent };
}

/** @param {string} file */
export function survivorsFingerprint(file) {
  return `mutation-survivors:${file}`;
}

/** Flattened label key (Linear keys: lowercase alphanumerics and hyphens). */
export function survivorsLabelKey(/** @type {string} */ file) {
  return `mutation-survivors-${file
    .replace(/[^a-zA-Z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .toLowerCase()}`;
}

/**
 * One bounded "strengthen test" work item per module: at most
 * SURVIVORS_PER_TASK survivors, each with the mutant diff as evidence.
 * @param {string} file
 * @param {Survivor[]} real
 * @param {{ score: number | null, valid: number, tests: string[], sha?: string | null, runUrl?: string | null, total?: number }} meta
 */
export function buildSurvivorIssue(file, real, meta) {
  const shown = real.slice(0, SURVIVORS_PER_TASK);
  const score = meta.score === null ? 'n/a' : `${meta.score}%`;
  const fp = survivorsFingerprint(file);
  /** @type {string[]} */
  const body = [
    `Rolling mutation sweep scored \`${file}\` at **${score}** (${meta.valid} valid mutants). ${real.length} surviving mutant(s) show behavior no test pins down.`,
    '',
    '**Task (bounded):** strengthen the tests so each mutant below is killed. Edit only test files next to the module (' +
      (meta.tests
        .slice(0, 3)
        .map(t => `\`${t}\``)
        .join(', ') || 'its tests') +
      '). Do not change production code, weaken assertions, or lower any floor. If a mutant is behavior-equivalent, add it to `scripts/mutation-equivalents.json` with a justification instead.',
    '',
    `Verify: \`node scripts/mutation-diff.mjs --scope all --files apps/web/${file}\` and confirm the listed survivors are Killed.`,
    meta.sha ? `Tested SHA: ${meta.sha}` : '',
    meta.runUrl ? `Run: ${meta.runUrl}` : '',
    '',
  ];
  for (const [index, survivor] of shown.entries()) {
    body.push(
      `### ${index + 1}. L${survivor.line} ${survivor.mutator} (${survivor.status}) \`${survivor.fingerprint}\``,
      '```diff',
      ...survivor.original.split('\n').map(text => `- ${text}`),
      ...(survivor.replacement || survivor.replacement === ''
        ? survivor.replacement.split('\n').map(text => `+ ${text}`)
        : []),
      '```',
      '```',
      survivor.context,
      '```',
      ''
    );
  }
  if (real.length > shown.length) {
    body.push(
      `${real.length - shown.length} more survivor(s) omitted; the next sweep re-files them after these are killed.`
    );
  }
  return {
    fingerprint: fp,
    title:
      `[${fp}] ${file}: ${real.length} surviving mutant(s), score ${score}`.slice(
        0,
        240
      ),
    description: body
      .filter((line, i, all) => line !== '' || all[i - 1] !== '')
      .join('\n'),
    priority: 4,
    labelKey: survivorsLabelKey(file),
  };
}

/**
 * Fold one scored module into state. Returns the new entry.
 * @param {ReturnType<typeof emptyState>} state
 * @param {string} file
 * @param {{ blob: string, sha: string | null, at: string, durationMs: number,
 *   mutants?: { status: string }[], equivalent?: number, error?: string }} run
 */
export function recordRun(state, file, run) {
  /** @type {ModuleState} */
  let entry;
  if (run.error || !run.mutants) {
    entry = {
      blob: run.blob,
      sha: run.sha,
      at: run.at,
      status: 'error',
      score: null,
      valid: 0,
      killed: 0,
      survived: 0,
      durationMs: run.durationMs,
      error: run.error ?? 'no mutants',
    };
  } else {
    const scored = scoreMutants(run.mutants);
    entry = {
      blob: run.blob,
      sha: run.sha,
      at: run.at,
      status: 'scored',
      score: scored.score,
      valid: scored.valid,
      killed: scored.detected,
      survived: scored.undetected,
      durationMs: run.durationMs,
      equivalent: run.equivalent ?? 0,
    };
  }
  state.modules[file] = entry;
  return entry;
}

/**
 * Rescore key for a module: its source blob plus the blobs of its same-stem
 * test files, so a test-only change (the survivor-kill case) is rescored and
 * can move the ratchet, not just a source change. Without tests the key is the
 * bare source blob.
 * @param {string} sourceBlob
 * @param {string[]} testBlobs
 */
export function moduleKey(sourceBlob, testBlobs) {
  if (!sourceBlob || testBlobs.length === 0) return sourceBlob;
  return createHash('sha1')
    .update([sourceBlob, ...[...testBlobs].sort()].join('\n'))
    .digest('hex');
}

/**
 * Ratchet verdict: a module regresses when its fresh score is under the
 * committed floor (baseline) or, with no floor, under the previous recorded
 * score by more than `slack` points while measured on enough mutants.
 * @param {string} file
 * @param {ModuleState} fresh
 * @param {ModuleState | undefined} previous
 * @param {{ files: Record<string, { floor: number }> }} baseline
 * @param {number} [slack]
 */
export function ratchetVerdict(file, fresh, previous, baseline, slack = 1) {
  if (fresh.status !== 'scored' || fresh.score === null)
    return { ok: true, reason: 'unscored' };
  const floor = baseline.files[file]?.floor;
  if (typeof floor === 'number') {
    return fresh.score >= floor
      ? { ok: true, reason: 'floor' }
      : { ok: false, reason: `score ${fresh.score} < floor ${floor}` };
  }
  if (fresh.valid < MIN_RATCHET_VALID)
    return { ok: true, reason: 'small-sample' };
  if (
    previous?.status === 'scored' &&
    previous.score !== null &&
    previous.valid >= MIN_RATCHET_VALID &&
    fresh.score < previous.score - slack
  ) {
    return {
      ok: false,
      reason: `score ${fresh.score} < previous ${previous.score}`,
    };
  }
  return { ok: true, reason: 'no-floor' };
}

/**
 * Proposed baseline additions: modules scored on >= MIN_RATCHET_VALID mutants
 * that have no floor yet (floor = measured - 1, the existing convention).
 * @param {ReturnType<typeof emptyState>} state
 * @param {{ files: Record<string, unknown> }} baseline
 * @param {{ runId: number, sha: string }} source
 */
export function proposeBaselineEntries(state, baseline, source) {
  /** @type {Record<string, { measured: number, floor: number, valid: number, runId: number, sha: string }>} */
  const out = {};
  for (const [file, entry] of Object.entries(state.modules)) {
    if (entry.status !== 'scored' || entry.score === null) continue;
    if (entry.valid < MIN_RATCHET_VALID || baseline.files[file]) continue;
    const floor = Math.round((entry.score - 1) * 10) / 10;
    if (!(floor > 0)) continue;
    out[file] = {
      measured: entry.score,
      floor,
      valid: entry.valid,
      runId: source.runId,
      sha: entry.sha ?? source.sha,
    };
  }
  return out;
}
