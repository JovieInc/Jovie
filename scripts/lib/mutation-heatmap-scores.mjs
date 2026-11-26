// Merge live Stryker reports with the committed mutation-score baseline so the
// coverage heatmap Mut column is never blank for floors we already measured.
// Live Stryker wins on conflict. Baseline keys are apps/web-relative.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scoreMutants } from './mutation-score-math.mjs';

export const WEB_ROOT = 'apps/web';
export const DEFAULT_STRYKER_REL = 'apps/web/reports/stryker-incremental.json';
export const DEFAULT_BASELINE_REL = 'scripts/mutation-score-baseline.json';

/**
 * Live Stryker scores use the same contract as mutation floors: exclude
 * CompileError from the denominator, and skip a file when unknown statuses
 * (Timeout / Ignored / Pending / …) make the score incomplete so baseline
 * floors can fill the gap instead of understating Mut.
 * @param {string} filePath
 * @returns {Record<string, number> | null}
 */
export function scoresFromStrykerReport(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf8'));
    if (!raw || typeof raw !== 'object' || !raw.files) return null;
    /** @type {Record<string, number>} */
    const scores = {};
    for (const [file, payload] of Object.entries(raw.files)) {
      const mutants = payload?.mutants ?? [];
      if (!Array.isArray(mutants) || mutants.length === 0) continue;
      const scored = scoreMutants(mutants);
      if (scored.score == null) continue;
      scores[normalizeRepoWebPath(file)] = scored.score;
    }
    return Object.keys(scores).length > 0 ? scores : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} filePath
 * @returns {Record<string, number> | null}
 */
export function scoresFromMutationBaseline(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf8'));
    if (!raw || typeof raw !== 'object' || !raw.files) return null;
    /** @type {Record<string, number>} */
    const scores = {};
    for (const [file, entry] of Object.entries(raw.files)) {
      const measured = entry?.measured;
      if (typeof measured !== 'number' || Number.isNaN(measured)) continue;
      scores[normalizeRepoWebPath(file)] = Math.round(measured);
    }
    return Object.keys(scores).length > 0 ? scores : null;
  } catch {
    return null;
  }
}

/**
 * Prefer live Stryker; fill gaps from the committed baseline floors.
 * @param {{
 *   strykerPath?: string,
 *   baselinePath?: string,
 *   repoRoot?: string,
 * }} [options]
 * @returns {Record<string, number> | null}
 */
export function readMutationHeatmapScores(options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd();
  const strykerPath =
    options.strykerPath ?? join(repoRoot, DEFAULT_STRYKER_REL);
  const baselinePath =
    options.baselinePath ?? join(repoRoot, DEFAULT_BASELINE_REL);

  const live = scoresFromStrykerReport(strykerPath);
  const baseline = scoresFromMutationBaseline(baselinePath);
  if (!live && !baseline) return null;
  return { ...(baseline ?? {}), ...(live ?? {}) };
}

/**
 * Normalize apps/web-relative, repo-relative, or absolute paths to
 * `apps/web/...` so they match listSurfaceFiles() output.
 * @param {string} file
 * @returns {string}
 */
export function normalizeRepoWebPath(file) {
  const normalized = String(file).replaceAll('\\', '/');
  const marker = `/${WEB_ROOT}/`;
  const idx = normalized.lastIndexOf(marker);
  if (idx !== -1) {
    return normalized.slice(idx + 1);
  }
  if (normalized.startsWith(`${WEB_ROOT}/`)) {
    return normalized;
  }
  return `${WEB_ROOT}/${normalized.replace(/^\.\//u, '')}`;
}
