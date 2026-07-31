#!/usr/bin/env node

/**
 * Multi-root story-coverage ratchet (JOV-4421 / visual-testing Phase 2+).
 *
 * Measures % of shippable components under each coverage root that have a
 * matching adjacent `*.stories.tsx` file. Coverage may only go UP (lock_up).
 * New uncovered components fail even when percent holds via denominator tricks.
 *
 * Commands:
 *   node scripts/story-coverage-ratchet.mjs              # check against baseline
 *   node scripts/story-coverage-ratchet.mjs measure       # print JSON measurement
 *   node scripts/story-coverage-ratchet.mjs update        # write measured floors
 *   node scripts/story-coverage-ratchet.mjs validate      # schema-only
 *
 * Baseline: scripts/story-coverage-baseline.json
 * Rollout: docs/UI_STORY_COVERAGE_ROLLOUT.md
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COVERAGE_ROOTS,
  EXCLUDE_BASENAMES,
  listComponentsInRoot,
  measureAllRoots,
  measureRootCoverage,
  REPO_ROOT,
} from './component-ship-policy.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ATOMS_DIR = join(REPO_ROOT, 'packages/ui/atoms');
const BASELINE_PATH = join(REPO_ROOT, 'scripts/story-coverage-baseline.json');

const SOURCE_RE = /^(.+)\.tsx$/;
const STORY_RE = /^(.+)\.stories\.(tsx|ts|jsx|js|mdx)$/i;
const TEST_RE = /\.(test|spec)\.(tsx|ts)$/i;

/** @deprecated Prefer listComponentsInRoot — kept for existing unit tests. */
export function listAtomComponents(atomsDir = ATOMS_DIR) {
  if (!existsSync(atomsDir)) {
    throw new Error(`atoms dir missing: ${atomsDir}`);
  }
  const files = readdirSync(atomsDir);
  const stories = new Map();
  for (const name of files) {
    const m = name.match(STORY_RE);
    if (m) stories.set(m[1].toLowerCase(), name);
  }

  const components = [];
  for (const name of files) {
    if (TEST_RE.test(name) || STORY_RE.test(name)) continue;
    const m = name.match(SOURCE_RE);
    if (!m) continue;
    const base = m[1];
    if (EXCLUDE_BASENAMES.has(base.toLowerCase())) continue;
    const storyFile = stories.get(base.toLowerCase()) ?? null;
    components.push({
      component: base,
      sourceFile: name,
      storyFile,
      covered: Boolean(storyFile),
    });
  }
  components.sort((a, b) => a.component.localeCompare(b.component));
  return components;
}

/** @deprecated Prefer measureRootCoverage / measureAllRoots. */
export function measureStoryCoverage(atomsDir = ATOMS_DIR) {
  const components = listAtomComponents(atomsDir);
  const total = components.length;
  const covered = components.filter(c => c.covered).length;
  const percent = total === 0 ? 100 : (covered / total) * 100;
  return {
    total,
    covered,
    uncovered: total - covered,
    percent: Math.round(percent * 100) / 100,
    uncoveredComponents: components
      .filter(c => !c.covered)
      .map(c => c.component),
    components,
  };
}

export function loadBaseline(path = BASELINE_PATH) {
  if (!existsSync(path)) {
    throw new Error(`baseline missing: ${path}`);
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Normalize v1 (atoms-only) baseline into v2 multi-root shape for comparison.
 */
export function normalizeBaseline(baseline) {
  if (!baseline || typeof baseline !== 'object') {
    return { ok: false, errors: ['baseline must be an object'], baseline: null };
  }
  if (baseline.schemaVersion === 2 && baseline.roots) {
    return { ok: true, errors: [], baseline };
  }
  if (baseline.schemaVersion === 1) {
    // Legacy atoms-only baseline — map to packages/ui/atoms only; other roots
    // get floor 0 until first update.
    const roots = {};
    for (const root of COVERAGE_ROOTS) {
      if (root === 'packages/ui/atoms') {
        roots[root] = {
          percent: baseline.percent,
          covered: baseline.covered,
          total: baseline.total,
          uncovered: Math.max(0, (baseline.total ?? 0) - (baseline.covered ?? 0)),
        };
      } else {
        roots[root] = { percent: 0, covered: 0, total: 0, uncovered: 0 };
      }
    }
    return {
      ok: true,
      errors: [],
      baseline: {
        schemaVersion: 2,
        direction: 'lock_up',
        roots,
        updatedAt: baseline.updatedAt ?? null,
        note: baseline.note,
      },
    };
  }
  return {
    ok: false,
    errors: ['schemaVersion must be 1 or 2'],
    baseline: null,
  };
}

export function validateBaseline(baseline) {
  const normalized = normalizeBaseline(baseline);
  if (!normalized.ok) {
    return { ok: false, errors: normalized.errors };
  }
  const b = normalized.baseline;
  const errors = [];
  if (b.direction && b.direction !== 'lock_up') {
    errors.push('direction must be lock_up');
  }
  if (!b.roots || typeof b.roots !== 'object') {
    errors.push('roots must be an object');
  } else {
    for (const [root, entry] of Object.entries(b.roots)) {
      if (typeof entry.percent !== 'number' || entry.percent < 0 || entry.percent > 100) {
        errors.push(`${root}: percent must be in [0, 100]`);
      }
      if (!Number.isInteger(entry.covered) || entry.covered < 0) {
        errors.push(`${root}: covered must be a non-negative integer`);
      }
      if (!Number.isInteger(entry.total) || entry.total < 0) {
        errors.push(`${root}: total must be a non-negative integer`);
      }
    }
  }
  return { ok: errors.length === 0, errors, baseline: b };
}

/**
 * Ratchet per root: percent may only go up; uncovered count may only go down
 * (blocks denominator tricks at 0%).
 */
export function compareRootCoverage(measurement, baselineEntry, root) {
  const baselinePercent = baselineEntry?.percent ?? 0;
  const baselineUncovered =
    baselineEntry?.uncovered ??
    Math.max(0, (baselineEntry?.total ?? 0) - (baselineEntry?.covered ?? 0));

  const percentOk = measurement.percent + 1e-9 >= baselinePercent;
  const uncoveredOk = measurement.uncovered <= baselineUncovered + 1e-9;
  const ok = percentOk && uncoveredOk;

  let message;
  if (ok) {
    message = `${root}: ${measurement.percent}% >= ${baselinePercent}% (${measurement.covered}/${measurement.total}, uncovered ${measurement.uncovered} <= ${baselineUncovered})`;
  } else if (!percentOk) {
    message = `${root}: story coverage regressed ${measurement.percent}% < baseline ${baselinePercent}% (${measurement.covered}/${measurement.total})`;
  } else {
    message = `${root}: uncovered count rose ${measurement.uncovered} > baseline ${baselineUncovered} (new components need stories)`;
  }

  return {
    ok,
    root,
    measuredPercent: measurement.percent,
    baselinePercent,
    measuredUncovered: measurement.uncovered,
    baselineUncovered,
    measuredCovered: measurement.covered,
    measuredTotal: measurement.total,
    uncoveredComponents: measurement.uncoveredComponents,
    message,
  };
}

export function compareCoverage(measurement, baseline) {
  // Back-compat: single-root atoms measurement shape
  if (
    measurement &&
    typeof measurement.percent === 'number' &&
    !measurement.roots
  ) {
    const validation = validateBaseline(baseline);
    if (!validation.ok) {
      throw new Error(`Invalid baseline: ${validation.errors.join('; ')}`);
    }
    const atomBaseline =
      validation.baseline.roots?.['packages/ui/atoms'] ?? {
        percent: baseline.percent,
        covered: baseline.covered,
        total: baseline.total,
        uncovered: Math.max(0, (baseline.total ?? 0) - (baseline.covered ?? 0)),
      };
    const result = compareRootCoverage(measurement, atomBaseline, 'packages/ui/atoms');
    return {
      ok: result.ok,
      measuredPercent: result.measuredPercent,
      baselinePercent: result.baselinePercent,
      measuredCovered: result.measuredCovered,
      measuredTotal: result.measuredTotal,
      uncoveredComponents: result.uncoveredComponents,
      message: result.message,
      roots: [result],
    };
  }

  const validation = validateBaseline(baseline);
  if (!validation.ok) {
    throw new Error(`Invalid baseline: ${validation.errors.join('; ')}`);
  }
  const b = validation.baseline;
  const rootResults = [];
  for (const root of COVERAGE_ROOTS) {
    const m = measurement.roots?.[root] ?? measureRootCoverage(root);
    const entry = b.roots[root] ?? {
      percent: 0,
      covered: 0,
      total: 0,
      uncovered: 0,
    };
    rootResults.push(compareRootCoverage(m, entry, root));
  }
  const failed = rootResults.filter(r => !r.ok);
  const ok = failed.length === 0;
  return {
    ok,
    roots: rootResults,
    message: ok
      ? `story coverage ok across ${rootResults.length} roots`
      : `story coverage failed:\n${failed.map(f => f.message).join('\n')}`,
  };
}

function writeBaseline(measurement, path = BASELINE_PATH) {
  const roots = {};
  for (const root of COVERAGE_ROOTS) {
    const m = measurement.roots[root];
    roots[root] = {
      percent: m.percent,
      covered: m.covered,
      total: m.total,
      uncovered: m.uncovered,
    };
  }
  const payload = {
    schemaVersion: 2,
    direction: 'lock_up',
    updatedAt: new Date().toISOString(),
    note: 'Coverage % and uncovered floors may only improve. Run `pnpm story-coverage:update` after adding stories. New components without stories fail even if % holds.',
    roots,
  };
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

function main(argv = process.argv.slice(2)) {
  const cmd = argv[0] ?? 'check';
  const measurement = measureAllRoots();

  if (cmd === 'measure') {
    // Compact summary for humans + full JSON
    const summary = Object.fromEntries(
      Object.entries(measurement.roots).map(([root, m]) => [
        root,
        {
          percent: m.percent,
          covered: m.covered,
          total: m.total,
          uncovered: m.uncovered,
        },
      ])
    );
    console.log(JSON.stringify({ ...measurement, roots: summary }, null, 2));
    return 0;
  }

  if (cmd === 'validate') {
    const baseline = loadBaseline();
    const v = validateBaseline(baseline);
    if (!v.ok) {
      console.error(v.errors.join('\n'));
      return 1;
    }
    console.log('baseline schema ok (v2 multi-root)');
    return 0;
  }

  if (cmd === 'update') {
    const written = writeBaseline(measurement);
    console.log(
      `updated baseline → ${relative(REPO_ROOT, BASELINE_PATH)} (schema v2, ${Object.keys(written.roots).length} roots)`
    );
    for (const [root, entry] of Object.entries(written.roots)) {
      console.log(
        `  ${root}: ${entry.percent}% (${entry.covered}/${entry.total}, uncovered ${entry.uncovered})`
      );
    }
    return 0;
  }

  // check (default)
  const baseline = loadBaseline();
  const comparison = compareCoverage(measurement, baseline);
  for (const root of comparison.roots ?? []) {
    console.log(root.message);
  }
  if (!comparison.ok) {
    console.error(comparison.message);
    console.error(
      'Add adjacent *.stories.tsx for uncovered components, then run `pnpm story-coverage:update` if floors should rise.'
    );
    return 1;
  }
  console.log(comparison.message);
  return 0;
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  process.exit(main());
}

export {
  listComponentsInRoot,
  measureAllRoots,
  measureRootCoverage,
  COVERAGE_ROOTS,
};
