import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { evaluateRepoHygiene } from '../../repo-hygiene-guard.mjs';

function fixtureFile(root, path) {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, Buffer.alloc(8));
}

test('refuses screenshot binaries under the R2-backed paths and points at the pointer flow', () => {
  const root = mkdtempSync(join(tmpdir(), 'jovie-hygiene-r2-'));
  try {
    const banned = [
      'apps/web/screenshot-catalog/current/new-desktop.png',
      'docs/screenshots/jov-9/after.png',
      'docs/screenshots/jov-9/after.jpg',
      'docs/screenshots/jov-9/after.webp',
      'docs/screenshots/jov-9/walkthrough.mp4',
    ];
    const allowed = [
      'apps/web/screenshot-catalog/pointers/new-desktop.png.pointer.json',
      'docs/screenshots/jov-9/after.png.pointer.json',
      'docs/screenshots/gem-symphony-hud-430x90.png',
    ];
    for (const path of [...banned, ...allowed]) fixtureFile(root, path);
    const { errors } = evaluateRepoHygiene({
      addedPaths: [...banned, ...allowed],
      root,
    });
    for (const path of banned) {
      assert.equal(
        errors.filter(
          error =>
            error.startsWith(`${path}:`) && /live in R2, not git/.test(error)
        ).length,
        1,
        path
      );
    }
    for (const path of allowed)
      assert.equal(
        errors.filter(error => error.startsWith(`${path}:`)).length,
        0,
        path
      );
    assert.match(errors.join('\n'), /screenshot-store\.mjs pointers/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
