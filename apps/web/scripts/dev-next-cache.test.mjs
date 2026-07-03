import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  countAppRoutes,
  evaluateDevNextCache,
  getCompiledRoutesMtimeMs,
  getNewestAppRouteSourceMtimeMs,
} from './lib/dev-next-cache.mjs';

/** @param {string} filePath */
function setMtime(filePath, mtimeMs) {
  const date = new Date(mtimeMs);
  utimesSync(filePath, date, date);
}

test('countAppRoutes counts page and route handler files', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'jovie-dev-cache-test-'));

  try {
    mkdirSync(path.join(root, 'hud'), { recursive: true });
    mkdirSync(path.join(root, 'api', 'health'), { recursive: true });
    writeFileSync(path.join(root, 'hud', 'page.tsx'), '');
    writeFileSync(path.join(root, 'api', 'health', 'route.ts'), '');

    assert.deepEqual(countAppRoutes(root), {
      pages: 1,
      routeHandlers: 1,
      total: 2,
    });
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('evaluateDevNextCache resets when app route sources are newer than compiled manifest', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'jovie-dev-cache-test-'));
  const appDir = path.join(root, 'app');
  const compiledRoutesDir = path.join(root, '.next', 'server', 'app');

  try {
    mkdirSync(path.join(appDir, 'hud'), { recursive: true });
    mkdirSync(compiledRoutesDir, { recursive: true });

    const pagePath = path.join(appDir, 'hud', 'page.tsx');
    writeFileSync(pagePath, '');
    setMtime(pagePath, Date.now());
    setMtime(compiledRoutesDir, Date.now() - 60_000);

    const decision = evaluateDevNextCache({ appDir, compiledRoutesDir });
    assert.equal(decision.action, 'reset');
    assert.equal(decision.reason, 'source-newer-than-compiled-manifest');
    assert.equal(decision.routes.pages, 1);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('evaluateDevNextCache keeps cache when compiled manifest is newer', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'jovie-dev-cache-test-'));
  const appDir = path.join(root, 'app');
  const compiledRoutesDir = path.join(root, '.next', 'server', 'app');

  try {
    mkdirSync(path.join(appDir, 'hud'), { recursive: true });
    mkdirSync(compiledRoutesDir, { recursive: true });

    const pagePath = path.join(appDir, 'hud', 'page.tsx');
    writeFileSync(pagePath, '');
    setMtime(pagePath, Date.now() - 120_000);
    setMtime(compiledRoutesDir, Date.now());

    const decision = evaluateDevNextCache({ appDir, compiledRoutesDir });
    assert.equal(decision.action, 'keep');
    assert.equal(decision.reason, 'compiled-manifest-fresh');
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('evaluateDevNextCache keeps cache when compiled manifest is missing', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'jovie-dev-cache-test-'));
  const appDir = path.join(root, 'app');

  try {
    mkdirSync(path.join(appDir, 'signin'), { recursive: true });
    writeFileSync(path.join(appDir, 'signin', 'page.tsx'), '');

    const decision = evaluateDevNextCache({
      appDir,
      compiledRoutesDir: path.join(root, '.next', 'server', 'app'),
    });
    assert.equal(decision.action, 'keep');
    assert.equal(decision.reason, 'no-compiled-manifest');
    assert.equal(getCompiledRoutesMtimeMs(path.join(root, '.next', 'server', 'app')), null);
    assert.ok(getNewestAppRouteSourceMtimeMs(appDir) !== null);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('evaluateDevNextCache honors force reset and skip-check flags', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'jovie-dev-cache-test-'));
  const appDir = path.join(root, 'app');
  const compiledRoutesDir = path.join(root, '.next', 'server', 'app');

  try {
    mkdirSync(compiledRoutesDir, { recursive: true });
    setMtime(compiledRoutesDir, Date.now());

    assert.equal(
      evaluateDevNextCache({ appDir, compiledRoutesDir, forceReset: true }).action,
      'reset'
    );
    assert.equal(
      evaluateDevNextCache({ appDir, compiledRoutesDir, skipCheck: true }).reason,
      'skip-check'
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});