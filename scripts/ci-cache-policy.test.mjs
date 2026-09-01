import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
