import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planAdoption } from './visual-baseline-adopt.mjs';

const baselines = [
  '/snap/visual-regression.spec.ts/homepage-2560.png',
  '/snap/visual-regression.spec.ts/homepage-375.png',
  '/snap/auth-visual.spec.ts/signin-desktop.png',
  '/snap/a.spec.ts/dup.png',
  '/snap/b.spec.ts/dup.png',
];

test('maps each -actual.png to its one committed baseline', () => {
  const { copies, problems } = planAdoption(
    [
      '/art/test-results/visual-regression-JOV-2081-x-chromium/homepage-2560-actual.png',
      '/art/test-results/visual-regression-JOV-2081-x-chromium/homepage-2560-diff.png',
      '/art/test-results/visual-regression-JOV-2081-x-chromium/homepage-2560-expected.png',
    ],
    baselines
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
    [
      '/art/r1/homepage-375-actual.png',
      '/art/r2/homepage-375-actual.png',
    ],
    baselines
  );
  assert.equal(copies.length, 1);
});

test('reports unknown and ambiguous names instead of guessing', () => {
  const { copies, problems } = planAdoption(
    ['/art/new-shot-actual.png', '/art/dup-actual.png'],
    baselines
  );
  assert.deepEqual(copies, []);
  assert.deepEqual(problems, [
    'no committed baseline named new-shot.png',
    'ambiguous baseline dup.png: 2 matches',
  ]);
});
