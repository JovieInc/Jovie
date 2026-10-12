import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const read = file => readFileSync(path.join(repoRoot, file), 'utf8');

test('Python workflows cache the pinned pytest dependency set', () => {
  for (const file of [
    '.github/workflows/ci.yml',
    '.github/workflows/actionlint.yml',
  ]) {
    const workflow = read(file);
    assert.match(workflow, /cache: pip/, `${file} must restore pip downloads`);
    assert.match(
      workflow,
      /cache-dependency-path: \.github\/requirements\/pytest\.txt/,
      `${file} cache key must follow the pinned requirements`
    );
  }
});

test('desktop packaging restores the immutable pnpm store', () => {
  const workflow = read('.github/workflows/desktop-release.yml');
  assert.match(workflow, /cache: pnpm/);
  assert.match(workflow, /cache-dependency-path: pnpm-lock\.yaml/);
});

test('Mac packaging lanes cache only Electron download artifacts', () => {
  for (const file of [
    '.github/workflows/macos-ci.yml',
    '.github/workflows/desktop-release.yml',
  ]) {
    const workflow = read(file);
    assert.match(workflow, /~\/Library\/Caches\/electron/);
    assert.match(workflow, /~\/Library\/Caches\/electron-builder/);
    assert.match(workflow, /runner\.os }}-electron-downloads-/);
  }
});

// #16737 replaced the runner-side `source/` checkout with the hosted
// `candidate/` repair checkout; the dependency store must follow its lockfile.
test('hosted repair restores the exact candidate dependency store', () => {
  const workflow = read('.github/workflows/rolling-ci-dispatch.yml');
  assert.match(workflow, /cache: pnpm/);
  assert.match(workflow, /cache-dependency-path: candidate\/pnpm-lock\.yaml/);
});

// pr-visual-review.yml is deliberately absent: its capture job runs
// PR-controlled code, and its trust-boundary contract
// (apps/web/tests/unit/ci/pr-visual-review-workflow.test.ts) forbids any
// actions/cache step there.
test('Chromium download steps restore a Playwright cache first', () => {
  for (const file of ['.github/workflows/screenshots.yml']) {
    const workflow = read(file);
    const cache = workflow.indexOf('Cache Playwright Browsers');
    const install = workflow.indexOf('playwright install');
    assert.ok(cache >= 0, `${file} must restore the browser cache`);
    assert.ok(install > cache, `${file} must restore before browser install`);
  }
});

// One owner for the hosted Chromium cache: .github/actions/setup-playwright
// keys it by Playwright version. A hand-rolled lockfile-hashed key saved one
// identical 260 MB entry per Dependabot lockfile and evicted merge-group
// workspaces (2026-10-10). Exceptions keep apt `--with-deps` for font-exact
// rendering, or run PR-controlled code where caches are forbidden.
const HAND_ROLLED_PLAYWRIGHT = new Map([
  ['agent-tick.yml', 'disabled_manually; deleted by #21442'],
  [
    'e2e-full-matrix.yml',
    'Firefox needs apt deps; Chromium already uses the shared action',
  ],
  ['ios-app-store-graphics.yml', 'App Store renders need system fonts'],
  [
    'marketing-certification-producer.yml',
    'certified captures need system fonts',
  ],
  ['pr-visual-review.yml', 'runs PR-controlled code; no actions/cache allowed'],
  ['screenshots.yml', 'committed screenshots need system fonts'],
]);

test('hosted Chromium setup goes through the shared setup-playwright action', () => {
  const dir = path.join(repoRoot, '.github/workflows');
  const handRolled = readdirSync(dir)
    .filter(file => /\.ya?ml$/.test(file))
    .filter(file =>
      /^\s*(?:-\s+)?run:.*playwright install/m.test(
        readFileSync(path.join(dir, file), 'utf8')
      )
    )
    .sort();
  // A subset, so deleting an exception workflow never turns this red.
  assert.deepEqual(
    handRolled.filter(file => !HAND_ROLLED_PLAYWRIGHT.has(file)),
    []
  );
  for (const file of [
    'canary-health-gate.yml',
    'nightly-tests.yml',
    'synthetic-monitoring.yml',
    'visual-a11y.yml',
  ]) {
    const workflow = read(`.github/workflows/${file}`);
    assert.match(
      workflow,
      /uses: \.\/\.github\/actions\/setup-playwright/,
      file
    );
    assert.doesNotMatch(workflow, /ms-playwright/, file);
  }
});
