// Outcome coverage (Tim 2026-11-22: "nothing should be able to fail without a
// repair or a success"). Every workflow that runs with nobody watching
// (schedule, workflow_run, repository_dispatch, push to main) must report its
// outcome: a red run opens or updates one remediation issue and the next green
// resolves it. Pure functions; the gate is
// scripts/lib/__tests__/automation-liveness-outcome-coverage.test.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { load as yamlLoad } from 'js-yaml';
import { triggersOf } from './ci-trigger-registry.mjs';

export const BASELINE_PATH = 'canon/outcome-coverage-baseline.json';

/**
 * Ways a run reports its outcome. `# outcome-owner: <who>` names an owner
 * outside the workflow file (for example the rolling CI filer) and must say who.
 */
const REPORTERS = [
  /uses:\s*\.\/\.github\/actions\/report-outcome\b/,
  /REMEDIATION_MODE:\s*['"]?monitor\b/,
  /^#\s*outcome-owner:\s*\S/m,
];

const list = value =>
  value == null ? [] : Array.isArray(value) ? value : [value];

/** True when a push trigger can fire on main. */
function pushesMain(push) {
  if (push === null || push === undefined) return true;
  if (typeof push !== 'object') return true;
  const branches = list(push.branches);
  if (branches.length === 0) return list(push.tags).length === 0;
  return branches.some(b => b === 'main' || b === '**' || b === '*');
}

/**
 * Triggers that start a run with nobody watching the result.
 * @param {unknown} on parsed `on:` value
 * @returns {string[]}
 */
export function unattendedTriggers(on) {
  const out = triggersOf(on).filter(t =>
    /^(?:schedule|workflow_run|repository_dispatch)(?::|$)/.test(t)
  );
  const push =
    on && typeof on === 'object' && !Array.isArray(on)
      ? /** @type {Record<string, unknown>} */ (on).push
      : list(on).includes('push')
        ? null
        : undefined;
  // A push-to-main run of a PR gate is main CI, which main-red-eject and the
  // rolling CI filer already own; only post-merge jobs count here.
  const gate = triggersOf(on).some(t =>
    /^(?:pull_request|pull_request_target|merge_group)(?::|$)/.test(t)
  );
  if (push !== undefined && !gate && pushesMain(push)) out.push('push:main');
  return [...new Set(out)].sort();
}

/** @param {string} text workflow source */
export function reportsOutcome(text) {
  return REPORTERS.some(re => re.test(text));
}

/**
 * @param {string} root repo root
 * @returns {{file: string, triggers: string[], covered: boolean}[]}
 */
export function scanOutcomeCoverage(root) {
  const dir = path.join(root, '.github/workflows');
  return fs
    .readdirSync(dir)
    .filter(f => /\.ya?ml$/.test(f))
    .sort()
    .map(file => {
      const text = fs.readFileSync(path.join(dir, file), 'utf8');
      const parsed = /** @type {any} */ (yamlLoad(text) ?? {});
      return {
        file,
        triggers: unattendedTriggers(parsed.on),
        covered: reportsOutcome(text),
      };
    })
    .filter(row => row.triggers.length > 0);
}

/**
 * New gaps fail; baseline entries that are now covered or gone fail too, so
 * the list only shrinks and always names the real gaps.
 * @param {{file: string, covered: boolean}[]} rows
 * @param {string[]} baseline workflow files known to report nothing
 */
export function checkOutcomeCoverage(rows, baseline) {
  const known = new Set(baseline);
  const byFile = new Map(rows.map(row => [row.file, row]));
  const uncovered = rows.filter(row => !row.covered).map(row => row.file);
  return {
    newGaps: uncovered.filter(file => !known.has(file)),
    stale: [...known].filter(file => byFile.get(file)?.covered !== false),
  };
}

/** @param {string} root */
export function readOutcomeBaseline(root) {
  const raw = JSON.parse(
    fs.readFileSync(path.join(root, BASELINE_PATH), 'utf8')
  );
  return /** @type {string[]} */ (raw.uncovered ?? []);
}

/**
 * Stable remediation fingerprint for a workflow file:
 * `.github/workflows/visual-regression.yml` -> `workflow-visual-regression`.
 * @param {string} file
 */
export function outcomeFingerprint(file) {
  const stem = path
    .basename(String(file), path.extname(String(file)))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `workflow-${stem || 'unknown'}`;
}
