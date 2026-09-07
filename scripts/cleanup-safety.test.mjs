import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

const scripts = resolve('scripts');
const old = new Date(Date.now() - 30 * 86400_000);

function put(root, relative, value = 'preserve me') {
  const target = join(root, relative);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, value);
  utimesSync(target, old, old);
  return target;
}

function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'jovie-cleanup-safety-'));
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Cleanup Safety Test');
  put(root, 'tracked.txt', 'committed');
  git(root, 'add', 'tracked.txt');
  git(root, 'commit', '-qm', 'fixture');
  put(root, 'tracked.txt', 'dirty');
  put(root, 'untracked.txt');
  put(root, '.claude/worktrees/unknown/source.txt');
  put(root, '.claude/worktrees/unknown/node_modules/payload');
  put(root, 'node_modules/payload');
  put(root, 'apps/web/.next/cache/pack/payload', Buffer.alloc(8192));
  put(root, '.git/objects/pack/tmp_pack_old');
  put(root, '.DS_Store');
  for (let day = 1; day <= 15; day++) {
    put(
      root,
      `.tech-debt/paydown-report-202607${String(day).padStart(2, '0')}-010000.md`
    );
  }
  return root;
}

function run(root, script, args = [], extraEnv = {}) {
  return spawnSync('bash', [join(scripts, script), ...args], {
    cwd: root,
    input: '{"hook_event_name":"Stop"}',
    encoding: 'utf8',
    timeout: 10_000,
    env: {
      ...process.env,
      JOVIE_CLEANUP_TEST_MODE: '1',
      JOVIE_CLEANUP_REPO_ROOT: root,
      JOVIE_NEXT_CACHE_MAX_KIB: '1',
      CODEX_CLEANUP_SKIP_GBRAIN: '1',
      ...extraEnv,
    },
  });
}

test('archive preserves dirty, untracked, nested worktrees and shared Git registrations', () => {
  const root = fixture();
  try {
    const nested = join(root, '.claude/worktrees/registered');
    git(root, 'worktree', 'add', '-q', '-b', 'fixture-work', nested);
    put(nested, 'tracked.txt', 'nested dirty');
    put(nested, 'untracked.txt', 'nested untracked');
    // A temporarily unavailable worktree is not proof that it was abandoned.
    const moved = join(root, '.claude/worktrees/moved');
    renameSync(nested, moved);
    const registration = join(root, '.git/worktrees/registered/gitdir');
    const before = readFileSync(registration, 'utf8');
    const result = run(root, 'archive.sh');
    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.stdout,
      /verified task\/allocation release is required/
    );
    assert.equal(readFileSync(join(root, 'tracked.txt'), 'utf8'), 'dirty');
    assert.ok(existsSync(join(root, 'untracked.txt')));
    assert.equal(
      readFileSync(join(moved, 'tracked.txt'), 'utf8'),
      'nested dirty'
    );
    assert.equal(
      readFileSync(join(moved, 'untracked.txt'), 'utf8'),
      'nested untracked'
    );
    assert.equal(readFileSync(registration, 'utf8'), before);
    assert.ok(existsSync(join(root, '.claude/worktrees/unknown/source.txt')));
    assert.ok(existsSync(join(root, 'node_modules/payload')));
    assert.ok(existsSync(join(root, '.DS_Store')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('default cleanup and Stop with explicit apply cannot release a task or invoke external cleanup', () => {
  const root = fixture();
  try {
    const fakeBin = join(root, 'bin');
    const sentinel = join(root, 'external-called');
    for (const name of ['doppler', 'pnpm']) {
      const command = put(
        root,
        `bin/${name}`,
        `#!/bin/sh\ntouch '${sentinel}'\nexit 99\n`
      );
      execFileSync('chmod', ['+x', command]);
    }
    for (const args of [[], ['--codex-hook', '--apply']]) {
      const result = run(root, 'codex-cleanup.sh', args, {
        PATH: `${fakeBin}:${process.env.PATH}`,
        CODEX_ARCHIVE_ON_STOP: '1',
        CODEX_CLEANUP_E2E_USERS: '1',
      });
      assert.equal(result.status, 0, result.stderr);
      if (args.length)
        assert.deepEqual(JSON.parse(result.stdout), { continue: true });
      assert.ok(existsSync(join(root, '.DS_Store')));
      assert.ok(
        existsSync(join(root, '.tech-debt/paydown-report-20260701-010000.md'))
      );
      assert.ok(existsSync(join(root, 'apps/web/.next/cache/pack/payload')));
      assert.ok(existsSync(join(root, '.git/objects/pack/tmp_pack_old')));
      assert.equal(existsSync(sentinel), false);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('explicit apply preserves unreleased caches and Git packs while retaining completed artifact policy', () => {
  const root = fixture();
  try {
    const result = run(root, 'codex-cleanup.sh', ['--apply']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Cleanup debt.*no verified allocation release/);
    assert.ok(existsSync(join(root, 'apps/web/.next/cache/pack/payload')));
    assert.ok(existsSync(join(root, '.git/objects/pack/tmp_pack_old')));
    assert.equal(
      existsSync(join(root, '.tech-debt/paydown-report-20260701-010000.md')),
      false
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('owner bypass and fabricated test mode fail closed at the runtime executable', () => {
  const root = mkdtempSync(join(tmpdir(), 'unowned-cleanup-fixture-'));
  try {
    const metadata = put(root, '.DS_Store');
    const hook = run(root, 'codex-cleanup.sh', ['--codex-hook', '--apply'], {
      JOVIE_SETUP_CACHE_SKIP_OWNER_CHECK: '1',
    });
    assert.equal(hook.status, 2, hook.stderr);
    assert.match(hook.stderr, /Owner-check bypass is not supported/);
    for (const flags of [
      { JOVIE_SETUP_CACHE_SKIP_OWNER_CHECK: '1' },
      { JOVIE_CLEANUP_TEST_MODE: '1' },
      {
        JOVIE_SETUP_CACHE_TEST_MODE: '1',
        JOVIE_SETUP_CACHE_SKIP_OWNER_CHECK: '1',
      },
    ]) {
      const result = spawnSync(
        process.execPath,
        [
          join(scripts, 'local-runtime-retention.mjs'),
          '--apply',
          '--repo-root',
          root,
        ],
        {
          encoding: 'utf8',
          timeout: 10_000,
          env: {
            ...process.env,
            JOVIE_CLEANUP_TEST_MODE: '0',
            JOVIE_SETUP_CACHE_TEST_MODE: '0',
            ...flags,
          },
        }
      );
      assert.equal(result.status, 1, result.stderr);
      assert.match(
        result.stderr,
        /Owner-check bypass|temporary retention or cleanup fixture/
      );
      assert.ok(existsSync(metadata));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
