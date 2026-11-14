import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  isHomepageSource,
  RECEIPT_SCHEMA,
  receiptProblems,
  sourcesDigest,
} from './homepage-baseline-approval.mjs';
import { planAdoption } from './visual-baseline-adopt.mjs';

const baselines = [
  '/snap/visual-regression.spec.ts/homepage-2560.png',
  '/snap/visual-regression.spec.ts/homepage-375.png',
  '/snap/auth-visual.spec.ts/signin-desktop.png',
  '/snap/a.spec.ts/dup.png',
  '/snap/b.spec.ts/dup.png',
];
// Mapping tests run without Pen bindings so repo bindings (e.g. Pen stills
// for /) cannot change their outcome; the refusal path has its own test.
const noBindings = { bindings: { routes: {} }, config: {} };

test('maps each -actual.png to its one committed baseline', () => {
  const { copies, problems } = planAdoption(
    [
      '/art/test-results/visual-regression-JOV-2081-x-chromium/homepage-2560-actual.png',
      '/art/test-results/visual-regression-JOV-2081-x-chromium/homepage-2560-diff.png',
      '/art/test-results/visual-regression-JOV-2081-x-chromium/homepage-2560-expected.png',
    ],
    baselines,
    noBindings
  );
  assert.deepEqual(problems, []);
  assert.deepEqual(copies, [
    {
      from: '/art/test-results/visual-regression-JOV-2081-x-chromium/homepage-2560-actual.png',
      to: '/snap/visual-regression.spec.ts/homepage-2560.png',
    },
  ]);
});

test('dedupes retries of the same shot', () => {
  const { copies } = planAdoption(
    ['/art/r1/homepage-375-actual.png', '/art/r2/homepage-375-actual.png'],
    baselines,
    noBindings
  );
  assert.equal(copies.length, 1);
});

test('reports unknown and ambiguous names instead of guessing', () => {
  const { copies, problems } = planAdoption(
    ['/art/new-shot-actual.png', '/art/dup-actual.png'],
    baselines,
    noBindings
  );
  assert.deepEqual(copies, []);
  assert.deepEqual(problems, [
    'no committed baseline named new-shot.png',
    'ambiguous baseline dup.png: 2 matches',
  ]);
});

test('refuses to adopt a baseline for a route that has Pen stills', () => {
  const guard = {
    bindings: {
      routes: {
        '/': {
          sources: [],
          viewports: { 1440: [{ section: 'hero', still: 's.png' }] },
        },
      },
    },
    config: { baselinePrefixes: { '/': ['homepage'] } },
  };
  const { copies, problems } = planAdoption(
    ['/tmp/a/homepage-375-actual.png', '/tmp/a/other-actual.png'],
    ['/repo/snap/homepage-375.png', '/repo/snap/other.png'],
    guard
  );
  assert.equal(copies.length, 1);
  assert.match(problems.join('\n'), /refusing to adopt homepage-375\.png/);
});

// Founder approval receipt: the only route for new homepage baselines while
// `/` is bound to Pen stills (refused above by planAdoption).

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function fixtureRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'homepage-approval-'));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'test');
  mkdirSync(join(dir, 'apps/web/components/homepage'), { recursive: true });
  mkdirSync(join(dir, 'apps/web/tests'), { recursive: true });
  writeFileSync(join(dir, 'apps/web/components/homepage/Hero.tsx'), 'a\n');
  writeFileSync(join(dir, 'apps/web/tests/other.ts'), 'x\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'init');
  return dir;
}

const receipt = digest => ({
  schema: RECEIPT_SCHEMA,
  approvedBy: 'tim',
  approvedAt: '2026-11-12T21:25:05Z',
  approvalMessage: 'cmsg_example',
  answer: 'Ship it',
  sourcesDigest: digest,
});

test('a receipt matching the homepage sources is valid', () => {
  const dir = fixtureRepo();
  try {
    const digest = sourcesDigest(dir);
    assert.deepEqual(receiptProblems(receipt(digest), digest), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a homepage source change after approval invalidates the receipt', () => {
  const dir = fixtureRepo();
  try {
    const approved = sourcesDigest(dir);
    writeFileSync(join(dir, 'apps/web/components/homepage/Hero.tsx'), 'b\n');
    git(dir, 'commit', '-qam', 'unseen change');
    const problems = receiptProblems(receipt(approved), sourcesDigest(dir));
    assert.equal(problems.length, 1);
    assert.match(problems[0], /changed since approval/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('changes outside the homepage sources keep the receipt valid', () => {
  const dir = fixtureRepo();
  try {
    const approved = sourcesDigest(dir);
    writeFileSync(join(dir, 'apps/web/tests/other.ts'), 'y\n');
    git(dir, 'commit', '-qam', 'test-only change');
    assert.deepEqual(
      receiptProblems(receipt(approved), sourcesDigest(dir)),
      []
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a receipt without the approval fields is refused', () => {
  const problems = receiptProblems(
    { schema: RECEIPT_SCHEMA, sourcesDigest: 'd' },
    'd'
  );
  assert.ok(problems.includes('approvedBy is required'));
  assert.ok(problems.includes('approvalMessage is required'));
  assert.ok(problems.includes('answer is required'));
});

test('a wrong schema is refused', () => {
  const problems = receiptProblems({ ...receipt('d'), schema: 'other' }, 'd');
  assert.ok(problems.some(p => p.startsWith('schema must be')));
});

test('the approval covers rendering sources, not tests, stories or analytics', () => {
  for (const path of [
    'apps/web/components/homepage/v3/Hero.tsx',
    'apps/web/data/homepageEditorialCopy.ts',
    'apps/web/data/featuredArtists.ts',
    'apps/web/public/img/releases/a.webp',
  ])
    assert.equal(isHomepageSource(path), true, path);
  for (const path of [
    'apps/web/components/homepage/Hero.test.tsx',
    'apps/web/components/homepage/Hero.stories.tsx',
    'apps/web/components/homepage/homepage-analytics.ts',
    'apps/web/data/homepage/nested.ts',
    'apps/web/data/pricing.ts',
  ])
    assert.equal(isHomepageSource(path), false, path);
});
