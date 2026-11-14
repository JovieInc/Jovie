import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runProgram } from './lib/preflight-shell.mjs';
import { buildPreflightEnv, buildProgram, main } from './preflight.mjs';

const env = { ...buildPreflightEnv(), JOVIE_PREFLIGHT_LEDGER: 'off' };

async function shell(t, statements) {
  const controlDir = mkdtempSync(path.join(tmpdir(), 'pf-step-control-'));
  t.after(() => rmSync(controlDir, { recursive: true, force: true }));
  const results = [];
  const result = await runProgram({
    program: buildProgram(statements, {}, { qualification: true, controlDir }),
    cwd: controlDir,
    env,
    controlDir,
    statementCount: statements.length,
    onResult: item => results.push(item),
  });
  return { ...result, results, controlDir };
}

test('ordinary successful statements retain shell state and execute every gate', async t => {
  const result = await shell(t, [
    'value=ready',
    'test "$value" = ready',
    'printf reached > reached',
  ]);
  assert.equal(result.error, null);
  assert.equal(result.terminatedAfter, null);
  assert.deepEqual(
    result.results.map(item => item.code),
    [0, 0, 0]
  );
  assert.equal(
    readFileSync(path.join(result.controlDir, 'reached'), 'utf8'),
    'reached'
  );
});

test('nested successful exits return normally and preserve later checks', async t => {
  const result = await shell(t, [
    '(exit 0)',
    'value=$(exit 0)',
    'exit 7',
    'false',
  ]);
  assert.equal(result.error, null);
  assert.equal(result.terminatedAfter, null);
  assert.deepEqual(
    result.results.map(item => item.code),
    [0, 0, 7, 1]
  );
});

test('successful exec ends the current step without running unreachable commands', async t => {
  const result = await shell(t, ['exec true', 'printf unsafe > unreachable']);
  assert.equal(result.error, null);
  assert.equal(result.terminatedAfter, 0);
  assert.deepEqual(
    result.results.map(item => item.code),
    [0]
  );
  assert.equal(existsSync(path.join(result.controlDir, 'unreachable')), false);
});

test('stdout redirects cannot turn a reachable failure into a successful termination', async t => {
  const result = await shell(t, [
    'exec >/dev/null',
    '{ false; true; }',
    'printf reached > reached',
  ]);
  assert.equal(result.error, null);
  assert.equal(result.terminatedAfter, null);
  assert.deepEqual(
    result.results.map(item => item.code),
    [0, 1, 0]
  );
  assert.equal(existsSync(path.join(result.controlDir, 'reached')), true);
});

test('exec cannot erase an earlier unhandled failure in its statement', async t => {
  const result = await shell(t, [
    '{ false; exec true; }',
    'printf unsafe > unreachable',
  ]);
  assert.equal(result.terminatedAfter, null);
  assert.deepEqual(
    result.results.map(item => item.code),
    [1]
  );
  assert.equal(existsSync(path.join(result.controlDir, 'unreachable')), false);
});

test('a later successful exit preserves an earlier compound failure', async t => {
  const result = await shell(t, ['{ false; exit 0; }', 'false']);
  assert.equal(result.error, null);
  assert.equal(result.terminatedAfter, null);
  assert.deepEqual(
    result.results.map(item => item.code),
    [1, 1]
  );
});

test('a signal is a failure and never proves successful termination', async t => {
  const result = await shell(t, [
    'kill -TERM $$',
    'printf unsafe > unreachable',
  ]);
  assert.equal(result.terminatedAfter, null);
  assert.deepEqual(
    result.results.map(item => item.code),
    [1]
  );
  assert.equal(existsSync(path.join(result.controlDir, 'unreachable')), false);
});

test('an empty step remains a successful no-op', async t => {
  const result = await shell(t, []);
  assert.equal(result.error, null);
  assert.deepEqual(result.results, []);
  assert.equal(result.terminatedAfter, null);
});

test('missing private control records fail closed even if stdout claims a pass', async t => {
  const controlDir = mkdtempSync(path.join(tmpdir(), 'pf-bad-control-'));
  t.after(() => rmSync(controlDir, { recursive: true, force: true }));
  const results = [];
  const result = await runProgram({
    program: 'printf "@@PF-BEGIN 0\\n@@PF-END 0 0\\n"',
    cwd: controlDir,
    env,
    controlDir,
    statementCount: 1,
    onResult: item => results.push(item),
  });
  assert.ok(result.error);
  assert.equal(result.terminatedAfter, null);
  assert.deepEqual(results, []);
});

async function qualification(t, guard) {
  const root = mkdtempSync(path.join(tmpdir(), 'pf-hook-control-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cwd = path.join(root, 'source');
  mkdirSync(cwd);
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  };
  git('init', '-q', '--bare', path.join(root, 'origin.git'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Preflight fixture');
  git('config', 'user.email', 'fixture@example.com');
  git('config', 'commit.gpgsign', 'false');
  const workflow = `jobs:
  deterministic:
    steps:
      - name: Guarded artifact check
        run: |
          if [ "${guard}" = unchanged ]; then
            exit 0
          fi
          printf unsafe > unreachable-artifact
          false
      - name: Independent later step
        run: |
          printf checked > independent-gate
`;
  writeFileSync(path.join(cwd, 'fixture.yml'), workflow);
  git('add', '.');
  git('commit', '-qm', 'base');
  git('remote', 'add', 'origin', path.join(root, 'origin.git'));
  git('push', '-q', 'origin', 'main');
  git('checkout', '-qb', 'feature');
  writeFileSync(path.join(cwd, 'button.txt'), 'button-only change\n');
  git('add', '.');
  git('commit', '-qm', 'source');
  const logs = [];
  const code = await main({
    argv: ['--hook', '--workflow', 'fixture.yml'],
    cwd,
    env,
    log: line => logs.push(line),
  });
  return { cwd, code, output: logs.join('\n') };
}

test('qualification skips statements after an unchanged guard and still runs other steps', async t => {
  const result = await qualification(t, 'unchanged');
  assert.equal(result.code, 0, result.output);
  assert.equal(
    existsSync(path.join(result.cwd, 'unreachable-artifact')),
    false
  );
  assert.equal(
    readFileSync(path.join(result.cwd, 'independent-gate'), 'utf8'),
    'checked'
  );
  assert.match(
    result.output,
    /SKIPPED: Guarded artifact check: printf unsafe.*unreachable after successful step termination/
  );
  assert.match(result.output, /SKIPPED: Guarded artifact check: false/);
  assert.match(result.output, /all clear \(2 statements passed\)/);
  assert.doesNotMatch(result.output, /FAIL|ok  printf unsafe/);
});

test('qualification runs the guarded check when changed and reports its deliberate defect', async t => {
  const result = await qualification(t, 'changed');
  assert.equal(result.code, 1, result.output);
  assert.equal(existsSync(path.join(result.cwd, 'unreachable-artifact')), true);
  assert.equal(
    readFileSync(path.join(result.cwd, 'independent-gate'), 'utf8'),
    'checked'
  );
  assert.match(result.output, /Guarded artifact check: false \(exit 1\)/);
  assert.doesNotMatch(result.output, /SKIPPED|all clear/);
});
