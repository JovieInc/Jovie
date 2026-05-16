import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateDesktopReleaseGuard } from './desktop-release-guard.mjs';

test('passes when no desktop files changed', () => {
  const result = evaluateDesktopReleaseGuard([
    'apps/web/app/page.tsx',
    'package.json',
  ]);

  assert.equal(result.passed, true);
  assert.deepEqual(result.desktopFiles, []);
});

test('fails when desktop files changed without a release trigger', () => {
  const result = evaluateDesktopReleaseGuard([
    'apps/desktop/src/main.ts',
    'apps/desktop/electron-builder.yml',
  ]);

  assert.equal(result.passed, false);
  assert.deepEqual(result.releaseHandlingFiles, []);
});

test('passes when desktop changes include a VERSION bump', () => {
  const result = evaluateDesktopReleaseGuard([
    'apps/desktop/src/main.ts',
    'VERSION',
  ]);

  assert.equal(result.passed, true);
  assert.deepEqual(result.releaseHandlingFiles, ['VERSION']);
});

test('passes when desktop changes include explicit release workflow handling', () => {
  const result = evaluateDesktopReleaseGuard([
    'apps/desktop/src/main.ts',
    '.github/workflows/desktop-release.yml',
  ]);

  assert.equal(result.passed, true);
  assert.deepEqual(result.releaseHandlingFiles, [
    '.github/workflows/desktop-release.yml',
  ]);
});
