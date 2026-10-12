import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const CLASSIFIER = 'scripts/lib/product-lane-classifier.mjs';
const { load } = createRequire(import.meta.url)('js-yaml');
/** @type {any} */
const workflow = load(
  readFileSync(
    join(REPO_ROOT, '.github/workflows/source-validation.yml'),
    'utf8'
  )
);
const step = workflow.jobs.deterministic.steps.find(
  (/** @type {any} */ s) =>
    s.name === 'Classify product lanes with the trusted base classifier'
);

// Hooks export GIT_DIR and friends; a nested repo must not inherit them.
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
);
const git = (cwd, ...args) => {
  const result = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
};
const write = (root, path, content) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
};

// Runs the real workflow step in a PR checkout whose trusted base (origin/main)
// carries today's classifier, so the PR cannot weaken the rule it is judged by.
function runStep(prPaths, { patchClassifier = false } = {}) {
  // Real path, as on CI runners: the classifier's entry-point check compares
  // its own URL with argv[1], which a /var -> /private/var symlink breaks.
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), 'pr-lane-classification-'))
  );
  try {
    const origin = join(root, 'origin.git');
    const work = join(root, 'work');
    git(root, 'init', '-q', '--bare', '-b', 'main', origin);
    git(root, 'init', '-q', '-b', 'main', work);
    git(work, 'config', 'user.email', 'test@example.com');
    git(work, 'config', 'user.name', 'test');
    mkdirSync(join(work, 'scripts/lib'), { recursive: true });
    copyFileSync(join(REPO_ROOT, CLASSIFIER), join(work, CLASSIFIER));
    write(work, 'apps/web/page.tsx', 'export {};\n');
    git(work, 'add', '-A');
    git(work, 'commit', '-q', '-m', 'base');
    git(work, 'remote', 'add', 'origin', origin);
    git(work, 'push', '-q', 'origin', 'main');
    git(work, 'switch', '-q', '-c', 'pr');
    for (const path of prPaths) write(work, path, 'changed\n');
    if (patchClassifier) {
      // A PR that "maps" its own new path must still be judged by the base.
      writeFileSync(
        join(work, CLASSIFIER),
        readFileSync(join(work, CLASSIFIER), 'utf8').replace(
          '/^(apps\\/(web|ovie|extension)\\/|',
          '/^(skills\\/|apps\\/(web|ovie|extension)\\/|'
        )
      );
    }
    git(work, 'add', '-A');
    git(work, 'commit', '-q', '-m', 'pr');
    const runnerTemp = join(root, 'runner-temp');
    mkdirSync(runnerTemp);
    const result = spawnSync('bash', ['-c', step.run], {
      cwd: work,
      encoding: 'utf8',
      env: {
        ...env,
        RUNNER_TEMP: runnerTemp,
        BASE_BRANCH: 'main',
        EXPECTED_HEAD: git(work, 'rev-parse', 'HEAD'),
      },
    });
    return { status: result.status, output: result.stdout + result.stderr };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('source PR Ready runs the trusted classifier on every PR', () => {
  assert.ok(step, 'classification step missing from Source Validation');
  assert.equal(step.if, undefined);
  assert.match(
    step.run,
    /git show "\$trusted_ref:scripts\/lib\/product-lane-classifier\.mjs"/
  );
});

test('an unclassified path fails at PR time with the merge-group message', () => {
  const { status, output } = runStep(['skills/foo/SKILL.md']);
  assert.equal(status, 1, output);
  assert.match(
    output,
    /::error::Product lane classification failed: Unmapped changed paths: skills\/foo\/SKILL\.md\./
  );
});

test('the PR cannot classify its own new path by editing the classifier', () => {
  const { status, output } = runStep(['skills/foo/SKILL.md'], {
    patchClassifier: true,
  });
  assert.equal(status, 1, output);
  assert.match(output, /Unmapped changed paths: skills\/foo\/SKILL\.md/);
});

test('a classifier that never runs fails closed instead of passing', () => {
  assert.match(step.run, /test -s "\$lane_dir\/receipt\.json"/);
});

test('mapped paths pass', () => {
  const { status, output } = runStep([
    'apps/web/app/page.tsx',
    'scripts/example.mjs',
  ]);
  assert.equal(status, 0, output);
});
