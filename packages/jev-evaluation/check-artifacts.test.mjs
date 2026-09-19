import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Mutate only an isolated copy, never the running evaluator or checked-in files.
test('generated digest rejects runtime source drift', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'jev-artifacts-'));
  const packagePath = join(fixture, 'packages/jev-evaluation');
  try {
    cpSync(fileURLToPath(new URL('.', import.meta.url)), packagePath, {
      recursive: true,
      filter: source =>
        !source.includes('node_modules') && !source.includes('.turbo'),
    });
    symlinkSync(
      fileURLToPath(new URL('../../node_modules', import.meta.url)),
      join(fixture, 'node_modules'),
      'dir'
    );
    mkdirSync(join(fixture, 'apps/web'), { recursive: true });
    symlinkSync(
      fileURLToPath(new URL('../../apps/web/node_modules', import.meta.url)),
      join(fixture, 'apps/web/node_modules'),
      'dir'
    );
    symlinkSync(
      fileURLToPath(new URL('./node_modules', import.meta.url)),
      join(packagePath, 'node_modules'),
      'dir'
    );
    const run = name =>
      spawnSync(process.execPath, [join(packagePath, name)], {
        encoding: 'utf8',
      });
    const source = join(packagePath, 'fingerprint.mjs');
    writeFileSync(
      source,
      `${readFileSync(source, 'utf8')}\n// synthetic source change\n`
    );
    const digest = run('check-digest.mjs');
    assert.notEqual(digest.status, 0);
    assert.match(digest.stderr, /implementation digest is stale/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
