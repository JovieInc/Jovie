import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { formatChangedFiles } from './preflight-changed.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

test('preflight repairs committed, staged and untracked formatting without touching main files', async t => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'preflight-format-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  };
  const bad = 'export const values=[1,2,3];\n';
  writeFileSync(path.join(cwd, '.gitignore'), 'node_modules\n');
  writeFileSync(path.join(cwd, 'biome.json'), '{"root":true}\n');
  writeFileSync(path.join(cwd, 'package.json'), '{"private":true}\n');
  writeFileSync(path.join(cwd, 'main.mjs'), bad);
  writeFileSync(path.join(cwd, 'removed.mjs'), bad);
  git('init', '-b', 'main');
  git('config', 'user.name', 'Preflight test');
  git('config', 'user.email', 'preflight@example.test');
  git('config', 'core.hooksPath', '/dev/null');
  git('add', '.');
  git('commit', '-m', 'base');
  git('checkout', '-b', 'repair');
  writeFileSync(path.join(cwd, 'committed.mjs'), bad);
  git('add', 'committed.mjs');
  git('commit', '-m', 'unformatted test');
  writeFileSync(path.join(cwd, 'staged.mjs'), bad);
  git('add', 'staged.mjs');
  const untracked = "untracked ' $literal.mjs";
  writeFileSync(path.join(cwd, untracked), bad);
  git('rm', 'removed.mjs');
  symlinkSync(
    path.join(root, 'node_modules'),
    path.join(cwd, 'node_modules'),
    'dir'
  );

  const result = await formatChangedFiles(cwd, 'main', process.env);
  assert.equal(result.code, 0, result.out);
  for (const name of ['committed.mjs', 'staged.mjs', untracked]) {
    assert.notEqual(readFileSync(path.join(cwd, name), 'utf8'), bad, name);
    const checked = spawnSync(
      path.join(root, 'node_modules/.bin/biome'),
      ['check', name],
      {
        cwd,
        encoding: 'utf8',
      }
    );
    assert.equal(checked.status, 0, checked.stdout + checked.stderr);
  }
  assert.equal(readFileSync(path.join(cwd, 'main.mjs'), 'utf8'), bad);
});
