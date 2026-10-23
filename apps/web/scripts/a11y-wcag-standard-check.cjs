/**
 * Repo sweep for the WCAG 2.2 AA axe standard.
 *
 * Lives under `scripts/` so synchronous git and file reads stay outside the
 * request-path thread-blocking ratchet (JOV-INV-031). The runtime options
 * builder is `apps/web/lib/a11y-gates/wcag-standard.cjs`.
 */
const { execFileSync } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const {
  assertAllowlistFresh,
  legacyWcagTagCalls,
  loadWcag22AaTags,
} = require('../lib/a11y-gates/wcag-standard.cjs');

const TAG_SOURCE = 'apps/web/lib/a11y-gates/wcag-22-aa.ts';

function findRepoRoot(start) {
  let dir = start;
  for (let i = 0; i < 10; i += 1) {
    if (
      existsSync(join(dir, 'docs/ACCESSIBILITY.md')) &&
      existsSync(join(dir, 'apps/web'))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

const repoRoot = findRepoRoot(__dirname) || findRepoRoot(process.cwd());
if (!repoRoot) {
  throw new Error('a11y gate could not find the Jovie repo root');
}

function assertTagSourceMatchesRuntime() {
  const source = readFileSync(join(repoRoot, TAG_SOURCE), 'utf8');
  const block = source.match(
    /export const WCAG_22_AA_TAGS = \[([\s\S]*?)\] as const;/
  );
  if (!block) {
    throw new Error(`${TAG_SOURCE} is missing WCAG_22_AA_TAGS`);
  }
  const tags = [...block[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
  const runtime = loadWcag22AaTags();
  if (tags.join('\0') !== runtime.join('\0')) {
    throw new Error(`${TAG_SOURCE} tag list drifted from the runtime options`);
  }
}

function assertStorybookParameters() {
  const source = readFileSync(join(repoRoot, TAG_SOURCE), 'utf8');
  if (!source.includes("test: 'error'")) {
    throw new Error('Storybook a11y test mode must be error');
  }
  if (
    !source.includes("id: 'color-contrast'") ||
    !source.includes("id: 'target-size'")
  ) {
    throw new Error(
      'Storybook a11y parameters must enable contrast and target-size'
    );
  }
  const preview = readFileSync(
    join(repoRoot, 'apps/web/.storybook/preview.tsx'),
    'utf8'
  );
  if (
    !preview.includes("from '../lib/a11y-gates/wcag-22-aa.ts'") ||
    !preview.includes('a11y: STORYBOOK_A11Y_PARAMETERS')
  ) {
    throw new Error('Storybook preview must use the shared a11y parameters');
  }
}

function gitGrep(needle) {
  return execFileSync(
    'git',
    ['grep', '-n', '-I', '-e', needle, '--', 'apps/web', 'scripts'],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }
  );
}

function assertNoLegacyWcagTags() {
  let listed = '';
  try {
    listed = gitGrep('with' + 'Tags');
  } catch (error) {
    const status =
      typeof error === 'object' && error && 'status' in error
        ? error.status
        : undefined;
    if (status === 1) listed = '';
    else throw error;
  }
  const files = new Set();
  for (const line of listed.split('\n')) {
    if (!line) continue;
    files.add(line.slice(0, line.indexOf(':')));
  }
  const violations = [];
  for (const file of files) {
    const source = readFileSync(join(repoRoot, file), 'utf8');
    for (const call of legacyWcagTagCalls(source)) {
      violations.push(`${file}: ${call.replace(/\s+/g, ' ')}`);
    }
  }
  if (violations.length > 0) {
    throw new Error(
      `WCAG axe scans must call wcag22AaAxeOptions():\n${violations.join('\n')}`
    );
  }
  const levelATag = 'wcag22' + 'a';
  let bogus = '';
  try {
    bogus = gitGrep('wcag22');
  } catch (error) {
    const status =
      typeof error === 'object' && error && 'status' in error
        ? error.status
        : undefined;
    if (status === 1) bogus = '';
    else throw error;
  }
  const bogusHits = bogus
    .split('\n')
    .filter(line => new RegExp(`${levelATag}(?!a)`).test(line));
  if (bogusHits.length > 0) {
    throw new Error(
      `axe-core has no ${levelATag} tag:\n${bogusHits.join('\n')}`
    );
  }
}

const DOC_REQUIRED = [
  'WCAG 2.2 Level AA',
  'A11y (UI paths)',
  'target-size',
  'workflow_dispatch',
  'lint:touch-target',
  'not part of PR Ready',
  'not a required pull request check',
];

const DOC_FORBIDDEN = [
  'WCAG 2.1 Level AA',
  'No CI failures',
  'Runs in CI on every PR',
  'Phase 1: Baseline',
];

function assertAccessibilityDocs() {
  const doc = readFileSync(
    join(repoRoot, 'docs/ACCESSIBILITY.md'),
    'utf8'
  ).replace(/\s+/g, ' ');
  const missing = DOC_REQUIRED.filter(phrase => !doc.includes(phrase));
  const present = DOC_FORBIDDEN.filter(phrase => doc.includes(phrase));
  if (missing.length > 0 || present.length > 0) {
    throw new Error(
      `docs/ACCESSIBILITY.md drifted (missing: ${missing.join(', ') || 'none'}; forbidden: ${present.join(', ') || 'none'})`
    );
  }
}

function assertRepositoryWcagStandard() {
  assertAllowlistFresh();
  assertTagSourceMatchesRuntime();
  assertNoLegacyWcagTags();
  assertAccessibilityDocs();
  assertStorybookParameters();
}

if (require.main === module) {
  assertRepositoryWcagStandard();
  console.log('a11y wcag standard check passed');
}

module.exports = {
  assertNoLegacyWcagTags,
  assertAccessibilityDocs,
  assertStorybookParameters,
  assertRepositoryWcagStandard,
};
