import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
    '.github/workflows/brand-scrub.yml',
    '.github/workflows/slop-gate.yml',
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
    '.github/workflows/ci.yml',
    '.github/workflows/desktop-release.yml',
  ]) {
    const workflow = read(file);
    assert.match(workflow, /~\/Library\/Caches\/electron/);
    assert.match(workflow, /~\/Library\/Caches\/electron-builder/);
    assert.match(workflow, /runner\.os }}-electron-downloads-/);
  }
});

test('runner-side repair restores the exact source dependency store', () => {
  const workflow = read('.github/workflows/rolling-ci-dispatch.yml');
  assert.match(workflow, /cache: pnpm/);
  assert.match(workflow, /cache-dependency-path: source\/pnpm-lock\.yaml/);
});

test('Chromium download steps restore a Playwright cache first', () => {
  for (const file of [
    '.github/workflows/pr-visual-review.yml',
    '.github/workflows/screenshots.yml',
    '.github/workflows/visual-a11y.yml',
  ]) {
    const workflow = read(file);
    const cache = workflow.indexOf('Cache Playwright Browsers');
    const install = workflow.indexOf('playwright install');
    assert.ok(cache >= 0, `${file} must restore the browser cache`);
    assert.ok(install > cache, `${file} must restore before browser install`);
  }
});
