import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

const setupScript = resolve('scripts/setup.sh');
const cachePaths = [
  'apps/web/.next/dev/cache/turbopack/cache.bin',
  'apps/web/.next/cache/turbopack/cache.bin',
  'apps/web/.next/cache/pack/cache.bin',
];

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'jovie-setup-cache-'));
  for (const path of cachePaths) {
    const absolute = join(root, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, Buffer.alloc(1024));
  }
  return root;
}

function ageTree(target, date) {
  const stats = statSync(target);
  if (stats.isDirectory()) {
    for (const entry of readdirSync(target)) ageTree(join(target, entry), date);
  }
  utimesSync(target, date, date);
}

function runCacheCleanup(root, env = {}) {
  return spawnSync('bash', [setupScript], {
    cwd: resolve('.'),
    encoding: 'utf8',
    env: {
      ...process.env,
      JOVIE_SETUP_CACHE_ONLY: '1',
      JOVIE_SETUP_CACHE_ROOT: root,
      JOVIE_SETUP_CACHE_SKIP_OWNER_CHECK: '1',
      JOVIE_SETUP_CACHE_TEST_MODE: '1',
      ...env,
    },
  });
}

test('preserves current and legacy caches while their combined size is within the bound', () => {
  const root = createFixture();
  try {
    const result = runCacheCleanup(root, { JOVIE_NEXT_CACHE_MAX_KIB: '100' });
    assert.equal(result.status, 0, result.stderr);
    for (const path of cachePaths) assert.ok(existsSync(join(root, path)));
    assert.match(result.stdout, /Preserved Next cache/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('reports oversized current and legacy caches as unreleased debt', () => {
  const root = createFixture();
  try {
    const result = runCacheCleanup(root, { JOVIE_NEXT_CACHE_MAX_KIB: '1' });
    assert.equal(result.status, 0, result.stderr);
    for (const path of cachePaths) assert.ok(existsSync(join(root, path)));
    assert.match(result.stdout, /no verified allocation release, preserved/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('preserves oversized caches when lsof is unavailable', () => {
  const root = createFixture();
  try {
    const result = runCacheCleanup(root, {
      JOVIE_NEXT_CACHE_MAX_KIB: '1',
      JOVIE_SETUP_CACHE_SKIP_OWNER_CHECK: '0',
      JOVIE_SETUP_CACHE_TEST_NO_LSOF: '1',
    });
    assert.equal(result.status, 0, result.stderr);
    for (const path of cachePaths) assert.ok(existsSync(join(root, path)));
    assert.match(result.stdout, /no verified allocation release, preserved/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('explicit reset cannot release caches even when they are below the bound', () => {
  const root = createFixture();
  try {
    const result = runCacheCleanup(root, {
      JOVIE_DEV_RESET_NEXT_CACHE: '1',
      JOVIE_NEXT_CACHE_MAX_KIB: '100',
    });
    assert.equal(result.status, 0, result.stderr);
    for (const path of cachePaths) assert.ok(existsSync(join(root, path)));
    assert.match(result.stdout, /reset deferred/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('setup reports stale full Next dev output without treating setup as allocation release', () => {
  const root = createFixture();
  try {
    const payload = join(root, 'apps/web/.next/dev/server/payload.bin');
    mkdirSync(dirname(payload), { recursive: true });
    writeFileSync(payload, Buffer.alloc(16 * 1024, 1));
    ageTree(
      join(root, 'apps/web/.next/dev'),
      new Date(Date.now() - 2 * 60 * 60 * 1000)
    );
    const result = runCacheCleanup(root, {
      JOVIE_CLEANUP_TEST_MODE: '1',
      JOVIE_NEXT_CACHE_MAX_KIB: '999999',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(join(root, 'apps/web/.next/dev')));
    assert.match(result.stdout, /Cleanup debt apps\/web\/\.next\/dev/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('setup shared retention entrypoint only reports completed artifacts and metadata', () => {
  const root = createFixture();
  try {
    mkdirSync(join(root, '.tech-debt'));
    for (let day = 1; day <= 15; day++) {
      writeFileSync(
        join(
          root,
          `.tech-debt/paydown-report-202607${String(day).padStart(2, '0')}-010000.md`
        ),
        'completed report'
      );
    }
    const metadata = join(root, '.DS_Store');
    writeFileSync(metadata, 'metadata');
    const result = runCacheCleanup(root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Generated artifact retention \(dry-run\)/);
    assert.match(result.stdout, /wouldRemove=1/);
    assert.equal(readdirSync(join(root, '.tech-debt')).length, 15);
    assert.ok(existsSync(metadata));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('preserves external data behind a symlinked Next ancestor', () => {
  const root = createFixture();
  const outside = mkdtempSync(join(tmpdir(), 'jovie-setup-outside-'));
  try {
    rmSync(join(root, 'apps/web/.next'), { recursive: true, force: true });
    const payload = join(outside, 'dev/cache/turbopack/cache.bin');
    mkdirSync(dirname(payload), { recursive: true });
    writeFileSync(payload, Buffer.alloc(2048));
    symlinkSync(outside, join(root, 'apps/web/.next'));

    const result = runCacheCleanup(root, { JOVIE_NEXT_CACHE_MAX_KIB: '0' });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(payload));
    assert.match(result.stdout, /Preserved unsafe or symlinked Next cache/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('rejects cache-root overrides outside explicit setup test mode', () => {
  const root = createFixture();
  try {
    const result = spawnSync('bash', [setupScript], {
      cwd: resolve('.'),
      encoding: 'utf8',
      env: {
        ...process.env,
        JOVIE_SETUP_CACHE_ONLY: '1',
        JOVIE_SETUP_CACHE_ROOT: root,
      },
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /restricted to explicit test mode/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
