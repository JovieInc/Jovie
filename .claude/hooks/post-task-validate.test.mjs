// Run: node --test .claude/hooks/post-task-validate.test.mjs
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const HOOK = resolve(import.meta.dirname, 'post-task-validate.sh');
const REPO_ROOT = resolve(import.meta.dirname, '../..');

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'stop-hook-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir });
  git('init', '-q');
  writeFileSync(join(dir, '.gitignore'), 'node_modules\n');
  writeFileSync(join(dir, 'ok.ts'), 'export const ok = 1;\n');
  git('add', '.');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init');
  symlinkSync(join(REPO_ROOT, 'node_modules'), join(dir, 'node_modules'));
  return dir;
}

function runHook(input) {
  const r = spawnSync('bash', [HOOK], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: '/nonexistent' },
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

test('clean tree allows stop', () => {
  assert.equal(runHook({ cwd: makeRepo() }), '');
});

test('validates the session cwd, not CLAUDE_PROJECT_DIR, and blocks on changed-file lint', () => {
  const dir = makeRepo();
  writeFileSync(join(dir, 'bad.ts'), 'export   const bad={a:1}\n');
  const out = JSON.parse(runHook({ cwd: dir }));
  assert.equal(out.decision, 'block');
  assert.match(out.reason, /Biome lint failed/);
});

test('second stop after a block is allowed (no loop)', () => {
  const dir = makeRepo();
  writeFileSync(join(dir, 'bad.ts'), 'export   const bad={a:1}\n');
  assert.equal(runHook({ cwd: dir, stop_hook_active: true }), '');
});

test('non-code changes skip all checks', () => {
  const dir = makeRepo();
  writeFileSync(join(dir, 'notes.md'), '# hi\n');
  assert.equal(runHook({ cwd: dir }), '');
});
