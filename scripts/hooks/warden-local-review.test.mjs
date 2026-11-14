import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
import { join, resolve } from 'node:path';
import { afterEach, describe, it } from 'node:test';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const script = resolve(repoRoot, 'scripts/hooks/warden-local-review.sh');
const ladder = JSON.parse(
  readFileSync(resolve(repoRoot, 'scripts/gate-ladder/ladder.json'), 'utf8')
);

const temporaryDirectories = [];

function makeWardenStub({ exitCode = 0, marker = null } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'jovie-warden-stub-'));
  temporaryDirectories.push(directory);
  const bin = join(directory, 'bin');
  const wardenPath = join(bin, 'warden');
  mkdirSync(bin, { recursive: true });
  const lines = ['#!/bin/sh'];
  if (marker) lines.push(`echo invoked >> "${marker}"`);
  if (exitCode !== 0) lines.push(`exit ${exitCode}`);
  writeFileSync(wardenPath, `${lines.join('\n')}\n`);
  chmodSync(wardenPath, 0o755);
  return { bin, wardenPath };
}

function runHook(mode, extraPath = '', extraEnv = {}) {
  return spawnSync('bash', [script, mode], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${extraPath}:${process.env.PATH}`,
      ...extraEnv,
    },
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('warden-local-review.sh', () => {
  it('is registered as an advisory (non-hard-block) ladder rung with no PR leg', () => {
    const rung = ladder.rungs.find(entry => entry.id === 'warden-local-review');
    assert.ok(rung, 'warden-local-review rung exists in ladder.json');
    assert.equal(rung.hardBlock, false);
    assert.equal(rung.pr, null);
    assert.match(rung.preCommit.web, /warden-local-review\.sh staged/);
    assert.match(rung.prePush.web, /warden-local-review\.sh branch/);
  });

  it('is invoked by both husky hooks', () => {
    assert.match(
      readFileSync(resolve(repoRoot, '.husky/pre-commit'), 'utf8'),
      /bash scripts\/hooks\/warden-local-review\.sh staged/
    );
    assert.match(
      readFileSync(resolve(repoRoot, '.husky/pre-push'), 'utf8'),
      /bash scripts\/hooks\/warden-local-review\.sh branch/
    );
  });

  it('exits 0 with a warning when the warden CLI is missing', () => {
    // PATH prepended with an empty dir: `warden` cannot resolve.
    const empty = mkdtempSync(join(tmpdir(), 'jovie-warden-empty-'));
    temporaryDirectories.push(empty);
    const result = runHook('branch', empty);
    assert.equal(result.status, 0);
    assert.match(result.stderr, /warden CLI not installed/);
    assert.match(result.stderr, /pnpm add -g @sentry\/warden/);
  });

  it('runs warden in branch mode and never blocks on findings (default warn)', () => {
    const marker = join(tmpdir(), `jovie-warden-marker-${process.pid}`);
    try {
      const { bin } = makeWardenStub({ exitCode: 1, marker });
      const result = runHook('branch', bin);
      assert.equal(result.status, 0);
      assert.ok(existsSync(marker), 'stub warden was invoked');
      assert.match(result.stderr, /NOT blocked/);
      assert.match(result.stderr, /must never become a merge gate/);
    } finally {
      rmSync(marker, { force: true });
    }
  });

  it('passes --staged in staged mode', () => {
    const logDir = mkdtempSync(join(tmpdir(), 'jovie-warden-args-'));
    temporaryDirectories.push(logDir);
    const { bin } = makeWardenStub({ marker: join(logDir, 'args') });
    const result = runHook('staged', bin);
    assert.equal(result.status, 0);
    assert.match(readFileSync(join(logDir, 'args'), 'utf8'), /invoked/);
  });

  it('propagates a non-zero warden exit only in strict mode', () => {
    const { bin } = makeWardenStub({ exitCode: 1 });
    const strict = runHook('branch', bin, { WARDEN_LOCAL_REVIEW: 'strict' });
    assert.equal(strict.status, 1);
    const off = runHook('branch', bin, { WARDEN_LOCAL_REVIEW: 'off' });
    assert.equal(off.status, 0);
    assert.doesNotMatch(off.stderr, /warden/i);
  });

  it('exits 0 for an unknown mode and skips cleanly under CI', () => {
    assert.equal(runHook('nonsense').status, 0);
    const inCi = runHook('branch', '', { CI: '1' });
    assert.equal(inCi.status, 0);
  });
});
