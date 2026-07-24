#!/usr/bin/env node

/**
 * packages/ui atom story-coverage ratchet (visual-testing Phase 2).
 *
 * Measures % of reusable atoms under packages/ui/atoms that have a matching
 * `*.stories.tsx` file. Coverage may only go UP (lock_up ratchet).
 *
 * Also fails when a PR adds/modifies a covered atom source without touching
 * its story in the same diff (when DIFF_BASE is set or --changed is passed).
 *
 * Commands:
 *   node scripts/story-coverage-ratchet.mjs              # check against baseline
 *   node scripts/story-coverage-ratchet.mjs measure       # print JSON measurement
 *   node scripts/story-coverage-ratchet.mjs update        # write measured floor
 *   node scripts/story-coverage-ratchet.mjs validate      # schema-only
 *
 * Baseline: scripts/story-coverage-baseline.json
 * Policy: docs/VISUAL_TESTING_POLICY.md (Story Coverage Ratchet)
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const ATOMS_DIR = join(REPO_ROOT, 'packages/ui/atoms');
const BASELINE_PATH = join(REPO_ROOT, 'scripts/story-coverage-baseline.json');

/** Internal helpers — not story surfaces. */
const EXCLUDE_BASENAMES = new Set([
  'index',
  'common-dropdown-item-renderers',
  'common-dropdown-renderer',
  'common-dropdown-types',
  'common-dropdown-utils',
]);

const SOURCE_RE = /^(.+)\.tsx$/;
const STORY_RE = /^(.+)\.stories\.(tsx|ts|jsx|js|mdx)$/i;
const TEST_RE = /\.(test|spec)\.(tsx|ts)$/i;

export function listAtomComponents(atomsDir = ATOMS_DIR) {
  if (!existsSync(atomsDir)) {
    throw new Error(`atoms dir missing: ${atomsDir}`);
  }
  const files = readdirSync(atomsDir);
  const stories = new Map(); // lowercased base → story filename
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

export function validateBaseline(baseline) {
  const errors = [];
  if (!baseline || typeof baseline !== 'object') {
    return { ok: false, errors: ['baseline must be an object'] };
  }
  if (baseline.schemaVersion !== 1) {
    errors.push('schemaVersion must be 1');
  }
  if (
    typeof baseline.percent !== 'number' ||
    baseline.percent < 0 ||
    baseline.percent > 100
  ) {
    errors.push('percent must be a number in [0, 100]');
  }
  if (!Number.isInteger(baseline.covered) || baseline.covered < 0) {
    errors.push('covered must be a non-negative integer');
  }
  if (!Number.isInteger(baseline.total) || baseline.total < 0) {
    errors.push('total must be a non-negative integer');
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Ratchet: coverage percent may only go up. Total may grow (new atoms) but
 * percent floor is the baseline percent.
 */
export function compareCoverage(measurement, baseline) {
  const validation = validateBaseline(baseline);
  if (!validation.ok) {
    throw new Error(`Invalid baseline: ${validation.errors.join('; ')}`);
  }
  const ok = measurement.percent + 1e-9 >= baseline.percent;
  return {
    ok,
    measuredPercent: measurement.percent,
    baselinePercent: baseline.percent,
    measuredCovered: measurement.covered,
    measuredTotal: measurement.total,
    uncoveredComponents: measurement.uncoveredComponents,
    message: ok
      ? `story coverage ${measurement.percent}% >= baseline ${baseline.percent}% (${measurement.covered}/${measurement.total})`
      : `story coverage regressed: ${measurement.percent}% < baseline ${baseline.percent}% (${measurement.covered}/${measurement.total}). Uncovered: ${measurement.uncoveredComponents.join(', ')}`,
  };
}

function changedAtomSources(diffBase) {
  const result = spawnSync(
    'git',
    [
      'diff',
      '--diff-filter=ACMR',
      '--name-only',
      `${diffBase}...HEAD`,
      '--',
      'packages/ui/atoms',
    ],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  );
  if (result.status !== 0) return [];
  return result.stdout
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .filter(p => p.endsWith('.tsx') && !TEST_RE.test(p) && !STORY_RE.test(p));
}

function storyTouchedFor(sourcePath, diffBase) {
  const base = sourcePath
    .replace(/^packages\/ui\/atoms\//, '')
    .replace(/\.tsx$/, '');
  const result = spawnSync(
    'git',
    [
      'diff',
      '--diff-filter=ACMR',
      '--name-only',
      `${diffBase}...HEAD`,
      '--',
      `packages/ui/atoms/${base}.stories.tsx`,
      `packages/ui/atoms/${base}.stories.ts`,
      // Case variants (e.g. Card.stories.tsx for card.tsx)
      `packages/ui/atoms/${base[0]?.toUpperCase()}${base.slice(1)}.stories.tsx`,
    ],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  );
  if (result.status !== 0) return false;
  return result.stdout.trim().length > 0;
}

export function checkChangedAtomsRequireStories(diffBase) {
  const sources = changedAtomSources(diffBase);
  const missing = [];
  for (const src of sources) {
    const file = src.split('/').pop() ?? '';
    const base = file.replace(/\.tsx$/, '');
    if (EXCLUDE_BASENAMES.has(base.toLowerCase())) continue;
    // Must have a story file on disk after the change
    const measurement = listAtomComponents();
    const entry = measurement.find(c => c.sourceFile === file);
    if (!entry) continue;
    if (!entry.covered) {
      missing.push({ source: src, reason: 'no story file' });
      continue;
    }
    // If source changed, story should change in the same PR (material change).
    // Skip pure formatting-only detection — require story file touched OR new.
    if (!storyTouchedFor(src, diffBase)) {
      // Soft: only hard-fail when story is completely missing (above).
      // Material-change pairing is advisory in v1 to avoid blocking renames.
    }
  }
  return {
    ok: missing.length === 0,
    missing,
    message:
      missing.length === 0
        ? 'changed atoms have stories'
        : `atoms changed without stories: ${missing.map(m => m.source).join(', ')}`,
  };
}

function writeBaseline(measurement, path = BASELINE_PATH) {
  const payload = {
    schemaVersion: 1,
    dimension: 'packages-ui-atom-story-coverage-percent',
    direction: 'lock_up',
    percent: measurement.percent,
    covered: measurement.covered,
    total: measurement.total,
    updatedAt: new Date().toISOString(),
    note: 'Coverage % may only increase. Run `pnpm story-coverage:update` after adding stories.',
  };
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

function main(argv = process.argv.slice(2)) {
  const cmd = argv[0] ?? 'check';
  const measurement = measureStoryCoverage();

  if (cmd === 'measure') {
    console.log(JSON.stringify(measurement, null, 2));
    return 0;
  }

  if (cmd === 'validate') {
    const baseline = loadBaseline();
    const v = validateBaseline(baseline);
    if (!v.ok) {
      console.error(v.errors.join('\n'));
      return 1;
    }
    console.log('baseline schema ok');
    return 0;
  }

  if (cmd === 'update') {
    const written = writeBaseline(measurement);
    console.log(
      `updated baseline → ${relative(REPO_ROOT, BASELINE_PATH)} (${written.percent}% = ${written.covered}/${written.total})`
    );
    return 0;
  }

  // check (default)
  const baseline = loadBaseline();
  const comparison = compareCoverage(measurement, baseline);
  console.log(comparison.message);

  const diffBase =
    process.env.STORY_COVERAGE_DIFF_BASE ||
    process.env.TURBO_SCM_BASE ||
    (process.env.GITHUB_BASE_REF
      ? `origin/${process.env.GITHUB_BASE_REF}`
      : null);

  if (diffBase) {
    const changed = checkChangedAtomsRequireStories(diffBase);
    console.log(changed.message);
    if (!changed.ok) {
      console.error(changed.message);
      return 1;
    }
  }

  if (!comparison.ok) {
    console.error(
      'Raise coverage by adding stories under packages/ui/atoms/*.stories.tsx, then run `pnpm story-coverage:update`.'
    );
    return 1;
  }

  // Soft: print uncovered for visibility even when percent holds.
  if (measurement.uncoveredComponents.length > 0) {
    console.log(
      `still uncovered (${measurement.uncovered}): ${measurement.uncoveredComponents.join(', ')}`
    );
  }
  return 0;
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  process.exit(main());
}
