import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  collectPageFiles,
  getNextServerAppMtimeMs,
  resetNextCacheIfStale,
  shouldResetNextCache,
  summarizePageFiles,
} from './dev-next-cache-guard.mjs';

async function touch(filePath, mtimeMs) {
  const mtime = new Date(mtimeMs);
  await utimes(filePath, mtime, mtime);
}

test('shouldResetNextCache resets when page sources are newer than compiled routes', () => {
  assert.equal(
    shouldResetNextCache({
      newestPageMtimeMs: 2_000,
      nextServerAppMtimeMs: 1_000,
    }),
    true
  );
  assert.equal(
    shouldResetNextCache({
      newestPageMtimeMs: 1_000,
      nextServerAppMtimeMs: 2_000,
    }),
    false
  );
  assert.equal(
    shouldResetNextCache({
      newestPageMtimeMs: null,
      nextServerAppMtimeMs: 1_000,
    }),
    false
  );
  assert.equal(
    shouldResetNextCache({
      newestPageMtimeMs: 1_000,
      nextServerAppMtimeMs: null,
    }),
    false
  );
  assert.equal(
    shouldResetNextCache({
      newestPageMtimeMs: 1_000,
      nextServerAppMtimeMs: 2_000,
      forceReset: true,
    }),
    true
  );
});

test('collectPageFiles finds nested App Router pages', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-next-cache-guard-'));

  try {
    const appDir = path.join(root, 'app');
    await mkdir(path.join(appDir, 'hud'), { recursive: true });
    await mkdir(path.join(appDir, '(auth)', 'signin'), { recursive: true });
    await writeFile(path.join(appDir, 'page.tsx'), 'export default function Page() {}');
    await writeFile(path.join(appDir, 'hud', 'page.tsx'), 'export default function Hud() {}');
    await writeFile(
      path.join(appDir, '(auth)', 'signin', 'page.tsx'),
      'export default function SignIn() {}'
    );

    const pages = await collectPageFiles(appDir);
    assert.equal(pages.length, 3);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('resetNextCacheIfStale removes .next when page sources are newer', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-next-cache-guard-'));
  const messages = [];

  try {
    const appDir = path.join(root, 'app');
    const nextDir = path.join(root, '.next');
    const nextServerAppDir = path.join(nextDir, 'server', 'app');

    await mkdir(path.join(appDir, 'hud'), { recursive: true });
    await mkdir(nextServerAppDir, { recursive: true });
    await writeFile(path.join(appDir, 'hud', 'page.tsx'), 'export default function Hud() {}');
    await writeFile(path.join(nextServerAppDir, 'index.html'), '<html></html>');

    const staleMs = Date.now() - 60_000;
    const freshMs = Date.now();
    await touch(path.join(nextServerAppDir), staleMs);
    await touch(path.join(appDir, 'hud', 'page.tsx'), freshMs);

    const result = await resetNextCacheIfStale({
      appDir,
      nextDir,
      log: message => messages.push(message),
    });

    assert.equal(result.reset, true);
    assert.equal(result.pageCount, 1);
    await assert.rejects(() => stat(nextDir), /ENOENT/);
    assert.match(messages.join('\n'), /Cleared stale \.next cache/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('resetNextCacheIfStale keeps .next when compiled routes are current', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-next-cache-guard-'));

  try {
    const appDir = path.join(root, 'app');
    const nextDir = path.join(root, '.next');
    const nextServerAppDir = path.join(nextDir, 'server', 'app');

    await mkdir(path.join(appDir, 'hud'), { recursive: true });
    await mkdir(nextServerAppDir, { recursive: true });
    await writeFile(path.join(appDir, 'hud', 'page.tsx'), 'export default function Hud() {}');
    await writeFile(path.join(nextServerAppDir, 'index.html'), '<html></html>');

    const freshMs = Date.now();
    const staleMs = Date.now() - 60_000;
    await touch(path.join(nextServerAppDir), freshMs);
    await touch(path.join(appDir, 'hud', 'page.tsx'), staleMs);

    const result = await resetNextCacheIfStale({
      appDir,
      nextDir,
    });

    assert.equal(result.reset, false);
    assert.equal(result.pageCount, 1);
    await stat(nextDir);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('summarizePageFiles and getNextServerAppMtimeMs handle missing paths', async () => {
  const summary = await summarizePageFiles([]);
  assert.deepEqual(summary, { count: 0, newestMtimeMs: null });
  assert.equal(
    await getNextServerAppMtimeMs(path.join(tmpdir(), 'missing-next-server-app')),
    null
  );
});