import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'vitest';

import {
  ensureDevNextCacheFresh,
  formatDevRouteDiscoveryLog,
  getCompiledRoutesMtimeMs,
  scanAppRouteSources,
} from './ensure-dev-next-cache.mjs';

function touch(filePath, mtime) {
  writeFileSync(filePath, `// ${path.basename(filePath)}\n`);
  const atime = mtime;
  utimesSync(filePath, atime, mtime);
}

test('scanAppRouteSources counts page and route handlers', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'jovie-dev-cache-scan-'));

  try {
    mkdirSync(path.join(root, 'hud'), { recursive: true });
    mkdirSync(path.join(root, 'api', 'health'), { recursive: true });
    touch(path.join(root, 'hud', 'page.tsx'), new Date('2026-07-01T00:00:00Z'));
    touch(
      path.join(root, 'api', 'health', 'route.ts'),
      new Date('2026-07-02T00:00:00Z')
    );

    const summary = scanAppRouteSources(root);

    assert.equal(summary.pageRoutes, 1);
    assert.equal(summary.apiRoutes, 1);
    assert.equal(
      summary.newestMtimeMs,
      statSync(path.join(root, 'api', 'health', 'route.ts')).mtimeMs
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('ensureDevNextCacheFresh wipes .next when source routes are newer', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'jovie-dev-cache-stale-'));
  const appDir = path.join(root, 'app');
  const nextDir = path.join(root, '.next');
  const compiledRoutesDir = path.join(nextDir, 'server', 'app');

  try {
    mkdirSync(path.join(appDir, 'hud'), { recursive: true });
    mkdirSync(compiledRoutesDir, { recursive: true });

    touch(
      path.join(compiledRoutesDir, 'manifest.json'),
      new Date('2026-06-20T00:00:00Z')
    );
    touch(
      path.join(appDir, 'hud', 'page.tsx'),
      new Date('2026-07-03T00:00:00Z')
    );

    const summary = ensureDevNextCacheFresh({
      appDir,
      nextDir,
      skipStaleCheck: false,
      forceReset: false,
    });

    assert.equal(summary.cacheState, 'stale');
    assert.throws(() => statSync(nextDir), /ENOENT/);
    assert.match(formatDevRouteDiscoveryLog(summary), /wiped stale \.next/);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('ensureDevNextCacheFresh keeps cache when compiled routes are newer', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'jovie-dev-cache-fresh-'));
  const appDir = path.join(root, 'app');
  const nextDir = path.join(root, '.next');
  const compiledRoutesDir = path.join(nextDir, 'server', 'app');

  try {
    mkdirSync(path.join(appDir, 'hud'), { recursive: true });
    mkdirSync(compiledRoutesDir, { recursive: true });

    touch(
      path.join(appDir, 'hud', 'page.tsx'),
      new Date('2026-06-20T00:00:00Z')
    );
    touch(
      path.join(compiledRoutesDir, 'manifest.json'),
      new Date('2026-07-03T00:00:00Z')
    );

    const summary = ensureDevNextCacheFresh({
      appDir,
      nextDir,
      skipStaleCheck: false,
      forceReset: false,
    });

    assert.equal(summary.cacheState, 'fresh');
    assert.ok(statSync(nextDir).isDirectory());
    assert.match(
      formatDevRouteDiscoveryLog(summary),
      /compiled route cache is fresh/
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('getCompiledRoutesMtimeMs returns null when compiled routes are missing', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'jovie-dev-cache-missing-'));

  try {
    assert.equal(
      getCompiledRoutesMtimeMs(path.join(root, 'server', 'app')),
      null
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
