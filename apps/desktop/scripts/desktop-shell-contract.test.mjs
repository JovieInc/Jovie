import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';

const desktopRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test('desktop window enters the authenticated app shell instead of the web root', async () => {
  const mainSource = await readFile(join(desktopRoot, 'src/main.ts'), 'utf8');

  assert.match(
    mainSource,
    /const APP_ENTRY_URL = new URL\('\/app', APP_URL\)\.toString\(\);/
  );
  assert.match(
    mainSource,
    /function createWindow\(initialUrl = APP_ENTRY_URL\): BrowserWindow/
  );
  assert.doesNotMatch(
    mainSource,
    /function createWindow\(initialUrl = APP_URL\): BrowserWindow/
  );
});

test('preload marks the hosted app as Electron after the document root is ready', async () => {
  const preloadSource = await readFile(
    join(desktopRoot, 'src/preload.ts'),
    'utf8'
  );

  assert.match(preloadSource, /function installElectronRuntimeMarker\(\)/);
  assert.match(preloadSource, /markElectronRuntime\(\)/);
  assert.match(preloadSource, /DOMContentLoaded/);
  assert.match(preloadSource, /dataset\.desktopRuntime = 'electron'/);
});
