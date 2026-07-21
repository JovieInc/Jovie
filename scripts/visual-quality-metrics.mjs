#!/usr/bin/env node
/**
 * Visual-quality ratchet metrics collector (Phase 2/3).
 *
 * Tracks metrics from docs/VISUAL_TESTING_POLICY.md § Metrics & Ratchets:
 *   - % shared components with stories (up only) — from story-coverage-ratchet
 *   - % stories with interaction tests (up only)
 *   - Snapshot count telemetry (via chromatic-budget state)
 *   Placeholders for axe / flake / CLS / bypass counters (filled by CI later)
 *
 * Commands:
 *   node scripts/visual-quality-metrics.mjs measure
 *   node scripts/visual-quality-metrics.mjs check
 *   node scripts/visual-quality-metrics.mjs update
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { measureStoryCoverage } from './story-coverage-ratchet.mjs';
import { loadState as loadChromaticState, sumMonthUsage } from './chromatic-budget.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const BASELINE_PATH = join(REPO_ROOT, 'scripts/visual-quality-baseline.json');
const ATOMS_DIR = join(REPO_ROOT, 'packages/ui/atoms');
const WEB_STORIES_DIR = join(REPO_ROOT, 'apps/web/components');

const STORY_RE = /\.stories\.(tsx|ts|jsx|js)$/i;
const PLAY_RE = /\bplay\s*[:=]/;
const INTERACTION_IMPORT_RE =
  /@storybook\/(test|addon-interactions|testing-library)|userEvent|expect\(/;

function walkStories(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      walkStories(full, out);
    } else if (STORY_RE.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function storyHasInteraction(filePath) {
  const src = readFileSync(filePath, 'utf8');
  return PLAY_RE.test(src) || INTERACTION_IMPORT_RE.test(src);
}

export function measureVisualQuality() {
  const atomCoverage = measureStoryCoverage(ATOMS_DIR);
  const storyFiles = [
    ...walkStories(ATOMS_DIR),
    ...walkStories(WEB_STORIES_DIR),
  ].sort();
  const withInteraction = storyFiles.filter(storyHasInteraction).length;
  const interactionPercent =
    storyFiles.length === 0
      ? 0
      : Math.round((withInteraction / storyFiles.length) * 10000) / 100;

  const chromatic = loadChromaticState();
  const monthlySnapshots = sumMonthUsage(chromatic);

  return {
    schemaVersion: 1,
    measuredAt: new Date().toISOString(),
    atomStoryCoveragePercent: atomCoverage.percent,
    atomStoriesCovered: atomCoverage.covered,
    atomStoriesTotal: atomCoverage.total,
    storiesTotal: storyFiles.length,
    storiesWithInteraction: withInteraction,
    storiesWithInteractionPercent: interactionPercent,
    chromaticMonthlySnapshots: monthlySnapshots,
    chromaticMonthlyLimit: chromatic.monthlyLimit ?? 5000,
    // Placeholders — filled by CI collectors when available (lock_down).
    axeViolationsCritical: null,
    axeViolationsSerious: null,
    visualTestFlakeRate: null,
    escapedVisualBugs: null,
    clsRegressions: null,
    canonicalComponentBypasses: null,
  };
}

export function loadBaseline(path = BASELINE_PATH) {
  if (!existsSync(path)) {
    throw new Error(`baseline missing: ${path}`);
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function compareMetrics(measurement, baseline) {
  const failures = [];
  if (
    measurement.atomStoryCoveragePercent + 1e-9 <
    baseline.atomStoryCoveragePercent
  ) {
    failures.push(
      `atom story coverage ${measurement.atomStoryCoveragePercent}% < baseline ${baseline.atomStoryCoveragePercent}%`
    );
  }
  if (
    measurement.storiesWithInteractionPercent + 1e-9 <
    (baseline.storiesWithInteractionPercent ?? 0)
  ) {
    failures.push(
      `interaction-story % ${measurement.storiesWithInteractionPercent}% < baseline ${baseline.storiesWithInteractionPercent}%`
    );
  }
  return {
    ok: failures.length === 0,
    failures,
    measurement,
    baseline,
  };
}

function writeBaseline(measurement) {
  const payload = {
    schemaVersion: 1,
    updatedAt: measurement.measuredAt,
    atomStoryCoveragePercent: measurement.atomStoryCoveragePercent,
    storiesWithInteractionPercent: measurement.storiesWithInteractionPercent,
    note: 'lock_up ratchets for coverage metrics. Null counters are informational until CI collectors wire them.',
  };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

function main(argv = process.argv.slice(2)) {
  const cmd = argv[0] ?? 'measure';
  const measurement = measureVisualQuality();

  if (cmd === 'measure') {
    console.log(JSON.stringify(measurement, null, 2));
    return 0;
  }

  if (cmd === 'update') {
    const written = writeBaseline(measurement);
    console.log(
      `updated ${BASELINE_PATH}: atom=${written.atomStoryCoveragePercent}% interaction=${written.storiesWithInteractionPercent}%`
    );
    return 0;
  }

  if (cmd === 'check') {
    const baseline = loadBaseline();
    const result = compareMetrics(measurement, baseline);
    if (!result.ok) {
      console.error(result.failures.join('\n'));
      return 1;
    }
    console.log(
      `visual quality ok: atom stories ${measurement.atomStoryCoveragePercent}%, interaction ${measurement.storiesWithInteractionPercent}%`
    );
    return 0;
  }

  console.error(`unknown command: ${cmd}`);
  return 1;
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  process.exit(main());
}
