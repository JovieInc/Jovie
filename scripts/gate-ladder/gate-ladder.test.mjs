import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

function run(args) {
  return spawnSync('node', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(
    result.status,
    0,
    `git ${args.join(' ')} failed:\n${result.stdout}${result.stderr}`
  );
  return result.stdout;
}

function spawnResult(command, args, cwd) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (status, signal) => {
      resolveResult({ signal, status, stderr, stdout });
    });
  });
}

describe('gate-ladder (JOV-3210)', () => {
  it('validates the shared ladder against live hooks and workflows', () => {
    const result = run(['scripts/gate-ladder/validate.mjs']);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /PASS/);
  });

  it('lists rungs including secrets and PR Ready aggregate', () => {
    const result = run(['scripts/gate-ladder/run.mjs', '--list']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /secrets/);
    assert.match(result.stdout, /aggregate/);
    assert.match(result.stdout, /typecheck/);
  });

  it('skips PR-mapping prose without executing it', () => {
    const result = run([
      'scripts/gate-ladder/run.mjs',
      '--rung',
      'aggregate',
      '--app',
      'web',
      '--phase',
      'pr',
    ]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /documented mapping only|PR Ready/);
  });

  it('commits staged files concurrently in linked worktrees without a shared stash', {
    timeout: 30_000,
  }, async () => {
    const preCommit = readFileSync(
      resolve(REPO_ROOT, '.husky/pre-commit'),
      'utf8'
    );
    const lintStagedCommand = preCommit.match(
      /^pnpm exec lint-staged(?: .+)?$/m
    )?.[0];
    assert.equal(lintStagedCommand, 'pnpm exec lint-staged --no-stash');

    const tempRoot = mkdtempSync(join(tmpdir(), 'jovie-lint-staged-'));
    const primary = join(tempRoot, 'primary');
    const worktreeA = join(tempRoot, 'agent-a');
    const worktreeB = join(tempRoot, 'agent-b');
    const hooksDir = join(tempRoot, 'hooks');
    const barrierDir = join(tempRoot, 'barrier');
    const recordsDir = join(tempRoot, 'records');
    const taskScript = join(tempRoot, 'record-staged-files.mjs');
    const configPath = join(tempRoot, 'lint-staged.config.mjs');
    const lintStagedBin = resolve(
      REPO_ROOT,
      'node_modules',
      '.bin',
      'lint-staged'
    );

    mkdirSync(primary);
    mkdirSync(hooksDir);
    mkdirSync(barrierDir);
    mkdirSync(recordsDir);
    assert.ok(existsSync(lintStagedBin), 'lint-staged binary is installed');

    try {
      git(primary, 'init', '--quiet', '--initial-branch=main');
      git(primary, 'config', 'user.name', 'Jovie Test');
      git(primary, 'config', 'user.email', 'test@example.com');
      writeFileSync(join(primary, 'a.js'), 'export const a = 1;\n');
      writeFileSync(join(primary, 'b.js'), 'export const b = 1;\n');
      git(primary, 'add', 'a.js', 'b.js');
      git(primary, 'commit', '--quiet', '-m', 'test: seed repository');
      git(primary, 'branch', 'agent-a');
      git(primary, 'branch', 'agent-b');
      git(primary, 'worktree', 'add', '--quiet', worktreeA, 'agent-a');
      git(primary, 'worktree', 'add', '--quiet', worktreeB, 'agent-b');

      writeFileSync(
        taskScript,
        [
          "import { readdirSync, writeFileSync } from 'node:fs';",
          "import { basename, join } from 'node:path';",
          '',
          'const [barrierDir, recordsDir, ...files] = process.argv.slice(2);',
          'const worker = basename(process.cwd());',
          "writeFileSync(join(barrierDir, `${worker}.ready`), '');",
          'const waitBuffer = new Int32Array(new SharedArrayBuffer(4));',
          'const deadline = Date.now() + 10_000;',
          'while (readdirSync(barrierDir).length < 2 && Date.now() < deadline) {',
          '  Atomics.wait(waitBuffer, 0, 0, 10);',
          '}',
          'if (readdirSync(barrierDir).length < 2) {',
          "  throw new Error('concurrent lint-staged task did not reach barrier');",
          '}',
          'writeFileSync(join(recordsDir, `${worker}.json`), JSON.stringify(files));',
          '',
        ].join('\n')
      );
      writeFileSync(
        configPath,
        [
          'export default {',
          "  '*.js': filenames =>",
          `    ['node', ${JSON.stringify(taskScript)}, ${JSON.stringify(barrierDir)}, ${JSON.stringify(recordsDir)}, ...filenames]`,
          '      .map(value => JSON.stringify(value))',
          "      .join(' '),",
          '};',
          '',
        ].join('\n')
      );
      writeFileSync(
        join(hooksDir, 'pre-commit'),
        [
          '#!/bin/sh',
          `exec ${JSON.stringify(lintStagedBin)} --no-stash --config ${JSON.stringify(configPath)}`,
          '',
        ].join('\n')
      );
      chmodSync(join(hooksDir, 'pre-commit'), 0o755);
      git(primary, 'config', 'core.hooksPath', hooksDir);

      writeFileSync(join(worktreeA, 'a.js'), 'export const a = 2;\n');
      writeFileSync(join(worktreeA, 'unstaged-a.js'), 'unstaged\n');
      git(worktreeA, 'add', 'a.js');
      writeFileSync(join(worktreeB, 'b.js'), 'export const b = 2;\n');
      writeFileSync(join(worktreeB, 'unstaged-b.js'), 'unstaged\n');
      git(worktreeB, 'add', 'b.js');

      const [commitA, commitB] = await Promise.all([
        spawnResult('git', ['commit', '-m', 'test: commit agent a'], worktreeA),
        spawnResult('git', ['commit', '-m', 'test: commit agent b'], worktreeB),
      ]);

      for (const commit of [commitA, commitB]) {
        assert.equal(
          commit.status,
          0,
          `concurrent commit failed (${commit.signal ?? 'no signal'}):\n${commit.stdout}${commit.stderr}`
        );
        assert.doesNotMatch(
          `${commit.stdout}${commit.stderr}`,
          /lint-staged automatic backup is missing/i
        );
      }

      const stagedA = JSON.parse(
        readFileSync(join(recordsDir, 'agent-a.json'), 'utf8')
      );
      const stagedB = JSON.parse(
        readFileSync(join(recordsDir, 'agent-b.json'), 'utf8')
      );
      assert.deepEqual(
        stagedA.map(file => basename(file)),
        ['a.js']
      );
      assert.deepEqual(
        stagedB.map(file => basename(file)),
        ['b.js']
      );
      assert.equal(git(primary, 'stash', 'list').trim(), '');
      assert.match(git(worktreeA, 'status', '--short'), /\?\? unstaged-a\.js/);
      assert.match(git(worktreeB, 'status', '--short'), /\?\? unstaged-b\.js/);
    } finally {
      if (existsSync(primary)) {
        for (const worktree of [worktreeA, worktreeB]) {
          if (existsSync(worktree)) {
            spawnSync(
              'git',
              ['-C', primary, 'worktree', 'remove', '--force', worktree],
              { encoding: 'utf8' }
            );
          }
        }
      }
      rmSync(tempRoot, { force: true, recursive: true });
    }
  });
});
