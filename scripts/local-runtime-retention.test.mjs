import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

const retentionScript = resolve('scripts/local-runtime-retention.mjs');
const oldDate = new Date(Date.now() - 2 * 60 * 60 * 1000);

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function createRepo() {
  const root = mkdtempSync(join(tmpdir(), 'jovie-runtime-retention-'));
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Runtime Retention Test']);
  writeFileSync(
    join(root, '.gitignore'),
    '.claude/worktrees/\nnode_modules/\napps/web/.next/\n'
  );
  writeFileSync(join(root, 'tracked.txt'), 'clean\n');
  git(root, ['add', '.gitignore', 'tracked.txt']);
  git(root, ['commit', '-qm', 'test fixture']);
  return root;
}

function ageTree(target) {
  const stats = lstatSync(target);
  if (stats.isDirectory() && !stats.isSymbolicLink()) {
    for (const entry of readdirSync(target)) ageTree(join(target, entry));
  }
  utimesSync(target, oldDate, oldDate);
}

function createSizedDirectory(target) {
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, 'payload.bin'), Buffer.alloc(16 * 1024, 1));
  ageTree(target);
}

function addWorktree(root, name) {
  const target = join(root, '.claude/worktrees', name);
  mkdirSync(dirname(target), { recursive: true });
  git(root, ['worktree', 'add', '-q', '-b', `test-${name}`, target]);
  createSizedDirectory(join(target, 'node_modules'));
  return target;
}

function runRetention(root, mode, options = {}) {
  return spawnSync('node', [retentionScript, mode, '--repo-root', root], {
    cwd: options.cwd ?? resolve('.'),
    encoding: 'utf8',
    env: {
      ...process.env,
      JOVIE_CLEANUP_TEST_MODE: '1',
    },
  });
}

test('full Next dev output is dry-run safe and removed only when stale and oversized', () => {
  const root = createRepo();
  const nextDev = join(root, 'apps/web/.next/dev');
  try {
    createSizedDirectory(nextDev);
    const dryRun = runRetention(root, '--dry-run');
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.ok(existsSync(nextDev));
    assert.match(dryRun.stdout, /Would remove apps\/web\/\.next\/dev/);

    const apply = runRetention(root, '--apply');
    assert.equal(apply.status, 0, apply.stderr);
    assert.equal(existsSync(nextDev), false);

    createSizedDirectory(nextDev);
    utimesSync(join(nextDev, 'payload.bin'), new Date(), new Date());
    const young = runRetention(root, '--apply');
    assert.equal(young.status, 0, young.stderr);
    assert.ok(existsSync(nextDev));

    ageTree(nextDev);
    writeFileSync(join(nextDev, '.jovie-retention-active-test'), 'active');
    ageTree(nextDev);
    const active = runRetention(root, '--apply');
    assert.equal(active.status, 0, active.stderr);
    assert.ok(existsSync(nextDev));
    assert.match(active.stderr, /active owner or dev process/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('separately managed cache metadata cannot mask stale full Next dev output', () => {
  const root = createRepo();
  const nextDev = join(root, 'apps/web/.next/dev');
  try {
    createSizedDirectory(join(nextDev, 'server'));
    mkdirSync(join(nextDev, 'cache'), { recursive: true });
    writeFileSync(join(nextDev, '.DS_Store'), 'metadata');
    const result = runRetention(root, '--apply');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(nextDev), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Finder metadata is reported in bytes and removed only from repo-controlled trees', () => {
  const root = createRepo();
  const outside = mkdtempSync(join(tmpdir(), 'jovie-runtime-external-'));
  try {
    const covered = [
      join(root, '.DS_Store'),
      join(root, '.turbo/preferences/.DS_Store'),
      join(root, 'apps/web/public/.DS_Store'),
    ];
    for (const target of covered) {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, 'finder metadata');
    }

    const excluded = [
      join(root, '.git/.DS_Store'),
      join(root, '.kandan/.DS_Store'),
      join(root, 'node_modules/.DS_Store'),
      join(root, 'apps/web/node_modules/.DS_Store'),
      join(root, '.claude/worktrees/unregistered/.DS_Store'),
    ];
    for (const target of excluded) {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, 'preserve');
    }
    writeFileSync(join(outside, '.DS_Store'), 'external');
    symlinkSync(outside, join(root, 'external-shared'));

    const dryRun = runRetention(root, '--dry-run');
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.match(
      dryRun.stdout,
      /Would remove \.turbo\/preferences\/\.DS_Store \(15 bytes;/
    );
    for (const target of [
      ...covered,
      ...excluded,
      join(outside, '.DS_Store'),
    ]) {
      assert.ok(existsSync(target), target);
    }

    const apply = runRetention(root, '--apply');
    assert.equal(apply.status, 0, apply.stderr);
    assert.match(apply.stdout, /3 candidate\(s\), 45 bytes reclaimed/);
    for (const target of covered) assert.equal(existsSync(target), false);
    for (const target of [...excluded, join(outside, '.DS_Store')]) {
      assert.ok(existsSync(target), target);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('active Finder metadata fails closed without unlinking the candidate', () => {
  const root = createRepo();
  const metadata = join(root, '.turbo/.DS_Store');
  try {
    mkdirSync(dirname(metadata), { recursive: true });
    writeFileSync(metadata, 'active metadata');
    writeFileSync(`${metadata}.jovie-retention-active-test`, 'active');

    const apply = runRetention(root, '--apply');
    assert.equal(apply.status, 1);
    assert.match(apply.stderr, /Refusing active Finder metadata/);
    assert.ok(existsSync(metadata));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('worktree cleanup removes only registered, unlocked, clean, inactive old dependencies', () => {
  const root = createRepo();
  try {
    const eligible = addWorktree(root, 'eligible');
    const dirty = addWorktree(root, 'dirty');
    writeFileSync(join(dirty, 'tracked.txt'), 'dirty\n');
    const locked = addWorktree(root, 'locked');
    git(root, ['worktree', 'lock', locked]);
    const active = addWorktree(root, 'active');
    writeFileSync(
      join(active, 'node_modules/.jovie-retention-active-test'),
      'active'
    );
    ageTree(join(active, 'node_modules'));

    const unregistered = join(root, '.claude/worktrees/unregistered');
    createSizedDirectory(join(unregistered, 'node_modules'));
    const outside = join(root, 'outside-worktree');
    createSizedDirectory(join(outside, 'node_modules'));
    symlinkSync(outside, join(root, '.claude/worktrees/symlinked'));

    const result = runRetention(root, '--apply');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(eligible, 'node_modules')), false);
    for (const preserved of [dirty, locked, active, unregistered, outside]) {
      assert.ok(existsSync(join(preserved, 'node_modules')), preserved);
    }
    assert.match(result.stderr, /worktree is dirty/);
    assert.match(result.stderr, /worktree is active/);
    assert.match(result.stdout, /1 candidate\(s\)/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the currently executing worktree is always preserved', () => {
  const root = createRepo();
  try {
    const current = addWorktree(root, 'current');
    const result = runRetention(root, '--apply', { cwd: current });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(join(current, 'node_modules')));
    assert.match(result.stdout, /0 candidate\(s\)/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
