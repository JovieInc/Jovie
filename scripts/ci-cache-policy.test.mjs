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

// Font-exact producers keep Chromium's apt system packages through the shared
// action's system_deps input, not `playwright install --with-deps`, which ran
// apt-get update against one Ubuntu mirror on every run (DNS failures,
// 2026-11-11). pr-visual-review.yml runs PR-controlled code, so it only
// restores caches there and never saves one.
test('font-exact producers install system packages through setup-playwright', () => {
  for (const file of [
    'marketing-certification-producer.yml',
    'pr-visual-review.yml',
    'screenshots.yml',
  ]) {
    const workflow = read(`.github/workflows/${file}`);
    assert.match(
      workflow,
      /uses: \.\/\.github\/actions\/setup-playwright\n\s+with:\n\s+system_deps: 'true'/,
      file
    );
    assert.doesNotMatch(workflow, /--with-deps|ms-playwright/, file);
  }
  assert.match(
    read('.github/workflows/pr-visual-review.yml'),
    /system_deps: 'true'\n\s+cache: restore\n/
  );
  const action = read('.github/actions/setup-playwright/action.yml');
  assert.match(action, /install-deps --dry-run chromium/);
  // Cached .debs install with dpkg (no network); only a save needs 'true'.
  assert.match(action, /sudo dpkg -i "\$\{debs\[@\]\}"/);
  assert.match(action, /\$\{ImageVersion:-unknown\}/);
  assert.match(
    action,
    /name: Restore Playwright system packages\n.*\n\s+if: .*inputs\.cache != 'false'/
  );
  assert.match(
    action,
    /name: Save Playwright system packages\n\s+if: .*inputs\.cache == 'true'/
  );
});

// The browser cache used to be one actions/cache step, whose post-job save ran
// only when the whole job passed, and which cache: restore skipped entirely.
// Split restore and save (the setup-doppler pattern) save right after the
// install, so a job that fails later still leaves the next run warm.
test('setup-playwright saves its caches right after the install, never silently skipping', () => {
  const action = read('.github/actions/setup-playwright/action.yml');
  assert.doesNotMatch(action, /uses: actions\/cache@/);
  const step = name => {
    const start = action.indexOf(`- name: ${name}\n`);
    assert.ok(start > -1, name);
    const end = action.indexOf('\n    - name: ', start + 1);
    return action.slice(start, end === -1 ? undefined : end);
  };
  const restore = step('Restore Playwright browsers');
  assert.match(
    restore,
    /uses: \.\/\.github\/actions\/vendor\/actions-cache\/restore /
  );
  assert.match(restore, /inputs\.cache != 'false'/);
  assert.match(restore, /restore-keys:/);
  const save = step('Save Playwright browsers');
  assert.match(
    save,
    /uses: \.\/\.github\/actions\/vendor\/actions-cache\/save /
  );
  for (const guard of [
    "steps.browser-cache.outputs.cache-hit != 'true'",
    "inputs.cache == 'true'",
    "runner.environment == 'github-hosted'",
  ])
    assert.ok(save.includes(guard), guard);
  assert.ok(
    action.indexOf('- name: Install Playwright (Chromium)') <
      action.indexOf('- name: Save Playwright browsers')
  );
  const debSave = step('Save Playwright system packages');
  for (const guard of [
    "steps.system-debs-cache.outputs.cache-hit != 'true'",
    "steps.system-install.outputs.fetched == 'true'",
    "runner.environment == 'github-hosted'",
  ])
    assert.ok(debSave.includes(guard), guard);
  const notice = step('Note skipped Playwright cache saves');
  assert.match(notice, /::notice title=Playwright browser cache not saved::/);
  assert.match(
    notice,
    /::notice title=Playwright system packages not cached::/
  );
});

// One owner for the hosted Chromium cache: .github/actions/setup-playwright
// keys it by Playwright version. A hand-rolled lockfile-hashed key saved one
// identical 260 MB entry per Dependabot lockfile and evicted merge-group
// workspaces (2026-10-10). Exceptions keep apt `--with-deps` for browsers the
// shared action does not install. Font-exact producers use its system_deps.
const HAND_ROLLED_PLAYWRIGHT = new Map([
  ['agent-tick.yml', 'disabled_manually; deleted by #21442'],
  [
    'e2e-full-matrix.yml',
    'Firefox needs apt deps; Chromium already uses the shared action',
  ],
  ['ios-app-store-graphics.yml', 'App Store renders need system fonts'],
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
    'marketing-certification-producer.yml',
    'nightly-tests.yml',
    'pr-visual-review.yml',
    'screenshots.yml',
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
