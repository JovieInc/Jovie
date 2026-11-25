import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
  localHookChildEnv,
  localHookTestsMissingCiIsolation,
} from './local-hook-child-env.mjs';

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
  if (marker) {
    lines.push(
      `for arg in "$@"; do printf '%s\\n' "$arg" >> "${marker}"; done`,
      `echo invoked >> "${marker}"`
    );
  }
  if (exitCode !== 0) lines.push(`exit ${exitCode}`);
  writeFileSync(wardenPath, `${lines.join('\n')}\n`);
  chmodSync(wardenPath, 0o755);
  return { bin, wardenPath };
}

// A configured developer machine: key present, triage off so the stub is
// reached regardless of what is staged, push review opted in, and an isolated
// cache dir for the pi models file.
function configuredEnv(extraEnv = {}) {
  const cache = mkdtempSync(join(tmpdir(), 'jovie-warden-cache-'));
  temporaryDirectories.push(cache);
  return {
    WARDEN_ANTHROPIC_API_KEY: 'test-key-not-real',
    WARDEN_TRIAGE: 'off',
    WARDEN_PUSH_REVIEW: 'on',
    XDG_CACHE_HOME: cache,
    ...extraEnv,
  };
}

function runHook(mode, extraPath = '', extraEnv = {}) {
  return spawnSync('bash', [script, mode], {
    encoding: 'utf8',
    env: localHookChildEnv(configuredEnv(extraEnv), extraPath),
  });
}

function makeStub(name, body) {
  const directory = mkdtempSync(join(tmpdir(), `jovie-${name}-stub-`));
  temporaryDirectories.push(directory);
  const path = join(directory, name);
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return directory;
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

  it('falls back to the pinned Warden through npm when warden is not on PATH', () => {
    const logDir = mkdtempSync(join(tmpdir(), 'jovie-warden-npm-'));
    temporaryDirectories.push(logDir);
    const log = join(logDir, 'args');
    const bin = makeStub(
      'npm',
      `for arg in "$@"; do printf '%s\\n' "$arg" >> "${log}"; done\nprintf 'PI=%s\\n' "$PI_CODING_AGENT_DIR" >> "${log}"`
    );
    // Only the stub npm and system tools; a real warden must not shadow it.
    const result = spawnSync('bash', [script, 'staged'], {
      encoding: 'utf8',
      env: {
        ...localHookChildEnv(configuredEnv(), bin),
        PATH: `${bin}:/usr/bin:/bin`,
      },
    });
    assert.equal(result.status, 0);
    const recorded = readFileSync(log, 'utf8');
    assert.match(
      recorded,
      /^exec\n--yes\n--package=@sentry\/warden@\d+\.\d+\.\d+\n--\nwarden\n--staged\n/
    );
    const agentDir = recorded.match(/^PI=(.+)$/m)?.[1];
    assert.ok(agentDir, 'PI_CODING_AGENT_DIR exported');
    const models = JSON.parse(
      readFileSync(join(agentDir, 'models.json'), 'utf8')
    );
    assert.ok(
      models.providers.anthropic.models.some(
        model => model.id === 'claude-haiku-5-5'
      )
    );
  });

  it('exits 0 with a warning when neither warden nor npm is available', () => {
    const bin = mkdtempSync(join(tmpdir(), 'jovie-warden-bare-'));
    temporaryDirectories.push(bin);
    const dirname = spawnSync('bash', ['-c', 'command -v dirname'], {
      encoding: 'utf8',
    }).stdout.trim();
    symlinkSync(dirname, join(bin, 'dirname'));
    const bash = spawnSync('bash', ['-c', 'command -v bash'], {
      encoding: 'utf8',
    }).stdout.trim();
    const result = spawnSync(bash, [script, 'staged'], {
      encoding: 'utf8',
      env: { ...localHookChildEnv(configuredEnv(), bin), PATH: bin },
    });
    assert.equal(result.status, 0);
    assert.match(result.stderr, /warden CLI not installed and npm not found/);
    assert.match(result.stderr, /npm install -g @sentry\/warden@/);
  });

  it('skips with a setup pointer when no Warden key is configured', () => {
    const { bin } = makeWardenStub({ exitCode: 1 });
    const result = runHook('staged', bin, { WARDEN_ANTHROPIC_API_KEY: '' });
    assert.equal(result.status, 0);
    assert.match(result.stderr, /no WARDEN_ANTHROPIC_API_KEY/);
    assert.match(result.stderr, /docs\/PR_FLOW\.md/);
    assert.doesNotMatch(result.stderr, /NOT blocked/);
  });

  it('skips the pre-push branch review unless WARDEN_PUSH_REVIEW=on', () => {
    const logDir = mkdtempSync(join(tmpdir(), 'jovie-warden-push-'));
    temporaryDirectories.push(logDir);
    const { bin } = makeWardenStub({ marker: join(logDir, 'args') });
    const result = runHook('branch', bin, { WARDEN_PUSH_REVIEW: '' });
    assert.equal(result.status, 0);
    assert.equal(existsSync(join(logDir, 'args')), false);
  });

  it('stops before the model when the free first pass skips the diff', () => {
    const repo = mkdtempSync(join(tmpdir(), 'jovie-warden-repo-'));
    temporaryDirectories.push(repo);
    const git = args =>
      spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
    git(['init', '-q']);
    writeFileSync(join(repo, 'README.md'), 'docs only\n');
    git(['add', 'README.md']);
    const logDir = mkdtempSync(join(tmpdir(), 'jovie-warden-triage-'));
    temporaryDirectories.push(logDir);
    const { bin } = makeWardenStub({ marker: join(logDir, 'args') });
    const result = spawnSync('bash', [script, 'staged'], {
      cwd: repo,
      encoding: 'utf8',
      env: localHookChildEnv(configuredEnv({ WARDEN_TRIAGE: 'on' }), bin),
    });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /free first pass: only docs/);
    assert.equal(existsSync(join(logDir, 'args')), false);
  });

  it('names the cause when Warden reports an auth failure', () => {
    const bin = makeStub(
      'warden',
      'echo "security-review - FAILED (auth_failed)" >&2\nexit 1'
    );
    const result = runHook('staged', bin);
    assert.equal(result.status, 0);
    assert.match(result.stderr, /auth_failed/);
    assert.match(result.stderr, /rejected WARDEN_ANTHROPIC_API_KEY/);
    assert.match(result.stderr, /NOT blocked/);
  });

  const hasTimeout =
    spawnSync('bash', ['-c', 'command -v timeout || command -v gtimeout'])
      .status === 0;

  it('reports a timeout without blocking', { skip: !hasTimeout }, () => {
    const bin = makeStub('warden', 'sleep 5');
    const result = runHook('staged', bin, { WARDEN_TIMEOUT_SECONDS: '1' });
    assert.equal(result.status, 0);
    assert.match(result.stderr, /timed out after 1s/);
  });

  it('pins Haiku 5.5 for both the agent and auxiliary models', () => {
    const toml = readFileSync(resolve(repoRoot, 'warden.toml'), 'utf8');
    assert.match(
      toml,
      /\[defaults\.agent\]\s*\nmodel = "anthropic\/claude-haiku-5-5"/
    );
    assert.match(
      toml,
      /\[defaults\.auxiliary\]\s*\nmodel = "anthropic\/claude-haiku-5-5"/
    );
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
    const recorded = readFileSync(join(logDir, 'args'), 'utf8');
    assert.match(recorded, /^--staged\ninvoked\n/);
  });

  it('still invokes warden when the parent process has CI set', () => {
    const previous = process.env.CI;
    process.env.CI = 'true';
    const marker = join(tmpdir(), `jovie-warden-ci-${process.pid}`);
    try {
      const { bin } = makeWardenStub({ exitCode: 1, marker });
      const result = runHook('branch', bin);
      assert.equal(result.status, 0);
      assert.match(readFileSync(marker, 'utf8'), /invoked/);
      assert.match(result.stderr, /NOT blocked/);
    } finally {
      if (previous === undefined) delete process.env.CI;
      else process.env.CI = previous;
      rmSync(marker, { force: true });
    }
  });

  it('requires every CI-skipping hook test to isolate ambient CI', () => {
    assert.deepEqual(localHookTestsMissingCiIsolation(repoRoot), []);
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
