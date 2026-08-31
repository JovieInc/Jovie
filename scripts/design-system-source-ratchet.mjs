#!/usr/bin/env node
/**
 * Cheap source-PR growth gate for apps/web design-system count ratchets
 * (JOV-5301). Filesystem scan only — no Vitest, no e2e.
 *
 * Growth of arbitrary Tailwind values or `--linear-*` usage is always a
 * regression and must fail source `PR Ready` so the PR cannot enroll and
 * UNMERGEABLE an ALLGREEN group. Unbaselined shrink is authorship debt for
 * the unit tests (JOV-5300); this lane does not fail it.
 *
 * Counters and scan roots must stay locked to:
 *   apps/web/tests/unit/design-system/arbitrary-values-ratchet.test.ts
 *   apps/web/tests/unit/design-system/linear-namespace-ratchet.test.ts
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(THIS_DIR, '..');
export const CHECK_COMMAND = 'pnpm design:source-count-ratchet';
export const ARBITRARY_BASELINE_RELATIVE =
  'apps/web/tests/unit/design-system/arbitrary-values.baseline.json';
export const LINEAR_BASELINE_RELATIVE =
  'apps/web/tests/unit/design-system/linear-namespace.baseline.json';

// Locked to arbitrary-values-ratchet.test.ts
export const ARBITRARY_VALUE_PATTERN =
  /\b[a-z][a-z0-9]*(?:-[a-z0-9]+)*-\[[^\]]+\]/gi;
export const ARBITRARY_SCAN_DIRS = Object.freeze(['components', 'app']);
const ARBITRARY_SOURCE_EXT = /\.(tsx|ts)$/;

// Locked to linear-namespace-ratchet.test.ts
export const LINEAR_NAMESPACE_PATTERN = /--linear-[a-z0-9-]+/g;
export const LINEAR_SCAN_DIRS = Object.freeze(['app', 'components', 'styles']);
const LINEAR_SOURCE_EXT = /\.(tsx|ts|css)$/;
const LINEAR_SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.turbo',
  'generated',
]);
const LINEAR_TEST_FILE = /\.test\.[tj]sx?$/;

function isFiniteCount(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function walkArbitraryFiles(dir, out) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      walkArbitraryFiles(full, out);
    } else if (ARBITRARY_SOURCE_EXT.test(entry.name)) {
      out.push(full);
    }
  }
}

function walkLinearFiles(dir, out) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      if (LINEAR_SKIP_DIRS.has(entry)) continue;
      walkLinearFiles(full, out);
    } else if (LINEAR_SOURCE_EXT.test(entry) && !LINEAR_TEST_FILE.test(entry)) {
      out.push(full);
    }
  }
}

export function countArbitraryValues(webRoot) {
  const files = [];
  for (const dir of ARBITRARY_SCAN_DIRS) {
    walkArbitraryFiles(join(webRoot, dir), files);
  }
  files.sort((left, right) => left.localeCompare(right));
  let total = 0;
  for (const file of files) {
    const matches = readFileSync(file, 'utf8').match(ARBITRARY_VALUE_PATTERN);
    if (matches) total += matches.length;
  }
  return total;
}

export function countLinearNamespaceUsage(webRoot) {
  const files = [];
  for (const dir of LINEAR_SCAN_DIRS) {
    walkLinearFiles(join(webRoot, dir), files);
  }
  const tailwindConfig = join(webRoot, 'tailwind.config.js');
  if (existsSync(tailwindConfig)) files.push(tailwindConfig);

  let count = 0;
  const perFile = new Map();
  for (const file of files) {
    const matches = readFileSync(file, 'utf8').match(LINEAR_NAMESPACE_PATTERN);
    if (matches && matches.length > 0) {
      count += matches.length;
      perFile.set(relative(webRoot, file), matches.length);
    }
  }
  return { count, perFile };
}

function readBaselineCount(baselinePath) {
  if (!existsSync(baselinePath)) {
    throw new Error(`missing baseline ${baselinePath}`);
  }
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  if (!isFiniteCount(baseline?.count)) {
    throw new Error(
      `baseline ${baselinePath} must declare a finite numeric "count"`
    );
  }
  return baseline.count;
}

/**
 * Growth-only verdict. Unbaselined shrink is not a source-enrollment failure.
 *
 * @param {{ repoRoot?: string, webRoot?: string }} [options]
 */
export function evaluateDesignSystemSourceRatchet(options = {}) {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const webRoot = options.webRoot ?? join(repoRoot, 'apps/web');
  const metrics = [
    {
      id: 'arbitrary-values',
      metric: 'arbitrary Tailwind values',
      baselinePath: ARBITRARY_BASELINE_RELATIVE,
      count: countArbitraryValues(webRoot),
      baseline: readBaselineCount(join(repoRoot, ARBITRARY_BASELINE_RELATIVE)),
    },
    {
      id: 'linear-namespace',
      metric: '--linear-* usage',
      baselinePath: LINEAR_BASELINE_RELATIVE,
      count: countLinearNamespaceUsage(webRoot).count,
      baseline: readBaselineCount(join(repoRoot, LINEAR_BASELINE_RELATIVE)),
    },
  ];

  const issues = [];
  for (const metric of metrics) {
    if (metric.count > metric.baseline) {
      issues.push(
        `${metric.metric} grew: ${metric.count} > baseline ${metric.baseline} (${metric.baselinePath}). ` +
          'Use the canonical tokens instead of adding new debt, or justify a floor raise in review.'
      );
    }
  }

  return {
    ok: issues.length === 0,
    metrics,
    issues,
  };
}

function main() {
  const result = evaluateDesignSystemSourceRatchet();
  const summary = result.metrics
    .map(metric => `${metric.metric} ${metric.count}/${metric.baseline}`)
    .join(', ');
  if (!result.ok) {
    console.error(`[design-system-source-ratchet] FAIL — ${summary}`);
    for (const issue of result.issues) console.error(issue);
    process.exitCode = 1;
    return;
  }
  console.log(`[design-system-source-ratchet] PASS — ${summary}`);
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  main();
}
