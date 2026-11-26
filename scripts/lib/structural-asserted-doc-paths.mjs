/**
 * Scan structural suites for tracked markdown / rule paths they assert.
 * Used to keep structural-control-paths.ere complete for docs-only MQ skips
 * (JOV-12618): every existing asserted path must select structural.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '..', '..');

const LIT = new RegExp(
  String.raw`['"]((?:\.claude/rules/[^'"]+\.md)|(?:docs/[^'"]+\.md)|(?:(?:README|CONTRIBUTING|AGENTS|CLAUDE|CODEX|DESIGN|CHANGELOG|LESSONS|WORKFLOW)\.md)|(?:canon/[^'"]+\.md))['"]`,
  'g'
);
const JOIN = new RegExp(
  String.raw`(?:REPO_ROOT|ROOT|root|repo_root)\s*/\s*['"]([^'"]+\.md)['"]`,
  'g'
);

/** Path literals that structural suites mention but are fixtures / unwired. */
export const STRUCTURAL_ASSERTED_DOC_EXCLUSIONS = Object.freeze([
  // brand_scrub path-prefix policy uses synthetic docs/plans|ideation paths.
  'docs/idea-radar/feature-validation.md',
  'docs/ideation/market-notes.md',
  'docs/plans/competitor-analysis.md',
  'docs/plans/lyb-aesthetics-workout-tracker-validation.md',
  'docs/plans/some-analysis.md',
  // design_gate / doctor / lane_runner fixtures that are not tracked.
  'docs/design/briefs/pay.md',
  'docs/available.md',
  'docs/preserved.md',
  'docs/product/generated-notes.md',
  'docs/agents.md',
  'docs/readme.md',
  'docs/latest-pending.md',
  'docs/ordinary-reference.md',
  'summary.md',
  'SYNTHESIS.md',
  'canon/strategy/pricing.md',
  'canon/strategy/theses.md',
  // pytest exists but is not wired into structural CI (quality-gap only).
  'docs/ops/openai-symphony-burrito.md',
]);

function suiteFiles() {
  const files = new Set();
  const spf = readFileSync(
    join(REPO_ROOT, 'scripts/lib/ci-structural-pytest-files.mjs'),
    'utf8'
  );
  for (const match of spf.matchAll(/'([^']+\.py)'/g)) files.add(match[1]);
  for (const name of [
    'scripts/ci-fast-lanes.mjs',
    'scripts/lib/ci-structural-shards.mjs',
  ]) {
    const text = readFileSync(join(REPO_ROOT, name), 'utf8');
    for (const match of text.matchAll(
      /scripts\/(?:tests|prod-errors)\/test_[a-z0-9_]+\.py/g
    )) {
      files.add(match[0]);
    }
  }
  const unitCi = join(REPO_ROOT, 'apps/web/tests/unit/ci');
  for (const entry of readdirSync(unitCi)) {
    if (entry.endsWith('.ts')) files.add(`apps/web/tests/unit/ci/${entry}`);
  }
  return [...files].sort();
}

function trackedFiles() {
  return new Set(
    execFileSync('git', ['ls-files'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    }).split('\n')
  );
}

/**
 * @returns {{ path: string, suites: string[] }[]}
 */
export function scanStructuralAssertedDocPaths() {
  const tracked = trackedFiles();
  const excluded = new Set(STRUCTURAL_ASSERTED_DOC_EXCLUSIONS);
  /** @type {Map<string, Set<string>>} */
  const found = new Map();
  for (const rel of suiteFiles()) {
    let text;
    try {
      text = readFileSync(join(REPO_ROOT, rel), 'utf8');
    } catch {
      continue;
    }
    for (const re of [LIT, JOIN]) {
      re.lastIndex = 0;
      for (const match of text.matchAll(re)) {
        const path = match[1];
        if (excluded.has(path) || !tracked.has(path)) continue;
        if (!found.has(path)) found.set(path, new Set());
        found.get(path).add(rel);
      }
    }
  }
  return [...found.entries()]
    .map(([path, suites]) => ({ path, suites: [...suites].sort() }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function structuralControlPathsText() {
  return readFileSync(
    join(REPO_ROOT, '.github/ci-harness/structural-control-paths.ere'),
    'utf8'
  );
}

export function structuralControlPattern() {
  return structuralControlPathsText()
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .join('|');
}
